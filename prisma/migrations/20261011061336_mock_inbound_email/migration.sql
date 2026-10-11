-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EmailMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT,
    "providerId" TEXT,
    "quoteRequestId" TEXT,
    "direction" TEXT NOT NULL,
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
    CONSTRAINT "EmailMessage_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_EmailMessage" ("body", "caseId", "createdAt", "deliveryStatus", "direction", "externalMessageId", "id", "isSimulation", "providerId", "quoteRequestId", "receivedAt", "sentAt", "subject", "threadId") SELECT "body", "caseId", "createdAt", "deliveryStatus", "direction", "externalMessageId", "id", "isSimulation", "providerId", "quoteRequestId", "receivedAt", "sentAt", "subject", "threadId" FROM "EmailMessage";
DROP TABLE "EmailMessage";
ALTER TABLE "new_EmailMessage" RENAME TO "EmailMessage";
CREATE UNIQUE INDEX "EmailMessage_externalMessageId_key" ON "EmailMessage"("externalMessageId");
CREATE INDEX "EmailMessage_caseId_createdAt_idx" ON "EmailMessage"("caseId", "createdAt");
CREATE INDEX "EmailMessage_threadId_idx" ON "EmailMessage"("threadId");
CREATE TABLE "new_QuoteRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "requestVersion" INTEGER NOT NULL DEFAULT 1,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "quoteResponseStatus" TEXT NOT NULL DEFAULT 'NONE',
    "approvedAt" DATETIME,
    "approvedById" TEXT,
    "approvedContentHash" TEXT,
    "sentAt" DATETIME,
    "isSimulation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QuoteRequest_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QuoteRequest_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QuoteRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "PatientProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_QuoteRequest" ("approvedAt", "approvedById", "approvedContentHash", "body", "caseId", "createdAt", "id", "isSimulation", "providerId", "recipientEmail", "requestVersion", "sentAt", "status", "subject", "updatedAt") SELECT "approvedAt", "approvedById", "approvedContentHash", "body", "caseId", "createdAt", "id", "isSimulation", "providerId", "recipientEmail", "requestVersion", "sentAt", "status", "subject", "updatedAt" FROM "QuoteRequest";
DROP TABLE "QuoteRequest";
ALTER TABLE "new_QuoteRequest" RENAME TO "QuoteRequest";
CREATE INDEX "QuoteRequest_status_createdAt_idx" ON "QuoteRequest"("status", "createdAt");
CREATE UNIQUE INDEX "QuoteRequest_caseId_providerId_requestVersion_key" ON "QuoteRequest"("caseId", "providerId", "requestVersion");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
