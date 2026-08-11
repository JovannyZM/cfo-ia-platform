ALTER TABLE "Expense"
  ADD COLUMN "sourceChannel" TEXT,
  ADD COLUMN "sourceConversationId" TEXT;

CREATE INDEX "Expense_workspaceId_sourceChannel_sourceConversationId_createdAt_idx"
  ON "Expense"("workspaceId", "sourceChannel", "sourceConversationId", "createdAt");
