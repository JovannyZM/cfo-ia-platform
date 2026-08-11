import { Injectable } from '@nestjs/common';
import {
  ExpenseBudgetAssignedBy,
  ExpenseBudgetAssignmentStatus,
  ExpenseStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { BudgetClassifierService } from './budget-classifier.service';

@Injectable()
export class ExpenseBudgetAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classifier: BudgetClassifierService,
  ) {}

  async assign(expenseId: string, workspaceId: string, explicitBudgetName?: string) {
    const existing = await this.prisma.expenseBudgetAssignment.findUnique({
      where: { expenseId },
    });
    if (existing) return existing;

    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, workspaceId, status: ExpenseStatus.REGISTERED },
      include: { workspace: { select: { accountId: true } } },
    });
    if (!expense) return null;

    const classification = await this.classifier.classify(workspaceId, {
      ...(explicitBudgetName ? { explicitBudgetName } : {}),
      merchantName: expense.merchantName,
      description: expense.description,
      category: expense.category,
    });
    const status = classification.budgetId
      ? ExpenseBudgetAssignmentStatus.ASSIGNED
      : classification.ambiguous
        ? ExpenseBudgetAssignmentStatus.AMBIGUOUS
        : ExpenseBudgetAssignmentStatus.UNMATCHED;
    const assignedBy = explicitBudgetName && classification.budgetId
      ? ExpenseBudgetAssignedBy.EXPLICIT_USER
      : ExpenseBudgetAssignedBy.RULE;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const assignment = await tx.expenseBudgetAssignment.create({
          data: {
            workspaceId,
            expenseId,
            budgetId: classification.budgetId,
            status,
            confidence: classification.confidence > 0
              ? new Prisma.Decimal(classification.confidence)
              : null,
            matchedRuleId: classification.matchedRule?.id ?? null,
            reason: classification.reason,
            assignedBy,
          },
        });
        await tx.auditEvent.create({
          data: {
            accountId: expense.workspace.accountId,
            action: 'EXPENSE_BUDGET_CLASSIFIED',
            entityType: 'ExpenseBudgetAssignment',
            entityId: assignment.id,
            metadata: {
              workspaceId,
              expenseId,
              budgetId: classification.budgetId,
              status,
              matchedRuleId: classification.matchedRule?.id ?? null,
              reason: classification.reason,
              assignedBy,
            },
          },
        });
        return assignment;
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.prisma.expenseBudgetAssignment.findUniqueOrThrow({ where: { expenseId } });
      }
      throw error;
    }
  }
}
