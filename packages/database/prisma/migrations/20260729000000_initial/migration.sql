CREATE TYPE "PlatformRole" AS ENUM ('PLATFORM_ADMIN');
CREATE TYPE "AccountRole" AS ENUM ('ACCOUNT_OWNER', 'ACCOUNT_ADMIN', 'MEMBER', 'VIEWER');
CREATE TYPE "TaxProfileStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'CANCELLED');
CREATE TYPE "TaxProfileRequestStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'AWAITING_PAYMENT', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED');
CREATE TYPE "SubscriptionItemStatus" AS ENUM ('ACTIVE', 'CANCELLED');

CREATE TABLE "Account" (
  "id" UUID NOT NULL, "name" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, "deletedAt" TIMESTAMP(3), CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "User" (
  "id" UUID NOT NULL, "email" TEXT NOT NULL, "name" TEXT NOT NULL, "platformRole" "PlatformRole",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3), CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AccountMember" (
  "id" UUID NOT NULL, "accountId" UUID NOT NULL, "userId" UUID NOT NULL, "role" "AccountRole" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3), CONSTRAINT "AccountMember_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TaxProfile" (
  "id" UUID NOT NULL, "accountId" UUID NOT NULL, "rfc" VARCHAR(13) NOT NULL, "legalName" TEXT NOT NULL,
  "status" "TaxProfileStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, "deletedAt" TIMESTAMP(3), CONSTRAINT "TaxProfile_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TaxProfileRequest" (
  "id" UUID NOT NULL, "accountId" UUID NOT NULL, "requestedById" UUID NOT NULL, "reviewedById" UUID,
  "taxProfileId" UUID, "rfc" VARCHAR(13) NOT NULL, "legalName" TEXT NOT NULL,
  "status" "TaxProfileRequestStatus" NOT NULL DEFAULT 'SUBMITTED', "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3), CONSTRAINT "TaxProfileRequest_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "UserTaxProfileAccess" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "taxProfileId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3), CONSTRAINT "UserTaxProfileAccess_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Subscription" (
  "id" UUID NOT NULL, "accountId" UUID NOT NULL, "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "currency" VARCHAR(3) NOT NULL DEFAULT 'MXN', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, "cancelledAt" TIMESTAMP(3), CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SubscriptionItem" (
  "id" UUID NOT NULL, "subscriptionId" UUID NOT NULL, "taxProfileId" UUID NOT NULL,
  "status" "SubscriptionItemStatus" NOT NULL DEFAULT 'ACTIVE', "unitAmount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "cancelledAt" TIMESTAMP(3), CONSTRAINT "SubscriptionItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AuditEvent" (
  "id" UUID NOT NULL, "accountId" UUID, "actorUserId" UUID, "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL, "entityId" UUID NOT NULL, "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "AccountMember_accountId_userId_key" ON "AccountMember"("accountId", "userId");
CREATE UNIQUE INDEX "TaxProfile_accountId_rfc_key" ON "TaxProfile"("accountId", "rfc");
CREATE UNIQUE INDEX "TaxProfileRequest_taxProfileId_key" ON "TaxProfileRequest"("taxProfileId");
CREATE UNIQUE INDEX "UserTaxProfileAccess_userId_taxProfileId_key" ON "UserTaxProfileAccess"("userId", "taxProfileId");
CREATE UNIQUE INDEX "SubscriptionItem_subscriptionId_taxProfileId_key" ON "SubscriptionItem"("subscriptionId", "taxProfileId");
CREATE INDEX "Account_deletedAt_idx" ON "Account"("deletedAt");
CREATE INDEX "User_platformRole_idx" ON "User"("platformRole");
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
CREATE INDEX "AccountMember_userId_deletedAt_idx" ON "AccountMember"("userId", "deletedAt");
CREATE INDEX "AccountMember_accountId_role_idx" ON "AccountMember"("accountId", "role");
CREATE INDEX "TaxProfile_accountId_status_idx" ON "TaxProfile"("accountId", "status");
CREATE INDEX "TaxProfile_deletedAt_idx" ON "TaxProfile"("deletedAt");
CREATE INDEX "TaxProfileRequest_accountId_status_idx" ON "TaxProfileRequest"("accountId", "status");
CREATE INDEX "TaxProfileRequest_status_createdAt_idx" ON "TaxProfileRequest"("status", "createdAt");
CREATE INDEX "TaxProfileRequest_requestedById_idx" ON "TaxProfileRequest"("requestedById");
CREATE INDEX "UserTaxProfileAccess_taxProfileId_revokedAt_idx" ON "UserTaxProfileAccess"("taxProfileId", "revokedAt");
CREATE INDEX "Subscription_accountId_status_idx" ON "Subscription"("accountId", "status");
CREATE INDEX "SubscriptionItem_taxProfileId_status_idx" ON "SubscriptionItem"("taxProfileId", "status");
CREATE INDEX "AuditEvent_accountId_createdAt_idx" ON "AuditEvent"("accountId", "createdAt");
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");
CREATE INDEX "AuditEvent_actorUserId_createdAt_idx" ON "AuditEvent"("actorUserId", "createdAt");

ALTER TABLE "AccountMember" ADD CONSTRAINT "AccountMember_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountMember" ADD CONSTRAINT "AccountMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaxProfile" ADD CONSTRAINT "TaxProfile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaxProfileRequest" ADD CONSTRAINT "TaxProfileRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaxProfileRequest" ADD CONSTRAINT "TaxProfileRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaxProfileRequest" ADD CONSTRAINT "TaxProfileRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaxProfileRequest" ADD CONSTRAINT "TaxProfileRequest_taxProfileId_fkey" FOREIGN KEY ("taxProfileId") REFERENCES "TaxProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserTaxProfileAccess" ADD CONSTRAINT "UserTaxProfileAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserTaxProfileAccess" ADD CONSTRAINT "UserTaxProfileAccess_taxProfileId_fkey" FOREIGN KEY ("taxProfileId") REFERENCES "TaxProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionItem" ADD CONSTRAINT "SubscriptionItem_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionItem" ADD CONSTRAINT "SubscriptionItem_taxProfileId_fkey" FOREIGN KEY ("taxProfileId") REFERENCES "TaxProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
