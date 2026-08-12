CREATE TABLE "SupplementalExpenseEvidence" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "expenseId" UUID NOT NULL,
  "invoiceRequestId" UUID NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "source" TEXT NOT NULL,
  "identifiers" JSONB NOT NULL,
  "extractedAmount" DECIMAL(19,4) NOT NULL,
  "extractedDate" TIMESTAMP(3) NOT NULL,
  "extractedMerchant" TEXT NOT NULL,
  "providedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplementalExpenseEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplementalExpenseEvidence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupplementalExpenseEvidence_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupplementalExpenseEvidence_invoiceRequestId_fkey" FOREIGN KEY ("invoiceRequestId") REFERENCES "InvoiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupplementalExpenseEvidence_providedByUserId_fkey" FOREIGN KEY ("providedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SupplementalExpenseEvidence_invoiceRequestId_sha256_key" ON "SupplementalExpenseEvidence"("invoiceRequestId", "sha256");
CREATE INDEX "SupplementalExpenseEvidence_workspaceId_expenseId_idx" ON "SupplementalExpenseEvidence"("workspaceId", "expenseId");
CREATE INDEX "SupplementalExpenseEvidence_sha256_idx" ON "SupplementalExpenseEvidence"("sha256");
