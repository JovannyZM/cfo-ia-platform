import { BudgetNature, BudgetPeriod } from '@prisma/client';
import type { BudgetAlertStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma.service';
import { BudgetNotificationService } from './budget-notification.service';
import { DailyCloseMessageService } from './daily-close-message.service';
import type { BudgetExecutionItem, ExpenseAnalysisResult } from './expense-analysis.service';
import type { ExpenseAnalysisService } from './expense-analysis.service';

const workspaceId = '00000000-0000-4000-8000-000000000007';

function execution(status: BudgetExecutionItem['status'], period = BudgetPeriod.MONTHLY): BudgetExecutionItem {
  const values = status === 'CRITICAL'
    ? { exercisedAmount: '7300', balanceAmount: '0', exceededAmount: '800', consumedPercent: '112.3077', exceededPercent: '12.3077' }
    : status === 'EXCEEDED'
      ? { exercisedAmount: '6600', balanceAmount: '0', exceededAmount: '100', consumedPercent: '101.5385', exceededPercent: '1.5385' }
      : status === 'ATTENTION'
        ? { exercisedAmount: '6256.75', balanceAmount: '243.25', exceededAmount: '0', consumedPercent: '96.2577', exceededPercent: '0' }
        : { exercisedAmount: '1000', balanceAmount: '5500', exceededAmount: '0', consumedPercent: '15.3846', exceededPercent: '0' };
  return {
    budgetId: 'budget-mounjaro', name: 'Mounjaro', period, nature: BudgetNature.EXPENSE,
    budgetAmount: '6500', status, ...values,
  };
}

function analysis(date: string, item: BudgetExecutionItem): ExpenseAnalysisResult {
  return {
    date, timeZone: 'America/Mexico_City', todayExpenseAmount: '0', monthExpenseAmount: item.exercisedAmount,
    monthSavingAmount: '0', monthInvestmentAmount: '0', monthlyExpenseBudget: '102500',
    assignedExpenseAmount: item.exercisedAmount, budgetConsumedPercent: '6.1041', unmatchedAmount: '0',
    unmatchedCount: 0, ambiguousAmount: '0', ambiguousCount: 0,
    exceededBudgets: item.status === 'EXCEEDED' || item.status === 'CRITICAL' ? [item] : [],
    budgetsWithBalance: item.status === 'ATTENTION' || item.status === 'NORMAL' ? [item] : [],
    unexercisedBudgets: [], budgetExecutions: [item],
    natureBreakdown: { EXPENSE: { todayAmount: '0', monthAmount: item.exercisedAmount }, SAVING: { monthAmount: '0' }, INVESTMENT: { monthAmount: '0' } },
    status: item.status === 'CRITICAL' ? 'CRITICAL' : item.status === 'NORMAL' ? 'NORMAL' : 'ATTENTION',
  };
}

describe('BudgetNotificationService', () => {
  let states: Array<{ workspaceId: string; budgetId: string; periodKey: string; lastNotifiedStatus: BudgetAlertStatus; lastNotifiedAt: Date }>;
  let currentAnalysis: ExpenseAnalysisResult;
  let service: BudgetNotificationService;
  let upsert: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    states = [];
    currentAnalysis = analysis('2026-08-05', execution('ATTENTION'));
    type State = (typeof states)[number];
    type UpsertArgs = {
      where: { workspaceId_budgetId_periodKey: Pick<State, 'workspaceId' | 'budgetId' | 'periodKey'> };
      create: State;
      update: Pick<State, 'lastNotifiedStatus' | 'lastNotifiedAt'>;
    };
    type FindArgs = { where: { workspaceId: string; budgetId: { in: string[] } } };
    upsert = vi.fn(({ where, create, update }: UpsertArgs) => {
      const key = where.workspaceId_budgetId_periodKey;
      const found = states.find((state) => state.workspaceId === key.workspaceId && state.budgetId === key.budgetId && state.periodKey === key.periodKey);
      if (found) Object.assign(found, update);
      else states.push({ ...create });
      return Promise.resolve(found ?? states.at(-1));
    });
    const prisma = {
      budgetNotificationState: {
        findMany: vi.fn(({ where }: FindArgs) => Promise.resolve(states.filter((state) =>
          state.workspaceId === where.workspaceId && where.budgetId.in.includes(state.budgetId)))),
        upsert,
      },
      $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
    } as unknown as PrismaService;
    const analyzer = { analyze: vi.fn(() => Promise.resolve(currentAnalysis)) } as unknown as ExpenseAnalysisService;
    service = new BudgetNotificationService(prisma, analyzer, new DailyCloseMessageService());
  });

  it('detects first ATTENTION, does not persist on failure, and does not repeat after success', async () => {
    const prepared = await service.prepareDailyClose(workspaceId, '2026-08-05');
    expect(prepared.changes).toHaveLength(1);
    expect(prepared.message).toContain('Mounjaro lleva 96.3%');
    expect(states).toHaveLength(0);
    expect(await service.markDelivery(prepared, false)).toBe(0);
    expect(states).toHaveLength(0);
    expect(await service.markDelivery(prepared, true)).toBe(1);
    expect(await service.markDelivery(prepared, true)).toBe(0);
    currentAnalysis = analysis('2026-08-06', execution('ATTENTION'));
    const nextDay = await service.prepareDailyClose(workspaceId, '2026-08-06');
    expect(nextDay.changes).toHaveLength(0);
    expect(nextDay.message).toContain('Sin cambios relevantes');
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('detects ATTENTION to EXCEEDED and EXCEEDED to CRITICAL transitions', async () => {
    await service.markDelivery(await service.prepareDailyClose(workspaceId, '2026-08-05'), true);
    currentAnalysis = analysis('2026-08-06', execution('EXCEEDED'));
    const exceeded = await service.prepareDailyClose(workspaceId, '2026-08-06');
    expect(exceeded.changes[0]).toMatchObject({ previousStatus: 'ATTENTION', currentStatus: 'EXCEEDED' });
    await service.markDelivery(exceeded, true);
    currentAnalysis = analysis('2026-08-07', execution('CRITICAL'));
    expect((await service.prepareDailyClose(workspaceId, '2026-08-07')).changes[0])
      .toMatchObject({ previousStatus: 'EXCEEDED', currentStatus: 'CRITICAL' });
  });

  it('detects a recovery to a lower status', async () => {
    currentAnalysis = analysis('2026-08-05', execution('CRITICAL'));
    await service.markDelivery(await service.prepareDailyClose(workspaceId, '2026-08-05'), true);
    currentAnalysis = analysis('2026-08-06', execution('ATTENTION'));
    expect((await service.prepareDailyClose(workspaceId, '2026-08-06')).changes[0])
      .toMatchObject({ previousStatus: 'CRITICAL', currentStatus: 'ATTENTION' });
  });

  it('uses a new state in a new monthly period', async () => {
    await service.markDelivery(await service.prepareDailyClose(workspaceId, '2026-08-31'), true);
    currentAnalysis = analysis('2026-09-01', execution('ATTENTION'));
    const september = await service.prepareDailyClose(workspaceId, '2026-09-01');
    expect(september.changes[0]).toMatchObject({ periodKey: '2026-09', previousStatus: null });
  });

  it('an on-demand message does not alter notification state', () => {
    const messages = new DailyCloseMessageService();
    expect(messages.format(currentAnalysis)).toContain('Mounjaro lleva 96.3%');
    expect(states).toHaveLength(0);
  });
});
