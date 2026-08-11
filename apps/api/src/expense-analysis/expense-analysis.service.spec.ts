import {
  BudgetNature,
  BudgetPeriod,
  ExpenseBudgetAssignmentStatus,
  ExpenseStatus,
  Prisma,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma.service';
import { ExpenseAnalysisPolicy } from './expense-analysis.policy';
import { ExpenseAnalysisService } from './expense-analysis.service';

const workspaceId = 'workspace-id';

function budget(
  id: string,
  name: string,
  amount: string,
  nature: BudgetNature = BudgetNature.EXPENSE,
  period: BudgetPeriod = BudgetPeriod.MONTHLY,
) {
  return {
    id, workspaceId, name, amount: new Prisma.Decimal(amount), nature, period,
    active: true, startDate: new Date('2026-01-01'), endDate: null,
  };
}

function expense(input: {
  id: string;
  amount: string;
  occurredAt: string;
  assignmentStatus?: ExpenseBudgetAssignmentStatus;
  assignedBudget?: ReturnType<typeof budget>;
  status?: ExpenseStatus;
}) {
  return {
    id: input.id,
    workspaceId,
    baseAmount: new Prisma.Decimal(input.amount),
    occurredAt: new Date(input.occurredAt),
    status: input.status ?? ExpenseStatus.REGISTERED,
    budgetAssignment: input.assignmentStatus
      ? {
          status: input.assignmentStatus,
          budgetId: input.assignedBudget?.id ?? null,
          budget: input.assignedBudget ?? null,
        }
      : null,
  };
}

function service(budgets: ReturnType<typeof budget>[], expenses: ReturnType<typeof expense>[]) {
  const prisma = {
    workspace: { findUnique: vi.fn().mockResolvedValue({ timezone: 'America/Mexico_City' }) },
    budget: { findMany: vi.fn().mockResolvedValue(budgets) },
    expense: { findMany: vi.fn().mockResolvedValue(expenses.filter(({ status }) => status === ExpenseStatus.REGISTERED)) },
  } as unknown as PrismaService;
  return new ExpenseAnalysisService(prisma, new ExpenseAnalysisPolicy());
}

describe('ExpenseAnalysisService', () => {
  it('uses occurredAt and Workspace timezone for daily and monthly totals with Decimal precision', async () => {
    const gas = budget('gas', 'Gasolina', '1000');
    const result = await service([gas], [
      expense({ id: 'before-day', amount: '10.1111', occurredAt: '2026-08-05T05:59:59Z', assignmentStatus: ExpenseBudgetAssignmentStatus.ASSIGNED, assignedBudget: gas }),
      expense({ id: 'inside-day', amount: '20.2222', occurredAt: '2026-08-05T06:00:00Z', assignmentStatus: ExpenseBudgetAssignmentStatus.ASSIGNED, assignedBudget: gas }),
      expense({ id: 'cancelled', amount: '999', occurredAt: '2026-08-05T12:00:00Z', assignmentStatus: ExpenseBudgetAssignmentStatus.ASSIGNED, assignedBudget: gas, status: ExpenseStatus.CANCELLED }),
    ]).analyze(workspaceId, '2026-08-05');
    expect(result.todayExpenseAmount).toBe('20.2222');
    expect(result.monthExpenseAmount).toBe('30.3333');
  });

  it('keeps EXPENSE, SAVING and INVESTMENT amounts separate', async () => {
    const spending = budget('expense', 'Gastos', '1000');
    const saving = budget('saving', 'Ahorro', '500', BudgetNature.SAVING);
    const investment = budget('investment', 'Inversión', '500', BudgetNature.INVESTMENT);
    const result = await service([spending, saving, investment], [
      expense({ id: 'e', amount: '100', occurredAt: '2026-08-05T12:00:00Z', assignmentStatus: ExpenseBudgetAssignmentStatus.ASSIGNED, assignedBudget: spending }),
      expense({ id: 's', amount: '200', occurredAt: '2026-08-05T12:00:00Z', assignmentStatus: ExpenseBudgetAssignmentStatus.ASSIGNED, assignedBudget: saving }),
      expense({ id: 'i', amount: '300', occurredAt: '2026-08-05T12:00:00Z', assignmentStatus: ExpenseBudgetAssignmentStatus.ASSIGNED, assignedBudget: investment }),
    ]).analyze(workspaceId, '2026-08-05');
    expect(result).toMatchObject({
      monthExpenseAmount: '100', monthSavingAmount: '200', monthInvestmentAmount: '300',
      natureBreakdown: {
        EXPENSE: { monthAmount: '100' }, SAVING: { monthAmount: '200' }, INVESTMENT: { monthAmount: '300' },
      },
    });
  });

  it('calculates budget consumption only from ASSIGNED monthly EXPENSE', async () => {
    const monthly = budget('monthly', 'Mensual', '1000');
    const annual = budget('annual', 'Anual', '10000', BudgetNature.EXPENSE, BudgetPeriod.ANNUAL);
    const result = await service([monthly, annual], [
      expense({ id: 'monthly-expense', amount: '250', occurredAt: '2026-08-05T12:00:00Z', assignmentStatus: ExpenseBudgetAssignmentStatus.ASSIGNED, assignedBudget: monthly }),
      expense({ id: 'annual-expense', amount: '500', occurredAt: '2026-08-05T12:00:00Z', assignmentStatus: ExpenseBudgetAssignmentStatus.ASSIGNED, assignedBudget: annual }),
    ]).analyze(workspaceId, '2026-08-05');
    expect(result).toMatchObject({
      monthlyExpenseBudget: '1000', assignedExpenseAmount: '250', budgetConsumedPercent: '25',
      monthExpenseAmount: '750',
    });
  });

  it('never ignores UNMATCHED or AMBIGUOUS and marks DATA_INCOMPLETE', async () => {
    const monthly = budget('monthly', 'Mensual', '1000');
    const result = await service([monthly], [
      expense({ id: 'unmatched', amount: '80.55', occurredAt: '2026-08-05T12:00:00Z', assignmentStatus: ExpenseBudgetAssignmentStatus.UNMATCHED }),
      expense({ id: 'ambiguous', amount: '20.45', occurredAt: '2026-08-05T12:00:00Z', assignmentStatus: ExpenseBudgetAssignmentStatus.AMBIGUOUS }),
      expense({ id: 'missing-assignment', amount: '5', occurredAt: '2026-08-05T12:00:00Z' }),
    ]).analyze(workspaceId, '2026-08-05');
    expect(result).toMatchObject({
      unmatchedAmount: '85.55', unmatchedCount: 2,
      ambiguousAmount: '20.45', ambiguousCount: 1,
      assignedExpenseAmount: '0', status: 'DATA_INCOMPLETE',
    });
  });

  it('detects exceeded budgets, gives CRITICAL priority and reports unexercised budgets', async () => {
    const exceeded = budget('exceeded', 'Gasolina', '1000');
    const unused = budget('unused', 'Luz', '500');
    const result = await service([exceeded, unused], [
      expense({ id: 'large', amount: '1110.0001', occurredAt: '2026-08-05T12:00:00Z', assignmentStatus: ExpenseBudgetAssignmentStatus.ASSIGNED, assignedBudget: exceeded }),
      expense({ id: 'unmatched', amount: '1', occurredAt: '2026-08-05T12:00:00Z', assignmentStatus: ExpenseBudgetAssignmentStatus.UNMATCHED }),
    ]).analyze(workspaceId, '2026-08-05');
    expect(result.status).toBe('CRITICAL');
    expect(result.exceededBudgets[0]).toMatchObject({ name: 'Gasolina', exceededAmount: '110.0001' });
    expect(result.unexercisedBudgets).toEqual([expect.objectContaining({ name: 'Luz' })]);
  });
});
