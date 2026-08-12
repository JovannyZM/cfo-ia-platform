ALTER TYPE "InvoiceRequestStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED_PENDING';
ALTER TYPE "InvoiceRequestStatus" ADD VALUE IF NOT EXISTS 'DOCUMENTS_TIMEOUT';
ALTER TYPE "InvoiceDocumentType" ADD VALUE IF NOT EXISTS 'OTHER';

ALTER TABLE "InvoiceRequest"
  ADD COLUMN "externalReference" TEXT,
  ADD COLUMN "pendingSince" TIMESTAMP(3),
  ADD COLUMN "nextCheckAt" TIMESTAMP(3),
  ADD COLUMN "documentsDeadline" TIMESTAMP(3),
  ADD COLUMN "pendingCheckCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "maxPendingChecks" INTEGER NOT NULL DEFAULT 12;

ALTER TABLE "InvoiceDocument"
  ADD COLUMN "attemptId" UUID,
  ADD COLUMN "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
  ADD COLUMN "sizeBytes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "InvoiceDocument" ADD CONSTRAINT "InvoiceDocument_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "InvoiceRequestAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "InvoiceDocument_invoiceRequestId_checksum_key" ON "InvoiceDocument"("invoiceRequestId", "checksum");
CREATE INDEX "InvoiceDocument_attemptId_idx" ON "InvoiceDocument"("attemptId");

CREATE TABLE "TemporaryEvidenceObject" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "expenseId" UUID,
  "invoiceRequestId" UUID,
  "sourceEventId" UUID NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "storageReference" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TemporaryEvidenceObject_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TemporaryEvidenceObject_sourceEventId_key" ON "TemporaryEvidenceObject"("sourceEventId");
CREATE UNIQUE INDEX "TemporaryEvidenceObject_storageReference_key" ON "TemporaryEvidenceObject"("storageReference");
CREATE UNIQUE INDEX "TemporaryEvidenceObject_workspaceId_sha256_key" ON "TemporaryEvidenceObject"("workspaceId", "sha256");
CREATE INDEX "TemporaryEvidenceObject_expiresAt_deletedAt_idx" ON "TemporaryEvidenceObject"("expiresAt", "deletedAt");
CREATE INDEX "TemporaryEvidenceObject_expenseId_idx" ON "TemporaryEvidenceObject"("expenseId");
CREATE INDEX "TemporaryEvidenceObject_invoiceRequestId_idx" ON "TemporaryEvidenceObject"("invoiceRequestId");
ALTER TABLE "TemporaryEvidenceObject" ADD CONSTRAINT "TemporaryEvidenceObject_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TemporaryEvidenceObject" ADD CONSTRAINT "TemporaryEvidenceObject_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TemporaryEvidenceObject" ADD CONSTRAINT "TemporaryEvidenceObject_invoiceRequestId_fkey" FOREIGN KEY ("invoiceRequestId") REFERENCES "InvoiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "InvoiceRequest_status_nextCheckAt_idx" ON "InvoiceRequest"("status", "nextCheckAt");
