-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Negotiation_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Negotiation_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Negotiation_originalQuoteId_fkey" FOREIGN KEY ("originalQuoteId") REFERENCES "Quote" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Negotiation_revisedQuoteId_fkey" FOREIGN KEY ("revisedQuoteId") REFERENCES "Quote" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Negotiation_billOpportunityId_fkey" FOREIGN KEY ("billOpportunityId") REFERENCES "BillReviewOpportunity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Negotiation" ("agreedPatientAmountCents", "agreedResult", "caseId", "counteroffer", "createdAt", "id", "isSimulation", "originalQuoteId", "originalRequest", "providerId", "revisedQuoteId", "status", "updatedAt") SELECT "agreedPatientAmountCents", "agreedResult", "caseId", "counteroffer", "createdAt", "id", "isSimulation", "originalQuoteId", "originalRequest", "providerId", "revisedQuoteId", "status", "updatedAt" FROM "Negotiation";
DROP TABLE "Negotiation";
ALTER TABLE "new_Negotiation" RENAME TO "Negotiation";
CREATE UNIQUE INDEX "Negotiation_billOpportunityId_key" ON "Negotiation"("billOpportunityId");
CREATE INDEX "Negotiation_caseId_status_idx" ON "Negotiation"("caseId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
