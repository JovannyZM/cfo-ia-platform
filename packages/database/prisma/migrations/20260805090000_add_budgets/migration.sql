CREATE TYPE "BudgetPeriod" AS ENUM ('MONTHLY', 'ANNUAL', 'PER_EVENT');
CREATE TYPE "BudgetNature" AS ENUM ('EXPENSE', 'SAVING', 'INVESTMENT');
CREATE TYPE "BudgetRuleType" AS ENUM ('EXPLICIT_ALIAS', 'MERCHANT_NAME', 'KEYWORD', 'EXPENSE_CATEGORY');

CREATE TABLE "Budget" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "period" "BudgetPeriod" NOT NULL,
    "nature" "BudgetNature" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BudgetMatchingRule" (
    "id" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "ruleType" "BudgetRuleType" NOT NULL,
    "value" TEXT NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BudgetMatchingRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Budget_workspaceId_name_key" ON "Budget"("workspaceId", "name");
CREATE INDEX "Budget_workspaceId_idx" ON "Budget"("workspaceId");
CREATE INDEX "Budget_active_idx" ON "Budget"("active");
CREATE INDEX "Budget_period_idx" ON "Budget"("period");
CREATE INDEX "Budget_workspaceId_active_period_idx" ON "Budget"("workspaceId", "active", "period");
CREATE UNIQUE INDEX "BudgetMatchingRule_budgetId_ruleType_normalizedValue_key" ON "BudgetMatchingRule"("budgetId", "ruleType", "normalizedValue");
CREATE INDEX "BudgetMatchingRule_budgetId_ruleType_idx" ON "BudgetMatchingRule"("budgetId", "ruleType");
CREATE INDEX "BudgetMatchingRule_normalizedValue_idx" ON "BudgetMatchingRule"("normalizedValue");
CREATE INDEX "BudgetMatchingRule_active_idx" ON "BudgetMatchingRule"("active");

ALTER TABLE "Budget" ADD CONSTRAINT "Budget_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BudgetMatchingRule" ADD CONSTRAINT "BudgetMatchingRule_budgetId_fkey"
FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
