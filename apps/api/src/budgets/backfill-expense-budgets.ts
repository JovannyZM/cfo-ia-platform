import {
  ExpenseBudgetAssignmentStatus,
  ExpenseStatus,
} from '@prisma/client';
import { BudgetClassifierService } from './budget-classifier.service';
import { ExpenseBudgetAssignmentService } from './expense-budget-assignment.service';
import { PrismaService } from '../prisma.service';

export const DEMO_WORKSPACE_ID = '00000000-0000-4000-8000-000000000007';

export async function backfillExpenseBudgets(
  prisma: PrismaService,
  assignments: ExpenseBudgetAssignmentService,
  workspaceId: string,
) {
  const expenses = await prisma.expense.findMany({
    where: {
      workspaceId,
      status: ExpenseStatus.REGISTERED,
      budgetAssignment: null,
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  for (const expense of expenses) await assignments.assign(expense.id, workspaceId);

  const grouped = await prisma.expenseBudgetAssignment.groupBy({
    by: ['status'],
    where: { workspaceId, expense: { status: ExpenseStatus.REGISTERED } },
    _count: { _all: true },
  });
  const count = (status: ExpenseBudgetAssignmentStatus) =>
    grouped.find((row) => row.status === status)?._count._all ?? 0;
  return {
    ASSIGNED: count(ExpenseBudgetAssignmentStatus.ASSIGNED),
    AMBIGUOUS: count(ExpenseBudgetAssignmentStatus.AMBIGUOUS),
    UNMATCHED: count(ExpenseBudgetAssignmentStatus.UNMATCHED),
  };
}

async function main(): Promise<void> {
  const workspaceId = process.argv[2] ?? DEMO_WORKSPACE_ID;
  const prisma = new PrismaService();
  const classifier = new BudgetClassifierService(prisma);
  const assignments = new ExpenseBudgetAssignmentService(prisma, classifier);
  try {
    const result = await backfillExpenseBudgets(prisma, assignments, workspaceId);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Backfill failed'}\n`);
    process.exitCode = 1;
  });
}
