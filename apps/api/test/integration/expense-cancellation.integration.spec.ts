import { randomUUID } from 'node:crypto';
import { AccountRole, ExpenseStatus, PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { ExpensesService } from '../../src/expenses/expenses.service';
import type { PrismaService } from '../../src/prisma.service';

const prisma = new PrismaClient();
afterAll(async () => prisma.$disconnect());

describe('Expense cancellation with PostgreSQL', () => {
  it('preserves the expense row and persists permission, reason and audit history', async () => {
    const suffix = randomUUID();
    const user = await prisma.user.create({
      data: { email: `cancellation-${suffix}@integration.local`, name: 'Cancellation Admin' },
    });
    const account = await prisma.account.create({ data: { name: `Cancellation ${suffix}` } });
    await prisma.accountMember.create({
      data: { accountId: account.id, userId: user.id, role: AccountRole.ACCOUNT_ADMIN },
    });
    const workspace = await prisma.workspace.create({
      data: { accountId: account.id, name: 'Cancellation Workspace' },
    });
    const expense = await prisma.expense.create({ data: {
      workspaceId: workspace.id,
      sourceEventId: randomUUID(),
      merchantName: 'gasolina',
      occurredAt: new Date(),
      originalAmount: '850',
      originalCurrency: 'MXN',
      exchangeRate: '1',
      baseAmount: '850',
      spenderName: 'Jovanny',
      paymentMethod: 'CASH',
    } });
    try {
      const result = await new ExpensesService(prisma as unknown as PrismaService).cancelExpense({
        workspaceId: workspace.id,
        expenseId: expense.id,
        externalChatId: suffix,
        actorUserId: user.id,
        reason: 'Registro duplicado',
      });
      expect(result.status).toBe('CANCELLED');
      const persisted = await prisma.expense.findUniqueOrThrow({ where: { id: expense.id } });
      expect(persisted).toMatchObject({
        id: expense.id,
        status: ExpenseStatus.CANCELLED,
        cancelledByUserId: user.id,
        cancellationReason: 'Registro duplicado',
      });
      expect(persisted.cancelledAt).toBeInstanceOf(Date);
      const audit = await prisma.auditEvent.findFirstOrThrow({
        where: { entityId: expense.id, action: 'EXPENSE_CANCELLED' },
      });
      expect(audit.metadata).toMatchObject({
        previousStatus: ExpenseStatus.REGISTERED,
        newStatus: ExpenseStatus.CANCELLED,
        userId: user.id,
        reason: 'Registro duplicado',
      });
    } finally {
      await prisma.auditEvent.deleteMany({ where: { accountId: account.id } });
      await prisma.expense.deleteMany({ where: { workspaceId: workspace.id } });
      await prisma.workspace.delete({ where: { id: workspace.id } });
      await prisma.accountMember.deleteMany({ where: { accountId: account.id } });
      await prisma.account.delete({ where: { id: account.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
