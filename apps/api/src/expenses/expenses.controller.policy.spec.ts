import { HttpStatus } from '@nestjs/common';
import { ConversationIntentType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { EventBus } from '@cfo-ia/domain';
import type { Response } from 'express';
import type { PrismaService } from '../prisma.service';
import type { ConversationSessionService } from '../conversations/conversation-session.service';
import type { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { LanguageNormalizer } from '../common/language-normalizer';

describe('ExpensesController published expense policy', () => {
  it('routes detailed cancellation before new expense and never publishes it', async () => {
    const publish = vi.fn();
    const startLastExpenseCancellation = vi.fn().mockResolvedValue({
      status: 'CANCELLATION_SELECTION_REQUIRED',
      message: '¿Cuál gasto quieres cancelar?',
      candidates: [{
        expenseId: 'expense-id', label: 'Costco', amount: '598.2', currency: 'MXN',
        spenderName: 'Esli', occurredAt: '2026-08-04T12:00:00.000Z',
      }],
    });
    const prisma = {
      workspace: { findUniqueOrThrow: vi.fn().mockResolvedValue({ accountId: 'account-id' }) },
      auditEvent: { create: vi.fn().mockResolvedValue({}) },
      expenseConversation: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const controller = new ExpensesController(
      { publish, subscribe: vi.fn() } as unknown as EventBus,
      { startLastExpenseCancellation } as unknown as ExpensesService,
      new LanguageNormalizer(),
      prisma,
      { getActive: vi.fn().mockResolvedValue(null), start: vi.fn().mockResolvedValue({}) } as unknown as ConversationSessionService,
    );
    const result = await controller.text(
      'workspace-id',
      {
        text: 'Cancela la compra de Costco por 598.20',
        sourceChannel: 'TELEGRAM',
        conversationId: '99',
      },
      { user: { id: 'user-id' } } as never,
      { status: vi.fn() } as unknown as Response,
    );
    expect(startLastExpenseCancellation).toHaveBeenCalledWith(expect.objectContaining({
      criteria: { query: 'costco', amount: '598.20' },
    }));
    expect(publish).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'CANCELLATION_SELECTION_REQUIRED' });
  });

  it('resolves a numbered cancellation selection inside the persisted session', async () => {
    const publish = vi.fn();
    const waitForInput = vi.fn().mockResolvedValue({});
    const startSelectedExpenseCancellation = vi.fn().mockResolvedValue({
      status: 'NEEDS_CANCELLATION_REASON',
      message: '¿Cuál es el motivo de la cancelación?',
      expenseId: 'expense-2',
    });
    const candidates = [
      { expenseId: 'expense-1', label: 'Comida', amount: '450', currency: 'MXN', spenderName: 'JZM', occurredAt: '2026-08-04T12:00:00.000Z' },
      { expenseId: 'expense-2', label: 'Estacionamiento', amount: '300', currency: 'MXN', spenderName: 'JZM', occurredAt: '2026-08-04T12:00:00.000Z' },
    ];
    const controller = new ExpensesController(
      { publish, subscribe: vi.fn() } as unknown as EventBus,
      { startSelectedExpenseCancellation } as unknown as ExpensesService,
      new LanguageNormalizer(),
      {
        workspace: { findUniqueOrThrow: vi.fn().mockResolvedValue({ accountId: 'account-id' }) },
        auditEvent: { create: vi.fn().mockResolvedValue({}) },
      } as unknown as PrismaService,
      {
        getActive: vi.fn().mockResolvedValue({
          id: 'session-id', intentType: ConversationIntentType.CANCELLATION,
          pendingField: 'TARGET_EXPENSE', contextJson: { candidates },
        }),
        waitForInput,
      } as unknown as ConversationSessionService,
    );

    const result = await controller.text(
      'workspace-id',
      { text: '2', sourceChannel: 'TELEGRAM', conversationId: '99' },
      { user: { id: 'user-id' } } as never,
      { status: vi.fn() } as unknown as Response,
    );

    expect(startSelectedExpenseCancellation).toHaveBeenCalledWith({
      workspaceId: 'workspace-id', expenseId: 'expense-2', actorUserId: 'user-id',
    });
    expect(waitForInput).toHaveBeenCalledWith(
      'session-id', { expenseId: 'expense-2' }, 'cancellationReason',
    );
    expect(publish).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'NEEDS_CANCELLATION_REASON' });
  });

  it('keeps an invalid numbered selection inside cancellation and never publishes a new expense', async () => {
    const publish = vi.fn();
    const startSelectedExpenseCancellation = vi.fn();
    const candidates = [{
      expenseId: 'expense-1', label: 'Comida', amount: '450', currency: 'MXN',
      spenderName: 'JZM', occurredAt: '2026-08-04T12:00:00.000Z',
    }];
    const controller = new ExpensesController(
      { publish, subscribe: vi.fn() } as unknown as EventBus,
      { startSelectedExpenseCancellation } as unknown as ExpensesService,
      new LanguageNormalizer(),
      {
        workspace: { findUniqueOrThrow: vi.fn().mockResolvedValue({ accountId: 'account-id' }) },
        auditEvent: { create: vi.fn().mockResolvedValue({}) },
      } as unknown as PrismaService,
      { getActive: vi.fn().mockResolvedValue({
        id: 'session-id', intentType: ConversationIntentType.CANCELLATION,
        pendingField: 'TARGET_EXPENSE', contextJson: { candidates },
      }) } as unknown as ConversationSessionService,
    );

    const result = await controller.text(
      'workspace-id',
      { text: '9', sourceChannel: 'TELEGRAM', conversationId: '99' },
      { user: { id: 'user-id' } } as never,
      { status: vi.fn() } as unknown as Response,
    );

    expect(result).toMatchObject({ status: 'CANCELLATION_SELECTION_REQUIRED', invalidSelection: true });
    expect(startSelectedExpenseCancellation).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it.each([
    'No fueron 300, fueron 250',
    'En realidad fueron 250',
    'No fue efectivo, fue crédito',
    'No lo hizo JZM, lo hizo Ana',
    'No era gasolina, era estacionamiento',
  ])('does not publish, create or update for correction phrase: %s', async (text) => {
    const publish = vi.fn();
    const createExpense = vi.fn();
    const updateExpense = vi.fn();
    const prisma = {
      workspace: { findUniqueOrThrow: vi.fn().mockResolvedValue({ accountId: 'account-id' }) },
      auditEvent: { create: vi.fn().mockResolvedValue({}) },
      expenseConversation: { findUnique: vi.fn().mockResolvedValue(null) },
      expense: { create: createExpense, update: updateExpense },
    } as unknown as PrismaService;
    const sessions = { getActive: vi.fn().mockResolvedValue(null) } as unknown as ConversationSessionService;
    const controller = new ExpensesController(
      { publish, subscribe: vi.fn() } as unknown as EventBus,
      {} as ExpensesService,
      new LanguageNormalizer(),
      prisma,
      sessions,
    );
    const status = vi.fn();
    const result = await controller.text(
      'workspace-id',
      { text, sourceChannel: 'TELEGRAM', conversationId: '99' },
      { user: { id: 'user-id' } } as never,
      { status } as unknown as Response,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(result).toEqual({
      status: 'CORRECTION_NOT_ALLOWED',
      message: 'No puedo modificar un gasto ya registrado. Debes cancelarlo y registrar uno nuevo.',
    });
    expect(publish).not.toHaveBeenCalled();
    expect(createExpense).not.toHaveBeenCalled();
    expect(updateExpense).not.toHaveBeenCalled();
  });
});
