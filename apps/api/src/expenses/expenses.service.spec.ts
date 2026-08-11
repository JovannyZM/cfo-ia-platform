import { AccountRole, ExpenseStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma.service';
import { ExpensesService } from './expenses.service';

const activeExpense = { id: 'expense-id', status: ExpenseStatus.REGISTERED };

describe('ExpensesService cancellation', () => {
  it('finds amount 450 and comida outside the chat through normalized category matching', async () => {
    const candidate = {
      ...activeExpense,
      merchantName: 'Cafetería Central',
      description: 'Comida de oficina',
      category: 'Alimentos',
      originalAmount: 450,
      spenderName: 'JZM',
      paymentMethod: 'CASH',
      sourceConversationId: 'previous-chat',
      occurredAt: new Date('2026-08-04T12:00:00.000Z'),
    };
    const findMany = vi.fn().mockResolvedValue([candidate]);
    const prisma = {
      expense: { findMany },
      workspace: { findUniqueOrThrow: vi.fn().mockResolvedValue({ accountId: 'account-id' }) },
      accountMember: { findFirst: vi.fn().mockResolvedValue({
        role: AccountRole.ACCOUNT_ADMIN, user: { platformRole: null },
      }) },
    } as unknown as PrismaService;
    const result = await new ExpensesService(prisma).startLastExpenseCancellation({
      workspaceId: 'workspace-id',
      externalChatId: 'current-chat',
      actorUserId: 'admin-id',
      criteria: { query: 'comida', amount: '450' },
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        workspaceId: 'workspace-id',
        status: ExpenseStatus.REGISTERED,
      },
    }));
    expect(result).toMatchObject({
      status: 'NEEDS_CANCELLATION_REASON',
      expenseId: 'expense-id',
    });
  });

  it('prioritizes matching expenses from the same chat', async () => {
    const common = {
      ...activeExpense,
      merchantName: 'Comedor',
      description: 'Comida',
      category: 'Alimentos',
      originalAmount: 450,
      spenderName: 'JZM',
      paymentMethod: 'CASH',
      occurredAt: new Date('2026-08-04T12:00:00.000Z'),
    };
    const prisma = {
      expense: { findMany: vi.fn().mockResolvedValue([
        { ...common, id: 'other-chat-expense', sourceConversationId: 'other' },
        { ...common, id: 'same-chat-expense', sourceConversationId: '99' },
      ]) },
      workspace: { findUniqueOrThrow: vi.fn().mockResolvedValue({ accountId: 'account-id' }) },
      accountMember: { findFirst: vi.fn().mockResolvedValue({
        role: AccountRole.ACCOUNT_ADMIN, user: { platformRole: null },
      }) },
    } as unknown as PrismaService;
    const result = await new ExpensesService(prisma).startLastExpenseCancellation({
      workspaceId: 'workspace-id',
      externalChatId: '99',
      actorUserId: 'admin-id',
      criteria: { query: 'comida', amount: '450' },
    });
    expect(result).toMatchObject({
      status: 'NEEDS_CANCELLATION_REASON',
      expenseId: 'same-chat-expense',
    });
  });

  it('locates a unique expense by concept and amount', async () => {
    const candidate = {
      ...activeExpense,
      merchantName: 'Pemex',
      description: 'Gasolina',
      originalAmount: 850,
      spenderName: 'JZM',
      paymentMethod: 'CASH',
      occurredAt: new Date('2026-08-04T12:00:00.000Z'),
    };
    const prisma = {
      expense: { findMany: vi.fn().mockResolvedValue([candidate]) },
      workspace: { findUniqueOrThrow: vi.fn().mockResolvedValue({ accountId: 'account-id' }) },
      accountMember: { findFirst: vi.fn().mockResolvedValue({
        role: AccountRole.ACCOUNT_ADMIN, user: { platformRole: null },
      }) },
    } as unknown as PrismaService;
    const result = await new ExpensesService(prisma).startLastExpenseCancellation({
      workspaceId: 'workspace-id',
      externalChatId: '99',
      actorUserId: 'admin-id',
      criteria: { query: 'gasolina', amount: '850' },
    });
    expect(result).toMatchObject({
      status: 'NEEDS_CANCELLATION_REASON',
      expenseId: 'expense-id',
    });
  });

  it('returns the exact displayed candidates when multiple expenses match', async () => {
    const candidate = {
      ...activeExpense,
      merchantName: 'Costco',
      description: 'Compra en Costco',
      originalAmount: 598.2,
      spenderName: 'JZM',
      paymentMethod: 'DEBIT_CARD',
      originalCurrency: 'MXN',
      sourceConversationId: '99',
      occurredAt: new Date('2026-08-04T12:00:00.000Z'),
    };
    const prisma = {
      expense: { findMany: vi.fn().mockResolvedValue([candidate, { ...candidate, id: 'other' }]) },
    } as unknown as PrismaService;
    const result = await new ExpensesService(prisma).startLastExpenseCancellation({
      workspaceId: 'workspace-id',
      externalChatId: '99',
      actorUserId: 'admin-id',
      criteria: { query: 'costco' },
    });
    expect(result).toMatchObject({
      status: 'CANCELLATION_SELECTION_REQUIRED',
      message: '¿Cuál gasto quieres cancelar?',
      candidates: [
        { expenseId: 'expense-id', label: 'Compra en Costco' },
        { expenseId: 'other', label: 'Compra en Costco' },
      ],
    });
  });

  it('offers recent registered expenses when no detailed match exists without creating one', async () => {
    const create = vi.fn();
    const update = vi.fn();
    const recent = {
      ...activeExpense,
      merchantName: 'Costco',
      description: 'Compra en Costco',
      originalAmount: 598.2,
      originalCurrency: 'MXN',
      spenderName: 'Esli',
      sourceConversationId: '99',
      occurredAt: new Date('2026-08-04T12:00:00.000Z'),
    };
    const prisma = {
      expense: {
        findMany: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([recent]),
        create,
        update,
      },
    } as unknown as PrismaService;
    const result = await new ExpensesService(prisma).startLastExpenseCancellation({
      workspaceId: 'workspace-id',
      externalChatId: '99',
      actorUserId: 'admin-id',
      criteria: { query: 'costco', amount: '598.20' },
    });
    expect(result).toMatchObject({
      status: 'CANCELLATION_SELECTION_REQUIRED',
      candidates: [{ expenseId: 'expense-id', label: 'Compra en Costco' }],
    });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('selects only the exact registered expense id chosen by the user', async () => {
    const findFirstOrThrow = vi.fn().mockResolvedValue(activeExpense);
    const prisma = {
      expense: { findFirstOrThrow },
      workspace: { findUniqueOrThrow: vi.fn().mockResolvedValue({ accountId: 'account-id' }) },
      accountMember: { findFirst: vi.fn().mockResolvedValue({
        role: AccountRole.ACCOUNT_ADMIN, user: { platformRole: null },
      }) },
    } as unknown as PrismaService;

    const result = await new ExpensesService(prisma).startSelectedExpenseCancellation({
      workspaceId: 'workspace-id', expenseId: 'expense-id', actorUserId: 'admin-id',
    });

    expect(findFirstOrThrow).toHaveBeenCalledWith({ where: {
      id: 'expense-id', workspaceId: 'workspace-id', status: ExpenseStatus.REGISTERED,
    } });
    expect(result).toMatchObject({ status: 'NEEDS_CANCELLATION_REASON', expenseId: 'expense-id' });
  });

  it('records an authorization request when a normal member tries to cancel', async () => {
    const createAudit = vi.fn().mockResolvedValue({});
    const prisma = {
      expense: { findFirst: vi.fn().mockResolvedValue(activeExpense) },
      auditEvent: { create: createAudit },
      workspace: { findUniqueOrThrow: vi.fn().mockResolvedValue({ accountId: 'account-id' }) },
      accountMember: { findFirst: vi.fn().mockResolvedValue({ role: AccountRole.MEMBER, user: { platformRole: null } }) },
    } as unknown as PrismaService;

    const result = await new ExpensesService(prisma).startLastExpenseCancellation({
      workspaceId: 'workspace-id', externalChatId: '99', actorUserId: 'member-id',
    });

    expect(result.status).toBe('CANCELLATION_REQUESTED');
    expect(createAudit).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: 'EXPENSE_CANCELLATION_REQUESTED', actorUserId: 'member-id',
    }) });
  });

  it('asks an account administrator only for the cancellation reason', async () => {
    const prisma = {
      expense: { findFirst: vi.fn().mockResolvedValue(activeExpense) },
      workspace: { findUniqueOrThrow: vi.fn().mockResolvedValue({ accountId: 'account-id' }) },
      accountMember: { findFirst: vi.fn().mockResolvedValue({ role: AccountRole.ACCOUNT_ADMIN, user: { platformRole: null } }) },
    } as unknown as PrismaService;
    const result = await new ExpensesService(prisma).startLastExpenseCancellation({
      workspaceId: 'workspace-id', externalChatId: '99', actorUserId: 'admin-id',
    });
    expect(result).toEqual({
      status: 'NEEDS_CANCELLATION_REASON',
      message: '¿Cuál es el motivo de la cancelación?',
      expenseId: 'expense-id',
    });
  });

  it('does not allow a platform administrator to intervene operationally', async () => {
    const prisma = {
      expense: { findFirst: vi.fn().mockResolvedValue(activeExpense) },
      auditEvent: { create: vi.fn().mockResolvedValue({}) },
      workspace: { findUniqueOrThrow: vi.fn().mockResolvedValue({ accountId: 'account-id' }) },
      accountMember: { findFirst: vi.fn().mockResolvedValue({
        role: AccountRole.ACCOUNT_OWNER, user: { platformRole: 'PLATFORM_ADMIN' },
      }) },
    } as unknown as PrismaService;
    const result = await new ExpensesService(prisma).startLastExpenseCancellation({
      workspaceId: 'workspace-id', externalChatId: '99', actorUserId: 'platform-admin-id',
    });
    expect(result.status).toBe('CANCELLATION_REQUESTED');
  });

  it('soft-cancels and audits while preserving the expense row', async () => {
    const now = new Date('2026-08-04T14:00:00.000Z');
    const update = vi.fn().mockResolvedValue({ ...activeExpense, status: ExpenseStatus.CANCELLED });
    const createAudit = vi.fn().mockResolvedValue({});
    const transaction = vi.fn((callback: (tx: unknown) => unknown) => Promise.resolve(callback({
      expense: { update }, auditEvent: { create: createAudit },
    })));
    const prisma = {
      workspace: { findUniqueOrThrow: vi.fn().mockResolvedValue({ accountId: 'account-id' }) },
      accountMember: { findFirst: vi.fn().mockResolvedValue({ role: AccountRole.ACCOUNT_OWNER, user: { platformRole: null } }) },
      expense: { findFirstOrThrow: vi.fn().mockResolvedValue(activeExpense) },
      $transaction: transaction,
    } as unknown as PrismaService;
    const result = await new ExpensesService(prisma).cancelExpense({
      workspaceId: 'workspace-id', expenseId: 'expense-id', externalChatId: '99',
      actorUserId: 'owner-id', reason: 'Registro duplicado', now,
    });
    expect(result.status).toBe('CANCELLED');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'expense-id' },
      data: {
        status: ExpenseStatus.CANCELLED,
        cancelledAt: now,
        cancelledByUserId: 'owner-id',
        cancellationReason: 'Registro duplicado',
      },
    });
    expect(createAudit).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'EXPENSE_CANCELLED' }) });
    expect(transaction).toHaveBeenCalledOnce();
  });
});
