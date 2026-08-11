ALTER TABLE "TaxProfile"
  ADD COLUMN "workspaceId" UUID,
  ADD COLUMN "postalCode" VARCHAR(5),
  ADD COLUMN "taxRegime" TEXT,
  ADD COLUMN "cfdiUse" TEXT,
  ADD COLUMN "billingEmail" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedByUserId" UUID;

UPDATE "TaxProfile" AS tp
SET "workspaceId" = candidate."workspaceId"
FROM (
  SELECT "accountId", MIN("id"::text)::uuid AS "workspaceId"
  FROM "Workspace"
  GROUP BY "accountId"
  HAVING COUNT(*) = 1
) AS candidate
WHERE candidate."accountId" = tp."accountId";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "TaxProfile" WHERE "workspaceId" IS NULL) THEN
    RAISE EXCEPTION 'Cannot assign existing TaxProfile to a unique Workspace';
  END IF;
END $$;

ALTER TABLE "TaxProfile" ALTER COLUMN "workspaceId" SET NOT NULL;
DROP INDEX "TaxProfile_accountId_rfc_key";
CREATE UNIQUE INDEX "TaxProfile_workspaceId_rfc_key" ON "TaxProfile"("workspaceId", "rfc");
CREATE INDEX "TaxProfile_workspaceId_idx" ON "TaxProfile"("workspaceId");
CREATE UNIQUE INDEX "TaxProfile_one_active_per_workspace_key"
  ON "TaxProfile"("workspaceId")
  WHERE "status" = 'ACTIVE' AND "deletedAt" IS NULL;

ALTER TABLE "TaxProfile"
  ADD CONSTRAINT "TaxProfile_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TaxProfile_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TaxProfile_approval_pair_check"
  CHECK (("approvedAt" IS NULL AND "approvedByUserId" IS NULL) OR
         ("approvedAt" IS NOT NULL AND "approvedByUserId" IS NOT NULL));
