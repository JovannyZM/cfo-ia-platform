CREATE TYPE "InvoiceDeliveryStrategy" AS ENUM ('IMMEDIATE', 'PORTAL_POLL', 'EMAIL_DELIVERY');
CREATE TYPE "InvoiceInboundMessageStatus" AS ENUM ('RECEIVED', 'MATCHED', 'UNMATCHED', 'PROCESSED');

ALTER TABLE "InvoiceRequest"
  ADD COLUMN "deliveryStrategy" "InvoiceDeliveryStrategy" NOT NULL DEFAULT 'IMMEDIATE',
  ADD COLUMN "deliveryEmail" TEXT,
  ADD COLUMN "billingRfcSnapshot" TEXT,
  ADD COLUMN "requestedAmountSnapshot" DECIMAL(18,6),
  ADD COLUMN "acceptedAt" TIMESTAMP(3);

CREATE TABLE "InvoiceInboundMessage" (
  "id" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "providerMessageId" TEXT NOT NULL,
  "senderAddress" TEXT NOT NULL,
  "recipientAddress" TEXT,
  "subjectHash" TEXT NOT NULL,
  "bodyHash" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "status" "InvoiceInboundMessageStatus" NOT NULL DEFAULT 'RECEIVED',
  "invoiceRequestId" UUID,
  "correlation" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InvoiceInboundMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InvoiceInboundMessage_invoiceRequestId_fkey" FOREIGN KEY ("invoiceRequestId") REFERENCES "InvoiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InvoiceInboundMessage_provider_providerMessageId_key" ON "InvoiceInboundMessage"("provider", "providerMessageId");
CREATE INDEX "InvoiceInboundMessage_invoiceRequestId_status_idx" ON "InvoiceInboundMessage"("invoiceRequestId", "status");
CREATE INDEX "InvoiceInboundMessage_recipientAddress_receivedAt_idx" ON "InvoiceInboundMessage"("recipientAddress", "receivedAt");
