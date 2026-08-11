CREATE TYPE "ConversationIntentType" AS ENUM ('NEW_EXPENSE', 'CORRECTION', 'CANCELLATION');
CREATE TYPE "ConversationSessionStatus" AS ENUM ('ACTIVE', 'WAITING_INPUT', 'COMPLETED', 'CANCELLED', 'EXPIRED');

CREATE TABLE "ConversationSession" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "sourceChannel" TEXT NOT NULL,
  "sourceConversationId" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "workerId" TEXT NOT NULL,
  "intentType" "ConversationIntentType" NOT NULL,
  "status" "ConversationSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "contextJson" JSONB NOT NULL,
  "pendingField" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  CONSTRAINT "ConversationSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConversationSession_workspaceId_sourceChannel_sourceConversationId_userId_status_idx"
  ON "ConversationSession"("workspaceId", "sourceChannel", "sourceConversationId", "userId", "status");
CREATE INDEX "ConversationSession_expiresAt_status_idx"
  ON "ConversationSession"("expiresAt", "status");
CREATE UNIQUE INDEX "ConversationSession_one_active_per_conversation"
  ON "ConversationSession"("workspaceId", "sourceChannel", "sourceConversationId", "userId")
  WHERE "status" IN ('ACTIVE', 'WAITING_INPUT');

ALTER TABLE "ConversationSession"
  ADD CONSTRAINT "ConversationSession_workspaceId_fkey" FOREIGN KEY ("workspaceId")
  REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConversationSession"
  ADD CONSTRAINT "ConversationSession_userId_fkey" FOREIGN KEY ("userId")
  REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
