import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type ExpenseAnalysisStatus = 'NORMAL' | 'ATTENTION' | 'CRITICAL' | 'DATA_INCOMPLETE';
export type BudgetAlertStatus = 'NORMAL' | 'ATTENTION' | 'EXCEEDED' | 'CRITICAL';

@Injectable()
export class ExpenseAnalysisPolicy {
  budgetStatus(consumedPercent: Prisma.Decimal): BudgetAlertStatus {
    if (consumedPercent.gt(110)) return 'CRITICAL';
    if (consumedPercent.gte(100)) return 'EXCEEDED';
    if (consumedPercent.gte(80)) return 'ATTENTION';
    return 'NORMAL';
  }

  status(input: {
    readonly budgetStatuses: readonly BudgetAlertStatus[];
    readonly hasIncompleteData: boolean;
  }): ExpenseAnalysisStatus {
    if (input.budgetStatuses.includes('CRITICAL')) return 'CRITICAL';
    if (input.hasIncompleteData) return 'DATA_INCOMPLETE';
    if (input.budgetStatuses.some((status) => status === 'ATTENTION' || status === 'EXCEEDED')) {
      return 'ATTENTION';
    }
    return 'NORMAL';
  }
}
