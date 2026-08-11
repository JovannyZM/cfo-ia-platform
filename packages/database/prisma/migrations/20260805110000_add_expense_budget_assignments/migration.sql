CREATE TYPE "ExpenseBudgetAssignmentStatus" AS ENUM ('ASSIGNED', 'AMBIGUOUS', 'UNMATCHED');
CREATE TYPE "ExpenseBudgetAssignedBy" AS ENUM ('RULE', 'EXPLICIT_USER', 'MANUAL');

CREATE TABLE "ExpenseBudgetAssignment" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "expenseId" UUID NOT NULL,
    "budgetId" UUID,
    "status" "ExpenseBudgetAssignmentStatus" NOT NULL,
    "confidence" DECIMAL(5,4),
    "matchedRuleId" UUID,
    "reason" TEXT NOT NULL,
    "assignedBy" "ExpenseBudgetAssignedBy" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExpenseBudgetAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExpenseBudgetAssignment_expenseId_key" ON "ExpenseBudgetAssignment"("expenseId");
CREATE INDEX "ExpenseBudgetAssignment_workspaceId_status_idx" ON "ExpenseBudgetAssignment"("workspaceId", "status");
CREATE INDEX "ExpenseBudgetAssignment_budgetId_status_idx" ON "ExpenseBudgetAssignment"("budgetId", "status");
CREATE INDEX "ExpenseBudgetAssignment_matchedRuleId_idx" ON "ExpenseBudgetAssignment"("matchedRuleId");

ALTER TABLE "ExpenseBudgetAssignment" ADD CONSTRAINT "ExpenseBudgetAssignment_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseBudgetAssignment" ADD CONSTRAINT "ExpenseBudgetAssignment_expenseId_fkey"
FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseBudgetAssignment" ADD CONSTRAINT "ExpenseBudgetAssignment_budgetId_fkey"
FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseBudgetAssignment" ADD CONSTRAINT "ExpenseBudgetAssignment_matchedRuleId_fkey"
FOREIGN KEY ("matchedRuleId") REFERENCES "BudgetMatchingRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
