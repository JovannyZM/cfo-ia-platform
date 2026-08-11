CREATE TABLE "PaymentInstrument" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "bank" TEXT,
  "last4" VARCHAR(4),
  "holderName" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentInstrument_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Expense" ADD COLUMN "paymentLast4" VARCHAR(4);
ALTER TABLE "Expense" ADD COLUMN "spenderName" TEXT;
ALTER TABLE "Expense" ADD COLUMN "paymentInstrumentId" UUID;
UPDATE "Expense" SET "spenderName" = 'Pendiente de asignar' WHERE "spenderName" IS NULL;
ALTER TABLE "Expense" ALTER COLUMN "spenderName" SET NOT NULL;

CREATE TABLE "ExpenseConversation" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "externalChatId" TEXT NOT NULL,
  "draft" JSONB NOT NULL,
  "missingFields" TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExpenseConversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentInstrument_workspaceId_type_last4_key" ON "PaymentInstrument"("workspaceId", "type", "last4");
CREATE INDEX "PaymentInstrument_workspaceId_active_idx" ON "PaymentInstrument"("workspaceId", "active");
CREATE INDEX "Expense_paymentInstrumentId_idx" ON "Expense"("paymentInstrumentId");
CREATE UNIQUE INDEX "ExpenseConversation_workspaceId_externalChatId_key" ON "ExpenseConversation"("workspaceId", "externalChatId");
CREATE INDEX "ExpenseConversation_workspaceId_updatedAt_idx" ON "ExpenseConversation"("workspaceId", "updatedAt");

ALTER TABLE "PaymentInstrument" ADD CONSTRAINT "PaymentInstrument_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paymentInstrumentId_fkey" FOREIGN KEY ("paymentInstrumentId") REFERENCES "PaymentInstrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseConversation" ADD CONSTRAINT "ExpenseConversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
