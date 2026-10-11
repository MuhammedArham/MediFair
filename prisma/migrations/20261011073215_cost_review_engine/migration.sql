-- CreateTable
CREATE TABLE "CaseReviewPreference" (
    "caseId" TEXT NOT NULL PRIMARY KEY,
    "financialHardshipDisclosedAt" DATETIME,
    "specialistFeeRequestAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CaseReviewPreference_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CaseComplaint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "party" TEXT NOT NULL,
    "providerId" TEXT,
    "summary" TEXT NOT NULL,
    "documentedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "isFictional" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "CaseComplaint_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewOpportunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stableKey" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "providerId" TEXT,
    "insurerName" TEXT,
    "quoteId" TEXT,
    "documentId" TEXT,
    "complaintId" TEXT,
    "title" TEXT NOT NULL,
    "evidenceJson" TEXT NOT NULL,
    "missingInformationJson" TEXT NOT NULL,
    "ruleTriggered" TEXT NOT NULL,
    "officialSourceUrl" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "responsibleParty" TEXT NOT NULL,
    "suggestedQuestionsJson" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL,
    "potentialImpactCents" INTEGER,
    "priorityScore" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "requestDraftBody" TEXT,
    "requestDraftCreatedAt" DATETIME,
    "isFictional" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReviewOpportunity_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewOpportunity_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReviewOpportunity_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReviewOpportunity_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReviewOpportunity_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "CaseComplaint" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CaseComplaint_caseId_resolvedAt_idx" ON "CaseComplaint"("caseId", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewOpportunity_stableKey_key" ON "ReviewOpportunity"("stableKey");

-- CreateIndex
CREATE INDEX "ReviewOpportunity_caseId_status_priorityScore_idx" ON "ReviewOpportunity"("caseId", "status", "priorityScore");
