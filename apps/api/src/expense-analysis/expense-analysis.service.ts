import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BudgetNature,
  BudgetPeriod,
  ExpenseBudgetAssignmentStatus,
  ExpenseStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { ExpenseAnalysisPolicy, type BudgetAlertStatus, type ExpenseAnalysisStatus } from './expense-analysis.policy';

export interface BudgetExecutionItem {
  readonly budgetId: string;
  readonly name: string;
  readonly period: BudgetPeriod;
  readonly nature: BudgetNature;
  readonly budgetAmount: string;
  readonly exercisedAmount: string;
  readonly balanceAmount: string;
  readonly exceededAmount: string;
  readonly exceededPercent: string;
  readonly consumedPercent: string;
  readonly status: BudgetAlertStatus;
}

export interface ExpenseAnalysisResult {
  readonly date: string;
  readonly timeZone: string;
  readonly todayExpenseAmount: string;
  readonly monthExpenseAmount: string;
  readonly monthSavingAmount: string;
  readonly monthInvestmentAmount: string;
  readonly monthlyExpenseBudget: string;
  readonly assignedExpenseAmount: string;
  readonly budgetConsumedPercent: string;
  readonly unmatchedAmount: string;
  readonly unmatchedCount: number;
  readonly ambiguousAmount: string;
  readonly ambiguousCount: number;
  readonly exceededBudgets: readonly BudgetExecutionItem[];
  readonly budgetsWithBalance: readonly BudgetExecutionItem[];
  readonly unexercisedBudgets: readonly BudgetExecutionItem[];
  readonly budgetExecutions: readonly BudgetExecutionItem[];
  readonly natureBreakdown: {
    readonly EXPENSE: { readonly todayAmount: string; readonly monthAmount: string };
    readonly SAVING: { readonly monthAmount: string };
    readonly INVESTMENT: { readonly monthAmount: string };
  };
  readonly status: ExpenseAnalysisStatus;
}

@Injectable()
export class ExpenseAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: ExpenseAnalysisPolicy,
  ) {}

  async analyze(
    workspaceId: string,
    date: string,
  ): Promise<ExpenseAnalysisResult> {
    validateDate(date);
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { timezone: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    const timeZone = workspace.timezone;
    validateTimeZone(timeZone);
    const dayStart = zonedStart(date, timeZone);
    const nextDay = addLocalDays(date, 1);
    const dayEnd = zonedStart(nextDay, timeZone);
    const monthStartDate = `${date.slice(0, 7)}-01`;
    const monthStart = zonedStart(monthStartDate, timeZone);
    const nextMonthDate = addLocalMonths(monthStartDate, 1);
    const monthEnd = zonedStart(nextMonthDate, timeZone);
    const yearStart = zonedStart(`${date.slice(0, 4)}-01-01`, timeZone);
    const dateValue = new Date(`${date}T00:00:00.000Z`);

    const [budgets, expenses] = await Promise.all([
      this.prisma.budget.findMany({
        where: {
          workspaceId,
          active: true,
          startDate: { lte: dateValue },
          OR: [{ endDate: null }, { endDate: { gte: dateValue } }],
        },
      }),
      this.prisma.expense.findMany({
        where: {
          workspaceId,
          status: ExpenseStatus.REGISTERED,
          occurredAt: { gte: yearStart, lt: monthEnd },
        },
        include: { budgetAssignment: { include: { budget: true } } },
      }),
    ]);

    const monthExpenses = expenses.filter(({ occurredAt }) =>
      occurredAt >= monthStart && occurredAt < monthEnd);
    const dayExpenses = monthExpenses.filter(({ occurredAt }) =>
      occurredAt >= dayStart && occurredAt < dayEnd);

    const assignedByNature = (items: typeof monthExpenses, nature: BudgetNature) =>
      sum(items
        .filter(({ budgetAssignment }) =>
          budgetAssignment?.status === ExpenseBudgetAssignmentStatus.ASSIGNED &&
          budgetAssignment.budget?.nature === nature)
        .map(({ baseAmount }) => baseAmount));
    const dayExpenseAmount = assignedByNature(dayExpenses, BudgetNature.EXPENSE);
    const monthExpenseAmount = assignedByNature(monthExpenses, BudgetNature.EXPENSE);
    const monthSavingAmount = assignedByNature(monthExpenses, BudgetNature.SAVING);
    const monthInvestmentAmount = assignedByNature(monthExpenses, BudgetNature.INVESTMENT);

    const monthlyExpenseBudgets = budgets.filter(({ period, nature }) =>
      period === BudgetPeriod.MONTHLY && nature === BudgetNature.EXPENSE);
    const monthlyExpenseBudget = sum(monthlyExpenseBudgets.map(({ amount }) => amount));
    const assignedExpenseAmount = sum(monthExpenses
      .filter(({ budgetAssignment }) =>
        budgetAssignment?.status === ExpenseBudgetAssignmentStatus.ASSIGNED &&
        budgetAssignment.budget?.nature === BudgetNature.EXPENSE &&
        budgetAssignment.budget.period === BudgetPeriod.MONTHLY)
      .map(({ baseAmount }) => baseAmount));

    const unmatched = monthExpenses.filter(({ budgetAssignment }) =>
      !budgetAssignment || budgetAssignment.status === ExpenseBudgetAssignmentStatus.UNMATCHED);
    const ambiguous = monthExpenses.filter(({ budgetAssignment }) =>
      budgetAssignment?.status === ExpenseBudgetAssignmentStatus.AMBIGUOUS);
    const unmatchedAmount = sum(unmatched.map(({ baseAmount }) => baseAmount));
    const ambiguousAmount = sum(ambiguous.map(({ baseAmount }) => baseAmount));

    const executions = budgets.map((budget) => {
      const basePeriodStart = budget.period === BudgetPeriod.ANNUAL
        ? yearStart
        : budget.period === BudgetPeriod.MONTHLY
          ? monthStart
          : budget.startDate;
      const periodStart = budget.startDate > basePeriodStart ? budget.startDate : basePeriodStart;
      const exercised = sum(expenses
        .filter(({ occurredAt, budgetAssignment }) =>
          occurredAt >= periodStart && occurredAt < dayEnd &&
          budgetAssignment?.status === ExpenseBudgetAssignmentStatus.ASSIGNED &&
          budgetAssignment.budgetId === budget.id)
        .map(({ baseAmount }) => baseAmount));
      return executionItem(budget, exercised, this.policy);
    });
    const expenseExecutions = executions.filter(({ nature }) => nature === BudgetNature.EXPENSE);
    const exceededBudgets = expenseExecutions.filter(({ exceededAmount }) =>
      new Prisma.Decimal(exceededAmount).gt(0));
    const budgetsWithBalance = expenseExecutions.filter(({ balanceAmount, exercisedAmount }) =>
      new Prisma.Decimal(balanceAmount).gt(0) && new Prisma.Decimal(exercisedAmount).gt(0));
    const unexercisedBudgets = expenseExecutions.filter(({ exercisedAmount }) =>
      new Prisma.Decimal(exercisedAmount).eq(0));
    const status = this.policy.status({
      budgetStatuses: expenseExecutions.map((execution) => execution.status),
      hasIncompleteData: unmatchedAmount.gt(0) || ambiguousAmount.gt(0),
    });
    const budgetConsumedPercent = monthlyExpenseBudget.gt(0)
      ? assignedExpenseAmount.div(monthlyExpenseBudget).mul(100).toDecimalPlaces(4)
      : zero();

    return {
      date,
      timeZone,
      todayExpenseAmount: decimal(dayExpenseAmount),
      monthExpenseAmount: decimal(monthExpenseAmount),
      monthSavingAmount: decimal(monthSavingAmount),
      monthInvestmentAmount: decimal(monthInvestmentAmount),
      monthlyExpenseBudget: decimal(monthlyExpenseBudget),
      assignedExpenseAmount: decimal(assignedExpenseAmount),
      budgetConsumedPercent: decimal(budgetConsumedPercent),
      unmatchedAmount: decimal(unmatchedAmount),
      unmatchedCount: unmatched.length,
      ambiguousAmount: decimal(ambiguousAmount),
      ambiguousCount: ambiguous.length,
      exceededBudgets,
      budgetsWithBalance,
      unexercisedBudgets,
      budgetExecutions: expenseExecutions,
      natureBreakdown: {
        EXPENSE: { todayAmount: decimal(dayExpenseAmount), monthAmount: decimal(monthExpenseAmount) },
        SAVING: { monthAmount: decimal(monthSavingAmount) },
        INVESTMENT: { monthAmount: decimal(monthInvestmentAmount) },
      },
      status,
    };
  }
}

function executionItem(
  budget: {
    id: string;
    name: string;
    period: BudgetPeriod;
    nature: BudgetNature;
    amount: Prisma.Decimal;
  },
  exercised: Prisma.Decimal,
  policy: ExpenseAnalysisPolicy,
): BudgetExecutionItem {
  const balance = Prisma.Decimal.max(budget.amount.minus(exercised), zero());
  const exceeded = Prisma.Decimal.max(exercised.minus(budget.amount), zero());
  const exceededPercent = budget.amount.gt(0)
    ? exceeded.div(budget.amount).mul(100).toDecimalPlaces(4)
    : zero();
  const consumedPercent = budget.amount.gt(0)
    ? exercised.div(budget.amount).mul(100).toDecimalPlaces(4)
    : zero();
  return {
    budgetId: budget.id,
    name: budget.name,
    period: budget.period,
    nature: budget.nature,
    budgetAmount: decimal(budget.amount),
    exercisedAmount: decimal(exercised),
    balanceAmount: decimal(balance),
    exceededAmount: decimal(exceeded),
    exceededPercent: decimal(exceededPercent),
    consumedPercent: decimal(consumedPercent),
    status: policy.budgetStatus(consumedPercent),
  };
}

function sum(values: readonly Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((total, value) => total.plus(value), zero());
}

function zero(): Prisma.Decimal {
  return new Prisma.Decimal(0);
}

function decimal(value: Prisma.Decimal): string {
  return value.toFixed(4).replace(/\.0+$/u, '').replace(/(\.\d*?)0+$/u, '$1');
}

function validateDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) throw new BadRequestException('date must use YYYY-MM-DD');
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new BadRequestException('date is invalid');
  }
}

function validateTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
  } catch {
    throw new BadRequestException('timeZone is invalid');
  }
}

function zonedStart(date: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const target = Date.UTC(year!, month! - 1, day ?? 0);
  let instant = target;
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(instant));
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)!.value);
    const represented = Date.UTC(
      value('year'), value('month') - 1, value('day'),
      value('hour'), value('minute'), value('second'),
    );
    instant = target - (represented - instant);
  }
  return new Date(instant);
}

function addLocalDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
}

function addLocalMonths(date: string, months: number): string {
  const [year, month] = date.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1 + months, 1)).toISOString().slice(0, 10);
}
