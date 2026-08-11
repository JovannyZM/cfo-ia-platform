import { Injectable } from '@nestjs/common';
import { BudgetPeriod, Prisma } from '@prisma/client';
import type { BudgetExecutionItem, ExpenseAnalysisResult } from './expense-analysis.service';
import type { BudgetStatusChange } from './budget-notification.service';

@Injectable()
export class DailyCloseMessageService {
  format(
    analysis: ExpenseAnalysisResult,
    changes?: readonly BudgetStatusChange[],
  ): string {
    const header = `📊 Cierre de gastos — ${formatDate(analysis.date, analysis.timeZone)}`;
    const summary = [
      `Hoy: ${summaryMoney(analysis.todayExpenseAmount)}`,
      `Mes: ${summaryMoney(analysis.monthExpenseAmount)}`,
      `Presupuesto mensual: ${summaryMoney(analysis.monthlyExpenseBudget)}`,
      `Ejercido: ${percent(analysis.budgetConsumedPercent)}`,
    ].join('\n');
    return `${header}\n\n${summary}\n\n${this.conclusion(analysis, changes)}`;
  }

  private conclusion(
    analysis: ExpenseAnalysisResult,
    changes?: readonly BudgetStatusChange[],
  ): string {
    if (analysis.status === 'DATA_INCOMPLETE') {
      const incomplete = new Prisma.Decimal(analysis.unmatchedAmount).plus(analysis.ambiguousAmount);
      return `🟡 Hay ${money(incomplete.toString())} sin clasificar. El estado del presupuesto es provisional.`;
    }

    const items = changes === undefined
      ? analysis.budgetExecutions
          .filter(({ status }) => status !== 'NORMAL')
          .map((execution) => ({ execution, currentStatus: execution.status }))
      : changes;
    if (items.length === 0) return '🟢 Sin cambios relevantes en el presupuesto.';
    return items.map(({ execution, currentStatus }) => budgetAlert(execution, currentStatus)).join('\n');
  }
}

function budgetAlert(
  execution: BudgetExecutionItem,
  status: BudgetExecutionItem['status'],
): string {
  const period = execution.period === BudgetPeriod.ANNUAL ? 'anual' : 'mensual';
  if (status === 'CRITICAL') {
    return `🔴 ${execution.name} excedió su presupuesto ${period} por ${money(execution.exceededAmount)}.`;
  }
  if (status === 'EXCEEDED') {
    return `🟡 ${execution.name} excedió su presupuesto ${period} por ${money(execution.exceededAmount)}.`;
  }
  if (status === 'ATTENTION') {
    return `🟡 ${execution.name} lleva ${percent(execution.consumedPercent)} de su presupuesto ${period}.`;
  }
  return `🟢 ${execution.name} volvió a estar dentro de su presupuesto ${period}.`;
}

function money(value: string): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN',
    minimumFractionDigits: new Prisma.Decimal(value).isInteger() ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function percent(value: string): string {
  return `${new Prisma.Decimal(value).toDecimalPlaces(1).toString()}%`;
}

function summaryMoney(value: string): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatDate(date: string, timeZone: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone,
  }).format(new Date(`${date}T12:00:00.000Z`)).replace('.', '');
}
