-- CreateTable
CREATE TABLE "DocumentAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "providerMode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "pageTextJson" TEXT,
    "resultJson" TEXT,
    "reviewedResultJson" TEXT,
    "errorSummary" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DocumentAnalysis_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BillReviewOpportunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "primaryDocumentId" TEXT NOT NULL,
    "comparedDocumentId" TEXT,
    "quoteId" TEXT,
    "title" TEXT NOT NULL,
    "detailsJson" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "isFictional" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillReviewOpportunity_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BillReviewOpportunity_primaryDocumentId_fkey" FOREIGN KEY ("primaryDocumentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BillReviewOpportunity_comparedDocumentId_fkey" FOREIGN KEY ("comparedDocumentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BillReviewOpportunity_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "providerId" TEXT,
    "emailMessageId" TEXT,
    "kind" TEXT NOT NULL,
    "documentType" TEXT NOT NULL DEFAULT 'OTHER',
    "sourceType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER,
    "storageKey" TEXT,
    "sha256" TEXT,
    "isFictional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Document_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Document_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Document_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Document" ("byteSize", "caseId", "createdAt", "emailMessageId", "fileName", "id", "isFictional", "kind", "mimeType", "providerId", "sha256", "sourceType", "storageKey") SELECT "byteSize", "caseId", "createdAt", "emailMessageId", "fileName", "id", "isFictional", "kind", "mimeType", "providerId", "sha256", "sourceType", "storageKey" FROM "Document";
DROP TABLE "Document";
ALTER TABLE "new_Document" RENAME TO "Document";
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");
CREATE INDEX "Document_caseId_kind_idx" ON "Document"("caseId", "kind");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "DocumentAnalysis_documentId_key" ON "DocumentAnalysis"("documentId");

-- CreateIndex
CREATE INDEX "DocumentAnalysis_status_createdAt_idx" ON "DocumentAnalysis"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BillReviewOpportunity_caseId_createdAt_idx" ON "BillReviewOpportunity"("caseId", "createdAt");
