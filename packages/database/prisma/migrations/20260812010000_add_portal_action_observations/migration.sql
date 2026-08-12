CREATE TABLE "PortalActionObservation" (
  "id" UUID NOT NULL,
  "portalSessionId" UUID NOT NULL,
  "invoiceRequestAttemptId" UUID,
  "stageKey" TEXT NOT NULL,
  "actionKey" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3) NOT NULL,
  "requestObserved" BOOLEAN NOT NULL DEFAULT false,
  "requestMethod" TEXT,
  "requestUrl" TEXT,
  "responseStatus" INTEGER,
  "requestDurationMs" INTEGER,
  "requestStructure" JSONB,
  "responseContentType" TEXT,
  "responseSummary" JSONB,
  "redirects" JSONB,
  "networkErrors" JSONB,
  "javascriptErrors" JSONB,
  "consoleMessages" JSONB,
  "beforeSnapshot" JSONB NOT NULL,
  "afterSnapshot" JSONB NOT NULL,
  "resolvedSnapshot" JSONB NOT NULL,
  "beforeScreenshot" BYTEA,
  "afterScreenshot" BYTEA,
  "resolvedScreenshot" BYTEA,
  "screenshotMimeType" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalActionObservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PortalActionObservation_portalSessionId_createdAt_idx"
  ON "PortalActionObservation"("portalSessionId", "createdAt");
CREATE INDEX "PortalActionObservation_invoiceRequestAttemptId_createdAt_idx"
  ON "PortalActionObservation"("invoiceRequestAttemptId", "createdAt");

ALTER TABLE "PortalActionObservation"
  ADD CONSTRAINT "PortalActionObservation_portalSessionId_fkey"
  FOREIGN KEY ("portalSessionId") REFERENCES "PortalSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PortalActionObservation"
  ADD CONSTRAINT "PortalActionObservation_invoiceRequestAttemptId_fkey"
  FOREIGN KEY ("invoiceRequestAttemptId") REFERENCES "InvoiceRequestAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
