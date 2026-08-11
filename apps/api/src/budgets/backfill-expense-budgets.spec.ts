import { ExpenseStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma.service';
import type { ExpenseBudgetAssignmentService } from './expense-budget-assignment.service';
import { backfillExpenseBudgets } from './backfill-expense-budgets';

describe('backfillExpenseBudgets', () => {
  it('processes only unassigned REGISTERED expenses and reports status counts', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'expense-1' }, { id: 'expense-2' }]);
    const groupBy = vi.fn().mockResolvedValue([
      { status: 'ASSIGNED', _count: { _all: 4 } },
      { status: 'AMBIGUOUS', _count: { _all: 2 } },
      { status: 'UNMATCHED', _count: { _all: 1 } },
    ]);
    const assign = vi.fn().mockResolvedValue({ id: 'assignment' });
    const prisma = {
      expense: { findMany },
      expenseBudgetAssignment: { groupBy },
    } as unknown as PrismaService;
    const result = await backfillExpenseBudgets(
      prisma,
      { assign } as unknown as ExpenseBudgetAssignmentService,
      'workspace-id',
    );
    expect(assign).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        workspaceId: 'workspace-id',
        status: ExpenseStatus.REGISTERED,
        budgetAssignment: null,
      },
    }));
    expect(result).toEqual({ ASSIGNED: 4, AMBIGUOUS: 2, UNMATCHED: 1 });
  });

  it('does not overwrite existing assignments on a second run', async () => {
    const assign = vi.fn();
    const prisma = {
      expense: { findMany: vi.fn().mockResolvedValue([]) },
      expenseBudgetAssignment: { groupBy: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    await backfillExpenseBudgets(
      prisma,
      { assign } as unknown as ExpenseBudgetAssignmentService,
      'workspace-id',
    );
    expect(assign).not.toHaveBeenCalled();
  });
});
