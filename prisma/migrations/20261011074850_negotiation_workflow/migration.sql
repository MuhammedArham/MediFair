-- CreateTable
CREATE TABLE "NegotiationRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "negotiationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "draftBody" TEXT NOT NULL,
    "approvedBody" TEXT,
    "approvedContentHash" TEXT,
    "approvedAt" DATETIME,
    "approvedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "supportingDocumentsJson" TEXT NOT NULL DEFAULT '[]',
    "informationDisclosedJson" TEXT NOT NULL DEFAULT '[]',
    "reason" TEXT NOT NULL,
    "originalPatientGapCents" INTEGER,
    "replyIdentifier" TEXT,
    "idempotencyKey" TEXT,
    "providerMessageId" TEXT,
    "sendError" TEXT,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NegotiationRequest_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "Negotiation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NegotiationRequest_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NegotiationRequest_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NegotiationRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "PatientProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NegotiationResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "negotiationId" TEXT NOT NULL,
    "emailMessageId" TEXT NOT NULL,
    "providerMode" TEXT NOT NULL,
    "interpretationJson" TEXT,
    "interpretationStatus" TEXT NOT NULL,
    "errorSummary" TEXT,
    "revisedQuoteId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NegotiationResponse_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "Negotiation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EmailMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT,
    "providerId" TEXT,
    "quoteRequestId" TEXT,
    "negotiationId" TEXT,
    "direction" TEXT NOT NULL,
    "fromAddress" TEXT,
    "recipientAddress" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "externalMessageId" TEXT,
    "threadId" TEXT,
    "deliveryStatus" TEXT NOT NULL,
    "matchStatus" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "attachmentMetadataJson" TEXT,
    "sentAt" DATETIME,
    "receivedAt" DATETIME,
    "isSimulation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailMessage_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EmailMessage_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EmailMessage_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EmailMessage_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "Negotiation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_EmailMessage" ("attachmentMetadataJson", "body", "caseId", "createdAt", "deliveryStatus", "direction", "externalMessageId", "fromAddress", "id", "isRead", "isSimulation", "matchStatus", "providerId", "quoteRequestId", "receivedAt", "recipientAddress", "sentAt", "subject", "threadId") SELECT "attachmentMetadataJson", "body", "caseId", "createdAt", "deliveryStatus", "direction", "externalMessageId", "fromAddress", "id", "isRead", "isSimulation", "matchStatus", "providerId", "quoteRequestId", "receivedAt", "recipientAddress", "sentAt", "subject", "threadId" FROM "EmailMessage";
DROP TABLE "EmailMessage";
ALTER TABLE "new_EmailMessage" RENAME TO "EmailMessage";
CREATE UNIQUE INDEX "EmailMessage_externalMessageId_key" ON "EmailMessage"("externalMessageId");
CREATE INDEX "EmailMessage_caseId_createdAt_idx" ON "EmailMessage"("caseId", "createdAt");
CREATE INDEX "EmailMessage_threadId_idx" ON "EmailMessage"("threadId");
CREATE TABLE "new_Negotiation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "originalQuoteId" TEXT NOT NULL,
    "revisedQuoteId" TEXT,
    "originalRequest" TEXT NOT NULL,
    "counteroffer" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "agreedResult" TEXT,
    "agreedPatientAmountCents" INTEGER,
    "isSimulation" BOOLEAN NOT NULL DEFAULT false,
    "billOpportunityId" TEXT,
    "reviewOpportunityId" TEXT,
    "requestType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Negotiation_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Negotiation_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Negotiation_originalQuoteId_fkey" FOREIGN KEY ("originalQuoteId") REFERENCES "Quote" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Negotiation_revisedQuoteId_fkey" FOREIGN KEY ("revisedQuoteId") REFERENCES "Quote" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Negotiation_billOpportunityId_fkey" FOREIGN KEY ("billOpportunityId") REFERENCES "BillReviewOpportunity" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Negotiation_reviewOpportunityId_fkey" FOREIGN KEY ("reviewOpportunityId") REFERENCES "ReviewOpportunity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Negotiation" ("agreedPatientAmountCents", "agreedResult", "billOpportunityId", "caseId", "counteroffer", "createdAt", "id", "isSimulation", "originalQuoteId", "originalRequest", "providerId", "revisedQuoteId", "status", "updatedAt") SELECT "agreedPatientAmountCents", "agreedResult", "billOpportunityId", "caseId", "counteroffer", "createdAt", "id", "isSimulation", "originalQuoteId", "originalRequest", "providerId", "revisedQuoteId", "status", "updatedAt" FROM "Negotiation";
DROP TABLE "Negotiation";
ALTER TABLE "new_Negotiation" RENAME TO "Negotiation";
CREATE UNIQUE INDEX "Negotiation_billOpportunityId_key" ON "Negotiation"("billOpportunityId");
CREATE INDEX "Negotiation_caseId_status_idx" ON "Negotiation"("caseId", "status");
CREATE INDEX "Negotiation_reviewOpportunityId_idx" ON "Negotiation"("reviewOpportunityId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "NegotiationRequest_replyIdentifier_key" ON "NegotiationRequest"("replyIdentifier");

-- CreateIndex
CREATE UNIQUE INDEX "NegotiationRequest_idempotencyKey_key" ON "NegotiationRequest"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "NegotiationRequest_providerMessageId_key" ON "NegotiationRequest"("providerMessageId");

-- CreateIndex
CREATE INDEX "NegotiationRequest_caseId_status_idx" ON "NegotiationRequest"("caseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NegotiationRequest_negotiationId_version_key" ON "NegotiationRequest"("negotiationId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "NegotiationResponse_emailMessageId_key" ON "NegotiationResponse"("emailMessageId");

-- CreateIndex
CREATE INDEX "NegotiationResponse_negotiationId_createdAt_idx" ON "NegotiationResponse"("negotiationId", "createdAt");
