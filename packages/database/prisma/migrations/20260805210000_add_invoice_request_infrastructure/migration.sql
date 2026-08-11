CREATE TYPE "InvoiceRequestStatus" AS ENUM ('PENDING', 'NEEDS_TAX_DATA', 'READY', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "InvoiceRequestAttemptStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "InvoiceDocumentType" AS ENUM ('XML', 'PDF');
CREATE TYPE "MerchantInvoiceStrategyType" AS ENUM ('STANDARD_FORM', 'CUSTOM_ADAPTER', 'EMAIL', 'WHATSAPP', 'MANUAL');

CREATE TABLE "InvoiceRequest" (
  "id" UUID NOT NULL, "workspaceId" UUID NOT NULL, "expenseId" UUID,
  "sourceEvidenceId" UUID, "merchantName" TEXT NOT NULL, "merchantKey" TEXT NOT NULL,
  "status" "InvoiceRequestStatus" NOT NULL DEFAULT 'PENDING', "channel" TEXT NOT NULL,
  "taxProfileId" UUID, "requestedByUserId" UUID NOT NULL, "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3), CONSTRAINT "InvoiceRequest_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "InvoiceRequestAttempt" (
  "id" UUID NOT NULL, "invoiceRequestId" UUID NOT NULL, "attemptNumber" INTEGER NOT NULL,
  "adapterKey" TEXT NOT NULL, "status" "InvoiceRequestAttemptStatus" NOT NULL DEFAULT 'PROCESSING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finishedAt" TIMESTAMP(3),
  "errorCode" TEXT, "errorMessage" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoiceRequestAttempt_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "InvoiceDocument" (
  "id" UUID NOT NULL, "invoiceRequestId" UUID NOT NULL, "documentType" "InvoiceDocumentType" NOT NULL,
  "fileName" TEXT NOT NULL, "storageReference" TEXT NOT NULL, "checksum" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoiceDocument_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MerchantInvoiceProfile" (
  "id" UUID NOT NULL, "merchantKey" TEXT NOT NULL, "displayName" TEXT NOT NULL,
  "strategyType" "MerchantInvoiceStrategyType", "active" BOOLEAN NOT NULL DEFAULT true,
  "adapterKey" TEXT, "configuration" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MerchantInvoiceProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InvoiceRequest_workspaceId_expenseId_taxProfileId_merchantKey_key" ON "InvoiceRequest"("workspaceId", "expenseId", "taxProfileId", "merchantKey");
CREATE UNIQUE INDEX "InvoiceRequest_workspaceId_sourceEvidenceId_taxProfileId_merchantKey_key" ON "InvoiceRequest"("workspaceId", "sourceEvidenceId", "taxProfileId", "merchantKey");
CREATE INDEX "InvoiceRequest_workspaceId_status_createdAt_idx" ON "InvoiceRequest"("workspaceId", "status", "createdAt");
CREATE INDEX "InvoiceRequest_taxProfileId_status_idx" ON "InvoiceRequest"("taxProfileId", "status");
CREATE INDEX "InvoiceRequest_requestedByUserId_createdAt_idx" ON "InvoiceRequest"("requestedByUserId", "createdAt");
CREATE UNIQUE INDEX "InvoiceRequestAttempt_invoiceRequestId_attemptNumber_key" ON "InvoiceRequestAttempt"("invoiceRequestId", "attemptNumber");
CREATE INDEX "InvoiceRequestAttempt_invoiceRequestId_status_idx" ON "InvoiceRequestAttempt"("invoiceRequestId", "status");
CREATE UNIQUE INDEX "InvoiceDocument_invoiceRequestId_documentType_key" ON "InvoiceDocument"("invoiceRequestId", "documentType");
CREATE INDEX "InvoiceDocument_checksum_idx" ON "InvoiceDocument"("checksum");
CREATE UNIQUE INDEX "MerchantInvoiceProfile_merchantKey_key" ON "MerchantInvoiceProfile"("merchantKey");
CREATE INDEX "MerchantInvoiceProfile_active_idx" ON "MerchantInvoiceProfile"("active");
ALTER TABLE "InvoiceRequest" ADD CONSTRAINT "InvoiceRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceRequest" ADD CONSTRAINT "InvoiceRequest_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceRequest" ADD CONSTRAINT "InvoiceRequest_taxProfileId_fkey" FOREIGN KEY ("taxProfileId") REFERENCES "TaxProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceRequest" ADD CONSTRAINT "InvoiceRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceRequestAttempt" ADD CONSTRAINT "InvoiceRequestAttempt_invoiceRequestId_fkey" FOREIGN KEY ("invoiceRequestId") REFERENCES "InvoiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceDocument" ADD CONSTRAINT "InvoiceDocument_invoiceRequestId_fkey" FOREIGN KEY ("invoiceRequestId") REFERENCES "InvoiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
