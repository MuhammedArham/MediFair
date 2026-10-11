/*
  Warnings:

  - You are about to drop the `Message` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `label` on the `Case` table. All the data in the column will be lost.
  - You are about to drop the column `label` on the `Provider` table. All the data in the column will be lost.
  - You are about to drop the column `feeCents` on the `Quote` table. All the data in the column will be lost.
  - You are about to drop the column `gapCents` on the `Quote` table. All the data in the column will be lost.
  - You are about to drop the column `insurerCents` on the `Quote` table. All the data in the column will be lost.
  - You are about to drop the column `medicareCents` on the `Quote` table. All the data in the column will be lost.
  - You are about to drop the column `sourceMessageId` on the `Quote` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `Quote` table. All the data in the column will be lost.
  - Added the required column `patientProfileId` to the `Case` table without a default value. This is not possible if the table is not empty.
  - Added the required column `postcode` to the `Case` table without a default value. This is not possible if the table is not empty.
  - Added the required column `procedureName` to the `Case` table without a default value. This is not possible if the table is not empty.
  - Added the required column `state` to the `Case` table without a default value. This is not possible if the table is not empty.
  - Added the required column `suburb` to the `Case` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `Case` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contactSource` to the `Provider` table without a default value. This is not possible if the table is not empty.
  - Added the required column `postcode` to the `Provider` table without a default value. This is not possible if the table is not empty.
  - Added the required column `practiceName` to the `Provider` table without a default value. This is not possible if the table is not empty.
  - Added the required column `state` to the `Provider` table without a default value. This is not possible if the table is not empty.
  - Added the required column `suburb` to the `Provider` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Provider` table without a default value. This is not possible if the table is not empty.
  - Added the required column `issueDate` to the `Quote` table without a default value. This is not possible if the table is not empty.
  - Added the required column `procedureName` to the `Quote` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Quote` table without a default value. This is not possible if the table is not empty.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Message";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "PatientProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "isFictional" BOOLEAN NOT NULL DEFAULT false,
    "consentGivenAt" DATETIME,
    "consentScope" TEXT,
    "consentWithdrawnAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InsuranceProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientProfileId" TEXT NOT NULL,
    "policyLabel" TEXT NOT NULL,
    "insurerName" TEXT NOT NULL,
    "policyType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "membershipStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "knownExcessCents" INTEGER,
    "coverageVerificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "coverageVerifiedAt" DATETIME,
    "isFictional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InsuranceProfile_patientProfileId_fkey" FOREIGN KEY ("patientProfileId") REFERENCES "PatientProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourceReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publicationDate" DATETIME,
    "effectiveDate" DATETIME,
    "effectiveNote" TEXT,
    "retrievedAt" DATETIME NOT NULL,
    "evidenceNotes" TEXT NOT NULL,
    "mbsItemNumber" TEXT,
    "isOfficial" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Hospital" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "suburb" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "isFictional" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "ProviderHospital" (
    "providerId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,

    PRIMARY KEY ("providerId", "hospitalId"),
    CONSTRAINT "ProviderHospital_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProviderHospital_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuoteRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "requestVersion" INTEGER NOT NULL DEFAULT 1,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
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

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "providerId" TEXT,
    "quoteRequestId" TEXT,
    "direction" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "externalMessageId" TEXT,
    "threadId" TEXT,
    "deliveryStatus" TEXT NOT NULL,
    "sentAt" DATETIME,
    "receivedAt" DATETIME,
    "isSimulation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailMessage_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EmailMessage_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EmailMessage_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailMessageId" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailEvent_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "providerId" TEXT,
    "emailMessageId" TEXT,
    "kind" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "CostLineItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quoteId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "payer" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "billedAmountCents" INTEGER,
    "knownBenefitCents" INTEGER,
    "patientResponsibilityCents" INTEGER,
    "sourceEmailId" TEXT,
    "sourceDocumentId" TEXT,
    "sourceLocator" TEXT,
    "isFictional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CostLineItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CostLineItem_sourceEmailId_fkey" FOREIGN KEY ("sourceEmailId") REFERENCES "EmailMessage" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CostLineItem_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quoteId" TEXT NOT NULL,
    "sourceReferenceId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "supportingEvidence" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "isFictional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Opportunity_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Opportunity_sourceReferenceId_fkey" FOREIGN KEY ("sourceReferenceId") REFERENCES "SourceReference" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Negotiation" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Negotiation_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Negotiation_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Negotiation_originalQuoteId_fkey" FOREIGN KEY ("originalQuoteId") REFERENCES "Quote" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Negotiation_revisedQuoteId_fkey" FOREIGN KEY ("revisedQuoteId") REFERENCES "Quote" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "patientProfileId" TEXT,
    "quoteRequestId" TEXT,
    "emailMessageId" TEXT,
    "negotiationId" TEXT,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "eventKey" TEXT,
    "detailsJson" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AuditEvent_patientProfileId_fkey" FOREIGN KEY ("patientProfileId") REFERENCES "PatientProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditEvent_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditEvent_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditEvent_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "Negotiation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Case" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientProfileId" TEXT NOT NULL,
    "insuranceProfileId" TEXT,
    "sourceReferenceId" TEXT,
    "title" TEXT NOT NULL,
    "procedureName" TEXT NOT NULL,
    "laterality" TEXT NOT NULL DEFAULT 'UNSPECIFIED',
    "clinicianConfirmedAt" DATETIME,
    "mbsItemNumber" TEXT,
    "mbsItemStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "suburb" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isFictional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Case_patientProfileId_fkey" FOREIGN KEY ("patientProfileId") REFERENCES "PatientProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Case_insuranceProfileId_fkey" FOREIGN KEY ("insuranceProfileId") REFERENCES "InsuranceProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Case_sourceReferenceId_fkey" FOREIGN KEY ("sourceReferenceId") REFERENCES "SourceReference" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Case" ("createdAt", "id", "status", "updatedAt") SELECT "createdAt", "id", "status", "updatedAt" FROM "Case";
DROP TABLE "Case";
ALTER TABLE "new_Case" RENAME TO "Case";
CREATE INDEX "Case_patientProfileId_status_idx" ON "Case"("patientProfileId", "status");
CREATE INDEX "Case_postcode_idx" ON "Case"("postcode");
CREATE TABLE "new_Provider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "practiceName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "suburb" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "contactSource" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedAt" DATETIME,
    "isFictional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Provider" ("email", "id") SELECT "email", "id" FROM "Provider";
DROP TABLE "Provider";
ALTER TABLE "new_Provider" RENAME TO "Provider";
CREATE UNIQUE INDEX "Provider_email_key" ON "Provider"("email");
CREATE INDEX "Provider_suburb_state_idx" ON "Provider"("suburb", "state");
CREATE UNIQUE INDEX "Provider_practiceName_postcode_key" ON "Provider"("practiceName", "postcode");
CREATE TABLE "new_Quote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "sourceEmailId" TEXT,
    "sourceDocumentId" TEXT,
    "revisionOfId" TEXT,
    "revisionNumber" INTEGER NOT NULL DEFAULT 1,
    "procedureName" TEXT NOT NULL,
    "issueDate" DATETIME NOT NULL,
    "expiryDate" DATETIME,
    "completeness" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "confirmationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "isFictional" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Quote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Quote_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Quote_sourceEmailId_fkey" FOREIGN KEY ("sourceEmailId") REFERENCES "EmailMessage" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Quote_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Quote_revisionOfId_fkey" FOREIGN KEY ("revisionOfId") REFERENCES "Quote" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Quote" ("caseId", "createdAt", "id", "providerId") SELECT "caseId", "createdAt", "id", "providerId" FROM "Quote";
DROP TABLE "Quote";
ALTER TABLE "new_Quote" RENAME TO "Quote";
CREATE INDEX "Quote_caseId_confirmationStatus_idx" ON "Quote"("caseId", "confirmationStatus");
CREATE UNIQUE INDEX "Quote_caseId_providerId_revisionNumber_key" ON "Quote"("caseId", "providerId", "revisionNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PatientProfile_email_key" ON "PatientProfile"("email");

-- CreateIndex
CREATE INDEX "InsuranceProfile_insurerName_idx" ON "InsuranceProfile"("insurerName");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceProfile_patientProfileId_policyLabel_key" ON "InsuranceProfile"("patientProfileId", "policyLabel");

-- CreateIndex
CREATE INDEX "SourceReference_mbsItemNumber_idx" ON "SourceReference"("mbsItemNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SourceReference_url_retrievedAt_key" ON "SourceReference"("url", "retrievedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Hospital_name_postcode_key" ON "Hospital"("name", "postcode");

-- CreateIndex
CREATE INDEX "QuoteRequest_status_createdAt_idx" ON "QuoteRequest"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRequest_caseId_providerId_requestVersion_key" ON "QuoteRequest"("caseId", "providerId", "requestVersion");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_externalMessageId_key" ON "EmailMessage"("externalMessageId");

-- CreateIndex
CREATE INDEX "EmailMessage_caseId_createdAt_idx" ON "EmailMessage"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailMessage_threadId_idx" ON "EmailMessage"("threadId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailEvent_providerEventId_key" ON "EmailEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "EmailEvent_emailMessageId_type_idx" ON "EmailEvent"("emailMessageId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");

-- CreateIndex
CREATE INDEX "Document_caseId_kind_idx" ON "Document"("caseId", "kind");

-- CreateIndex
CREATE INDEX "CostLineItem_quoteId_category_idx" ON "CostLineItem"("quoteId", "category");

-- CreateIndex
CREATE INDEX "Opportunity_quoteId_status_idx" ON "Opportunity"("quoteId", "status");

-- CreateIndex
CREATE INDEX "Negotiation_caseId_status_idx" ON "Negotiation"("caseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_eventKey_key" ON "AuditEvent"("eventKey");

-- CreateIndex
CREATE INDEX "AuditEvent_caseId_occurredAt_idx" ON "AuditEvent"("caseId", "occurredAt");
