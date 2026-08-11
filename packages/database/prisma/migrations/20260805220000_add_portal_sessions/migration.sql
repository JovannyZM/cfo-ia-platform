CREATE TYPE "PortalSessionStatus" AS ENUM (
  'CREATED',
  'RUNNING',
  'WAITING_HUMAN',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'UNKNOWN_OUTCOME'
);

CREATE TABLE "PortalSession" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "capability" TEXT NOT NULL,
  "adapterKey" TEXT NOT NULL,
  "status" "PortalSessionStatus" NOT NULL DEFAULT 'CREATED',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "currentUrl" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortalSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PortalSession_workspaceId_status_createdAt_idx"
  ON "PortalSession"("workspaceId", "status", "createdAt");
CREATE INDEX "PortalSession_adapterKey_createdAt_idx"
  ON "PortalSession"("adapterKey", "createdAt");

ALTER TABLE "PortalSession"
  ADD CONSTRAINT "PortalSession_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
