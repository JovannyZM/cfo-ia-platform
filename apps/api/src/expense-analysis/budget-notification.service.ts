import { Injectable } from '@nestjs/common';
import { BudgetPeriod } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import type { BudgetAlertStatus } from './expense-analysis.policy';
import type { BudgetExecutionItem, ExpenseAnalysisResult } from './expense-analysis.service';
import { ExpenseAnalysisService } from './expense-analysis.service';
import { DailyCloseMessageService } from './daily-close-message.service';

export interface BudgetStatusChange {
  readonly budgetId: string;
  readonly periodKey: string;
  readonly previousStatus: BudgetAlertStatus | null;
  readonly currentStatus: BudgetAlertStatus;
  readonly execution: BudgetExecutionItem;
}

export interface PreparedDailyClose {
  readonly workspaceId: string;
  readonly analysis: ExpenseAnalysisResult;
  readonly changes: readonly BudgetStatusChange[];
  readonly message: string;
}

@Injectable()
export class BudgetNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analysisService: ExpenseAnalysisService,
    private readonly messages: DailyCloseMessageService,
  ) {}

  async prepareDailyClose(workspaceId: string, date: string): Promise<PreparedDailyClose> {
    const analysis = await this.analysisService.analyze(workspaceId, date);
    const candidates = analysis.budgetExecutions.filter(({ period }) => period !== BudgetPeriod.PER_EVENT);
    const states = candidates.length === 0 ? [] : await this.prisma.budgetNotificationState.findMany({
      where: { workspaceId, budgetId: { in: candidates.map(({ budgetId }) => budgetId) } },
    });
    const changes = candidates.flatMap((execution): BudgetStatusChange[] => {
      const periodKey = notificationPeriodKey(execution.period, date);
      const previous = states.find((state) =>
        state.budgetId === execution.budgetId && state.periodKey === periodKey);
      const previousStatus = previous?.lastNotifiedStatus ?? null;
      if (previousStatus === execution.status) return [];
      if (previousStatus === null && execution.status === 'NORMAL') return [];
      return [{
        budgetId: execution.budgetId,
        periodKey,
        previousStatus,
        currentStatus: execution.status,
        execution,
      }];
    });
    return {
      workspaceId,
      analysis,
      changes,
      message: this.messages.format(analysis, changes),
    };
  }

  async markDelivery(prepared: PreparedDailyClose, sentSuccessfully: boolean): Promise<number> {
    if (!sentSuccessfully || prepared.changes.length === 0) return 0;
    const current = await this.prisma.budgetNotificationState.findMany({
      where: {
        workspaceId: prepared.workspaceId,
        budgetId: { in: prepared.changes.map(({ budgetId }) => budgetId) },
      },
    });
    const pending = prepared.changes.filter((change) => !current.some((state) =>
      state.budgetId === change.budgetId &&
      state.periodKey === change.periodKey &&
      state.lastNotifiedStatus === change.currentStatus));
    if (pending.length === 0) return 0;
    const notifiedAt = new Date();
    await this.prisma.$transaction(pending.map((change) =>
      this.prisma.budgetNotificationState.upsert({
        where: {
          workspaceId_budgetId_periodKey: {
            workspaceId: prepared.workspaceId,
            budgetId: change.budgetId,
            periodKey: change.periodKey,
          },
        },
        create: {
          workspaceId: prepared.workspaceId,
          budgetId: change.budgetId,
          periodKey: change.periodKey,
          lastNotifiedStatus: change.currentStatus,
          lastNotifiedAt: notifiedAt,
        },
        update: {
          lastNotifiedStatus: change.currentStatus,
          lastNotifiedAt: notifiedAt,
        },
      })));
    return pending.length;
  }
}

export function notificationPeriodKey(period: BudgetPeriod, date: string): string {
  if (period === BudgetPeriod.MONTHLY) return date.slice(0, 7);
  if (period === BudgetPeriod.ANNUAL) return date.slice(0, 4);
  throw new Error('PER_EVENT notifications require a future event identifier');
}
