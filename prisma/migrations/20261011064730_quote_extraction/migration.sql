-- CreateTable
CREATE TABLE "QuoteExtraction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailMessageId" TEXT NOT NULL,
    "quoteId" TEXT,
    "providerMode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "resultJson" TEXT,
    "reviewedResultJson" TEXT,
    "errorSummary" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "reviewedAt" DATETIME,
    CONSTRAINT "QuoteExtraction_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuoteExtraction_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuoteEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "extractionId" TEXT NOT NULL,
    "fieldPath" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "startOffset" INTEGER,
    "endOffset" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuoteEvidence_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "QuoteExtraction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "QuoteExtraction_emailMessageId_key" ON "QuoteExtraction"("emailMessageId");

-- CreateIndex
CREATE INDEX "QuoteExtraction_quoteId_status_idx" ON "QuoteExtraction"("quoteId", "status");

-- CreateIndex
CREATE INDEX "QuoteEvidence_extractionId_fieldPath_idx" ON "QuoteEvidence"("extractionId", "fieldPath");
