ALTER TYPE "ExpenseStatus" ADD VALUE 'CANCELLED';

ALTER TABLE "Expense"
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledByUserId" UUID,
  ADD COLUMN "cancellationReason" TEXT;

CREATE INDEX "Expense_cancelledByUserId_idx" ON "Expense"("cancelledByUserId");

ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_cancelledByUserId_fkey"
  FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
