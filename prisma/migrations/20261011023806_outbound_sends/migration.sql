-- CreateTable
CREATE TABLE "OutboundSend" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quoteRequestId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "replyIdentifier" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "replyToEmail" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "approvedContentHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENDING',
    "providerMessageId" TEXT,
    "errorCode" TEXT,
    "errorSummary" TEXT,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OutboundSend_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OutboundSend_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OutboundSend_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "OutboundSend_quoteRequestId_key" ON "OutboundSend"("quoteRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundSend_idempotencyKey_key" ON "OutboundSend"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundSend_replyIdentifier_key" ON "OutboundSend"("replyIdentifier");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundSend_providerMessageId_key" ON "OutboundSend"("providerMessageId");

-- CreateIndex
CREATE INDEX "OutboundSend_caseId_status_idx" ON "OutboundSend"("caseId", "status");
