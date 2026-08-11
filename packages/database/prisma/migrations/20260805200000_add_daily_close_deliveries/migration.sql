CREATE TYPE "DailyCloseDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

CREATE TABLE "DailyCloseDelivery" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "localDate" DATE NOT NULL,
    "channel" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "status" "DailyCloseDeliveryStatus" NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCloseDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyCloseDelivery_workspaceId_localDate_channel_conversationId_key"
ON "DailyCloseDelivery"("workspaceId", "localDate", "channel", "conversationId");
CREATE INDEX "DailyCloseDelivery_workspaceId_status_idx"
ON "DailyCloseDelivery"("workspaceId", "status");
CREATE INDEX "DailyCloseDelivery_status_attemptedAt_idx"
ON "DailyCloseDelivery"("status", "attemptedAt");

ALTER TABLE "DailyCloseDelivery"
ADD CONSTRAINT "DailyCloseDelivery_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
