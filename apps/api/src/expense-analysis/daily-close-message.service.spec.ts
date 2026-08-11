import { describe, expect, it } from 'vitest';
import { DailyCloseMessageService } from './daily-close-message.service';
import type { BudgetExecutionItem, ExpenseAnalysisResult } from './expense-analysis.service';

function analysis(overrides: Partial<ExpenseAnalysisResult> = {}): ExpenseAnalysisResult {
  return {
    date: '2026-08-05', timeZone: 'America/Mexico_City',
    todayExpenseAmount: '4850', monthExpenseAmount: '76200', monthSavingAmount: '0',
    monthInvestmentAmount: '0', monthlyExpenseBudget: '112000', assignedExpenseAmount: '76200',
    budgetConsumedPercent: '68.0357', unmatchedAmount: '0', unmatchedCount: 0,
    ambiguousAmount: '0', ambiguousCount: 0, exceededBudgets: [], budgetsWithBalance: [],
    unexercisedBudgets: [], budgetExecutions: [],
    natureBreakdown: {
      EXPENSE: { todayAmount: '4850', monthAmount: '76200' },
      SAVING: { monthAmount: '0' }, INVESTMENT: { monthAmount: '0' },
    },
    status: 'NORMAL', ...overrides,
  };
}

function mounjaro(status: BudgetExecutionItem['status'] = 'ATTENTION'): BudgetExecutionItem {
  return {
    budgetId: 'mounjaro', name: 'Mounjaro', period: 'MONTHLY', nature: 'EXPENSE',
    budgetAmount: '6500', exercisedAmount: '6256.75', balanceAmount: '243.25',
    exceededAmount: '0', exceededPercent: '0', consumedPercent: '96.2577', status,
  };
}

describe('DailyCloseMessageService', () => {
  const messages = new DailyCloseMessageService();

  it('creates a brief normal message', () => {
    const message = messages.format(analysis({
      date: '2026-08-06', todayExpenseAmount: '0', monthExpenseAmount: '6625.75',
      monthlyExpenseBudget: '102500', budgetConsumedPercent: '6.4641',
    }), []);
    expect(message).toContain('📊 Cierre de gastos — 6 ago 2026');
    expect(message).toContain('🟢 Sin cambios relevantes en el presupuesto.');
    expect(message).not.toContain('?');
    expect(message).toContain('Hoy: $0.00');
    expect(message).toContain('Mes: $6,625.75');
    expect(message).toContain('Presupuesto mensual: $102,500.00');
    expect(message).toContain('Ejercido: 6.5%');
  });

  it('shows the first ATTENTION transition and suppresses it unchanged the next day', () => {
    const execution = mounjaro();
    const base = analysis({ status: 'ATTENTION', budgetExecutions: [execution] });
    expect(messages.format(base, [{
      budgetId: execution.budgetId, periodKey: '2026-08', previousStatus: null,
      currentStatus: 'ATTENTION', execution,
    }])).toContain('🟡 Mounjaro lleva 96.3% de su presupuesto mensual.');
    expect(messages.format({ ...base, date: '2026-08-06', todayExpenseAmount: '0' }, []))
      .toContain('🟢 Sin cambios relevantes en el presupuesto.');
  });

  it('shows an EXCEEDED transition with its amount', () => {
    const execution = { ...mounjaro('EXCEEDED'), exercisedAmount: '6600', balanceAmount: '0', exceededAmount: '100', consumedPercent: '101.5385' };
    const message = messages.format(analysis({ status: 'ATTENTION' }), [{
      budgetId: execution.budgetId, periodKey: '2026-08', previousStatus: 'ATTENTION',
      currentStatus: 'EXCEEDED', execution,
    }]);
    expect(message).toContain('🟡 Mounjaro excedió su presupuesto mensual por $100.');
  });

  it('marks incomplete information as provisional', () => {
    const message = messages.format(analysis({
      status: 'DATA_INCOMPLETE', unmatchedAmount: '8000', ambiguousAmount: '400',
    }), []);
    expect(message).toContain('Presupuesto mensual: $112,000.00');
    expect(message).toContain('Ejercido: 68%');
    expect(message).toContain('🟡 Hay $8,400 sin clasificar. El estado del presupuesto es provisional.');
  });
});
