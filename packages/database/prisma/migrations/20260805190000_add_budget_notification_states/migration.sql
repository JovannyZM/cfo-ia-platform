CREATE TYPE "BudgetAlertStatus" AS ENUM ('NORMAL', 'ATTENTION', 'EXCEEDED', 'CRITICAL');

CREATE TABLE "BudgetNotificationState" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "budgetId" UUID NOT NULL,
    "periodKey" TEXT NOT NULL,
    "lastNotifiedStatus" "BudgetAlertStatus" NOT NULL,
    "lastNotifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetNotificationState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BudgetNotificationState_workspaceId_budgetId_periodKey_key"
ON "BudgetNotificationState"("workspaceId", "budgetId", "periodKey");
CREATE INDEX "BudgetNotificationState_workspaceId_periodKey_idx"
ON "BudgetNotificationState"("workspaceId", "periodKey");
CREATE INDEX "BudgetNotificationState_budgetId_periodKey_idx"
ON "BudgetNotificationState"("budgetId", "periodKey");

ALTER TABLE "BudgetNotificationState"
ADD CONSTRAINT "BudgetNotificationState_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BudgetNotificationState"
ADD CONSTRAINT "BudgetNotificationState_budgetId_fkey"
FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
