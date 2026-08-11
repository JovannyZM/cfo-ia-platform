ALTER TABLE "Expense" ADD COLUMN "evidenceSha256" CHAR(64);

CREATE UNIQUE INDEX "Expense_workspaceId_evidenceSha256_key"
ON "Expense"("workspaceId", "evidenceSha256");
