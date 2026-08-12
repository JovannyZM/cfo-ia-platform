import {
  EXPENSE_INFORMATION_REQUIRED,
  EXPENSE_REGISTERED,
  type DomainEvent,
  type DomainEventHandler,
  type EventBus,
} from '@cfo-ia/domain';
import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import type { ConversationSessionService } from '../conversations/conversation-session.service';
import type { PrismaService } from '../prisma.service';
import { EvidenceController } from './evidence.controller';
import { MultiPagePdfError, type PdfEvidenceProcessor } from './pdf-evidence-processor';

const knownDraft = {
  merchantName: 'Costco',
  description: 'Compra de insumos',
  occurredAt: '2026-08-04T12:00:00.000Z',
  originalAmount: '598.20',
  originalCurrency: 'MXN',
  category: 'INSUMOS',
  paymentLast4: '1234',
  sourceChannel: 'TELEGRAM',
  sourceConversationId: '99',
};

function controllerForResult(
  result: 'REGISTERED' | readonly string[],
  existingFingerprint: { id: string } | null = null,
  pdfProcessor: PdfEvidenceProcessor = { process: vi.fn() },
) {
  const handlers = new Map<string, DomainEventHandler>();
  const publish = vi.fn(async (event: DomainEvent) => {
    const type = result === 'REGISTERED' ? EXPENSE_REGISTERED : EXPENSE_INFORMATION_REQUIRED;
    await handlers.get(type)?.({
      eventId: 'result-event',
      type,
      workspaceId: event.workspaceId,
      ...(event.correlationId ? { correlationId: event.correlationId } : {}),
      createdAt: new Date(),
      payload: result === 'REGISTERED'
        ? { expenseId: 'expense-id' }
        : { missingFields: result, draft: knownDraft },
    });
  });
  const eventBus = {
    publish,
    subscribe: vi.fn((type: string, handler: DomainEventHandler) => {
      handlers.set(type, handler);
      return () => handlers.delete(type);
    }),
  } as unknown as EventBus;
  const start = vi.fn().mockResolvedValue({ id: 'session-id' });
  const sessions = { start } as unknown as ConversationSessionService;
  const findUnique = vi.fn().mockResolvedValue(existingFingerprint);
  const prisma = { expense: { findUnique } } as unknown as PrismaService;
  return {
    controller: new EvidenceController(eventBus, sessions, prisma, {
      store: vi.fn().mockResolvedValue({}), linkExpense: vi.fn().mockResolvedValue(undefined),
    } as never, pdfProcessor),
    publish,
    start,
    findUnique,
  };
}

const file = {
  buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
  mimetype: 'image/jpeg',
} as Express.Multer.File;
const request = { user: { id: 'user-id' } } as never;
const pdfFile = {
  buffer: Buffer.from('%PDF-1.7 one page fixture'),
  mimetype: 'application/pdf',
} as Express.Multer.File;

describe('EvidenceController incomplete photo sessions', () => {
  it('returns a complete photographed expense without opening a session', async () => {
    const { controller, start } = controllerForResult('REGISTERED');
    const status = vi.fn();
    const result = await controller.upload(
      'workspace-id', file,
      { sourceChannel: 'TELEGRAM', sourceConversationId: '99' },
      request, { status } as unknown as Response,
    );
    expect(status).toHaveBeenCalledWith(HttpStatus.CREATED);
    expect(result).toEqual({ expense: { expenseId: 'expense-id' } });
    expect(start).not.toHaveBeenCalled();
  });

  it.each([
    [['spenderName'], 'spenderName'],
    [['paymentMethod'], 'paymentMethod'],
    [['spenderName', 'paymentMethod'], 'spenderName'],
  ] as const)('persists all known fields when missing %j', async (missingFields, firstField) => {
    const { controller, start, publish } = controllerForResult(missingFields);
    const status = vi.fn();
    const result = await controller.upload(
      'workspace-id', file,
      { sourceChannel: 'TELEGRAM', sourceConversationId: '99' },
      request, { status } as unknown as Response,
    );
    expect(status).toHaveBeenCalledWith(HttpStatus.ACCEPTED);
    expect(start).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'workspace-id',
      sourceChannel: 'TELEGRAM',
      sourceConversationId: '99',
      userId: 'user-id',
      intentType: 'NEW_EXPENSE',
      pendingField: firstField,
      contextJson: expect.objectContaining({
        draft: knownDraft,
        missingFields,
        sourceEventId: expect.any(String),
        captureSource: 'EVIDENCE',
      }),
    }));
    expect(result).toMatchObject({ status: 'NEEDS_INFORMATION', missingFields });
    expect(publish).toHaveBeenCalledOnce();
  });

  it('returns an exact-image duplicate before publishing to OpenAI', async () => {
    const { controller, publish, start, findUnique } =
      controllerForResult('REGISTERED', { id: 'existing-expense' });
    const status = vi.fn();
    const result = await controller.upload(
      'workspace-id',
      file,
      { sourceChannel: 'TELEGRAM', sourceConversationId: '99' },
      request,
      { status } as unknown as Response,
    );
    expect(findUnique).toHaveBeenCalledOnce();
    expect(publish).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(result).toEqual({
      status: 'DUPLICATE_EVIDENCE',
      message: 'Este ticket ya fue registrado.',
      expenseId: 'existing-expense',
    });
  });

  it('publishes an exact image only once across two uploads', async () => {
    const { controller, publish, findUnique } = controllerForResult('REGISTERED');
    findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing-expense' });
    await controller.upload(
      'workspace-id', file,
      { sourceChannel: 'TELEGRAM', sourceConversationId: '99' },
      request, { status: vi.fn() } as unknown as Response,
    );
    const second = await controller.upload(
      'workspace-id', file,
      { sourceChannel: 'TELEGRAM', sourceConversationId: '99' },
      request, { status: vi.fn() } as unknown as Response,
    );
    expect(publish).toHaveBeenCalledOnce();
    expect(second).toMatchObject({ status: 'DUPLICATE_EVIDENCE' });
  });

  it('extracts a one-page text PDF and publishes the same evidence event', async () => {
    const process = vi.fn().mockResolvedValue({
      kind: 'TEXT', text: 'Factura Costco total 598.20 MXN fecha 8 julio 2026',
    });
    const { controller, publish } = controllerForResult('REGISTERED', null, { process });

    await controller.upload(
      'workspace-id', pdfFile,
      { sourceChannel: 'TELEGRAM', sourceConversationId: '99' },
      request, { status: vi.fn() } as unknown as Response,
    );

    expect(process).toHaveBeenCalledWith(pdfFile.buffer);
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({
      image: pdfFile.buffer,
      mimeType: 'application/pdf',
      extractedText: 'Factura Costco total 598.20 MXN fecha 8 julio 2026',
      evidenceSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    }) }));
  });

  it('renders a scanned one-page PDF to an in-memory image before publishing', async () => {
    const rendered = Uint8Array.from([137, 80, 78, 71]);
    const process = vi.fn().mockResolvedValue({ kind: 'IMAGE', image: rendered, mimeType: 'image/png' });
    const { controller, publish } = controllerForResult('REGISTERED', null, { process });

    await controller.upload(
      'workspace-id', pdfFile,
      { sourceChannel: 'TELEGRAM', sourceConversationId: '99' },
      request, { status: vi.fn() } as unknown as Response,
    );

    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({
      image: rendered, mimeType: 'image/png', evidenceSha256: expect.any(String),
    }) }));
    expect(publish.mock.calls[0]?.[0]).not.toHaveProperty('payload.extractedText');
  });

  it('rejects a multi-page PDF without publishing it', async () => {
    const process = vi.fn().mockRejectedValue(new MultiPagePdfError());
    const { controller, publish } = controllerForResult('REGISTERED', null, { process });
    const status = vi.fn();

    const result = await controller.upload(
      'workspace-id', pdfFile,
      { sourceChannel: 'TELEGRAM', sourceConversationId: '99' },
      request, { status } as unknown as Response,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(result).toEqual({
      status: 'MULTI_PAGE_PDF',
      message: 'Este PDF contiene varias páginas. En la versión actual solo se admite un comprobante por PDF.',
    });
    expect(publish).not.toHaveBeenCalled();
  });

  it('deduplicates the exact PDF before parsing or calling the interpreter', async () => {
    const process = vi.fn();
    const { controller, publish } = controllerForResult(
      'REGISTERED', { id: 'existing-expense' }, { process },
    );

    const result = await controller.upload(
      'workspace-id', pdfFile,
      { sourceChannel: 'TELEGRAM', sourceConversationId: '99' },
      request, { status: vi.fn() } as unknown as Response,
    );

    expect(process).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'DUPLICATE_EVIDENCE', message: 'Este comprobante ya fue registrado.',
    });
  });

  it.each([
    [['spenderName'], 'spenderName'],
    [['paymentMethod'], 'paymentMethod'],
  ] as const)('keeps PDF interpretation for conversation continuation when missing %j', async (missing, pending) => {
    const process = vi.fn().mockResolvedValue({ kind: 'TEXT', text: 'Factura de gasto válida con total y fecha' });
    const { controller, start, publish } = controllerForResult(missing, null, { process });

    await controller.upload(
      'workspace-id', pdfFile,
      { sourceChannel: 'TELEGRAM', sourceConversationId: '99' },
      request, { status: vi.fn() } as unknown as Response,
    );

    expect(start).toHaveBeenCalledWith(expect.objectContaining({
      intentType: 'NEW_EXPENSE', pendingField: pending,
      contextJson: expect.objectContaining({ sourceEventId: expect.any(String), captureSource: 'EVIDENCE' }),
    }));
    expect(process).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledOnce();
  });
});
