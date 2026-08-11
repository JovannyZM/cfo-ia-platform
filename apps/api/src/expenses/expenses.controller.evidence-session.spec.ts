import {
  EXPENSE_EVIDENCE_INTERPRETED,
  EXPENSE_INFORMATION_REQUIRED,
  type DomainEvent,
  type DomainEventHandler,
  type EventBus,
} from '@cfo-ia/domain';
import { ConversationIntentType, ConversationSessionStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import type { PrismaService } from '../prisma.service';
import type { ConversationSessionService } from '../conversations/conversation-session.service';
import { LanguageNormalizer } from '../common/language-normalizer';
import type { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';

const baseDraft = {
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

function activeSession(missingFields: string[], draft = baseDraft) {
  return {
    id: 'session-id',
    workspaceId: 'workspace-id',
    sourceChannel: 'TELEGRAM',
    sourceConversationId: '99',
    userId: 'user-id',
    workerId: 'expense-assistant',
    intentType: ConversationIntentType.NEW_EXPENSE,
    status: ConversationSessionStatus.WAITING_INPUT,
    contextJson: {
      draft,
      missingFields,
      sourceEventId: 'original-source-event-id',
      captureSource: 'EVIDENCE',
    },
    pendingField: missingFields[0]!,
    createdAt: new Date(), updatedAt: new Date(), expiresAt: null,
    completedAt: null, cancelledAt: null,
  };
}

function setup(session: ReturnType<typeof activeSession>, nextMissing?: string[]) {
  const handlers = new Map<string, DomainEventHandler>();
  const publish = vi.fn(async (event: DomainEvent) => {
    if (nextMissing) await handlers.get(EXPENSE_INFORMATION_REQUIRED)?.({
      eventId: 'required-event', type: EXPENSE_INFORMATION_REQUIRED,
      workspaceId: event.workspaceId,
      ...(event.correlationId ? { correlationId: event.correlationId } : {}),
      createdAt: new Date(),
      payload: { missingFields: nextMissing, draft: { ...baseDraft, spenderName: 'Jovanny' } },
    });
  });
  const eventBus = {
    publish,
    subscribe: vi.fn((type: string, handler: DomainEventHandler) => {
      handlers.set(type, handler); return () => handlers.delete(type);
    }),
  } as unknown as EventBus;
  const waitForInput = vi.fn().mockResolvedValue({});
  const complete = vi.fn().mockResolvedValue({});
  const cancel = vi.fn().mockResolvedValue({});
  const sessions = {
    getActive: vi.fn().mockResolvedValue(session), waitForInput, complete, cancel,
  } as unknown as ConversationSessionService;
  const getBySourceEventId = vi.fn().mockResolvedValue({
    id: 'expense-id', merchantName: 'Costco', originalAmount: '598.20',
  });
  const expenses = { getBySourceEventId } as unknown as ExpensesService;
  const prisma = {
    workspace: { findUniqueOrThrow: vi.fn().mockResolvedValue({ accountId: 'account-id' }) },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;
  return {
    controller: new ExpensesController(eventBus, expenses, new LanguageNormalizer(), prisma, sessions),
    publish, waitForInput, complete, cancel, getBySourceEventId,
  };
}

const request = { user: { id: 'user-id' } } as never;
const body = { text: 'Jovanny', conversationId: '99', sourceChannel: 'TELEGRAM' } as const;

describe('ExpensesController evidence session continuation', () => {
  it('keeps the interpreted draft and asks only the next missing field', async () => {
    const tools = setup(activeSession(['spenderName', 'paymentMethod']), ['paymentMethod']);
    const status = vi.fn();
    const result = await tools.controller.text(
      'workspace-id', body, request, { status } as unknown as Response,
    );
    expect(tools.publish).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'original-source-event-id',
      type: EXPENSE_EVIDENCE_INTERPRETED,
      payload: expect.objectContaining({ ...baseDraft, spenderName: 'Jovanny' }),
    }));
    expect(tools.waitForInput).toHaveBeenCalledWith(
      'session-id',
      expect.objectContaining({ sourceEventId: 'original-source-event-id', captureSource: 'EVIDENCE' }),
      'paymentMethod',
    );
    expect(result).toMatchObject({ status: 'NEEDS_INFORMATION', missingFields: ['paymentMethod'] });
    expect(tools.getBySourceEventId).not.toHaveBeenCalled();
  });

  it('registers once with the original sourceEventId and completes the session', async () => {
    const tools = setup(activeSession(['spenderName']));
    const result = await tools.controller.text(
      'workspace-id', body, request, { status: vi.fn() } as unknown as Response,
    );
    expect(tools.publish).toHaveBeenCalledOnce();
    expect(tools.publish).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'original-source-event-id', type: EXPENSE_EVIDENCE_INTERPRETED,
    }));
    expect(tools.complete).toHaveBeenCalledWith('session-id');
    expect(tools.getBySourceEventId).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ id: 'expense-id' });
  });

  it('cancels the session without publishing or creating an expense', async () => {
    const tools = setup(activeSession(['spenderName']));
    const result = await tools.controller.text(
      'workspace-id', { ...body, text: 'cancelar' }, request,
      { status: vi.fn() } as unknown as Response,
    );
    expect(tools.cancel).toHaveBeenCalledWith('session-id');
    expect(tools.publish).not.toHaveBeenCalled();
    expect(tools.getBySourceEventId).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'SESSION_CANCELLED' });
  });

  it('completes an unknown card inside the same evidence session', async () => {
    const draft = {
      ...baseDraft,
      paymentMethod: 'DEBIT_CARD',
      paymentInstrumentType: 'CARD' as const,
    };
    const tools = setup(activeSession(['paymentInstrumentDetails'], draft));
    await tools.controller.text(
      'workspace-id',
      { ...body, text: 'BBVA Infinite de Jovanny' },
      request,
      { status: vi.fn() } as unknown as Response,
    );
    expect(tools.publish).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'original-source-event-id',
      payload: expect.objectContaining({
        paymentMethod: 'DEBIT_CARD',
        paymentInstrumentType: 'CARD',
        paymentLast4: '1234',
        paymentInstrumentName: 'BBVA Infinite',
        spenderName: 'Jovanny',
      }),
    }));
    expect(tools.complete).toHaveBeenCalledWith('session-id');
  });
});
