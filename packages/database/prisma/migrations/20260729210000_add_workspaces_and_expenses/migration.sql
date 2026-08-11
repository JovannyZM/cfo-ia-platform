CREATE TYPE "ExpenseStatus" AS ENUM ('REGISTERED');

CREATE TABLE "Workspace" (
  "id" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "baseCurrency" VARCHAR(3) NOT NULL DEFAULT 'MXN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Workspace_baseCurrency_check" CHECK ("baseCurrency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "Expense" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "sourceEventId" UUID NOT NULL,
  "merchantName" TEXT NOT NULL,
  "description" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "originalAmount" DECIMAL(19,4) NOT NULL,
  "originalCurrency" VARCHAR(3) NOT NULL,
  "exchangeRate" DECIMAL(19,8) NOT NULL,
  "baseAmount" DECIMAL(19,4) NOT NULL,
  "category" TEXT,
  "paymentMethod" TEXT,
  "status" "ExpenseStatus" NOT NULL DEFAULT 'REGISTERED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Expense_originalCurrency_check" CHECK ("originalCurrency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "Expense_originalAmount_check" CHECK ("originalAmount" > 0),
  CONSTRAINT "Expense_exchangeRate_check" CHECK ("exchangeRate" > 0)
);

CREATE UNIQUE INDEX "Expense_sourceEventId_key" ON "Expense"("sourceEventId");
CREATE INDEX "Workspace_accountId_idx" ON "Workspace"("accountId");
CREATE INDEX "Expense_workspaceId_occurredAt_idx" ON "Expense"("workspaceId", "occurredAt");
CREATE INDEX "Expense_workspaceId_status_idx" ON "Expense"("workspaceId", "status");

ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
