-- CreateTable
CREATE TABLE "CasePreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "preferredLocation" TEXT NOT NULL,
    "travelDistanceKm" INTEGER,
    "budgetCents" INTEGER,
    "preferredProviderName" TEXT,
    "preferredHospitalName" TEXT,
    "accessibilityNotes" TEXT,
    "languagePreference" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CasePreference_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "medicalSpecialty" TEXT,
    "laterality" TEXT NOT NULL DEFAULT 'UNSPECIFIED',
    "referralStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "medicareEligibility" TEXT NOT NULL DEFAULT 'UNKNOWN',
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
INSERT INTO "new_Case" ("clinicianConfirmedAt", "createdAt", "id", "insuranceProfileId", "isFictional", "laterality", "mbsItemNumber", "mbsItemStatus", "patientProfileId", "postcode", "procedureName", "sourceReferenceId", "state", "status", "suburb", "title", "updatedAt") SELECT "clinicianConfirmedAt", "createdAt", "id", "insuranceProfileId", "isFictional", "laterality", "mbsItemNumber", "mbsItemStatus", "patientProfileId", "postcode", "procedureName", "sourceReferenceId", "state", "status", "suburb", "title", "updatedAt" FROM "Case";
DROP TABLE "Case";
ALTER TABLE "new_Case" RENAME TO "Case";
CREATE INDEX "Case_patientProfileId_status_idx" ON "Case"("patientProfileId", "status");
CREATE INDEX "Case_postcode_idx" ON "Case"("postcode");
CREATE TABLE "new_InsuranceProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientProfileId" TEXT NOT NULL,
    "policyLabel" TEXT NOT NULL,
    "insurerName" TEXT,
    "policyType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "hospitalCoverTier" TEXT,
    "policyDetails" TEXT,
    "membershipStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "knownExcessCents" INTEGER,
    "knownCopaymentCents" INTEGER,
    "coverageVerificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "coverageVerifiedAt" DATETIME,
    "isFictional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InsuranceProfile_patientProfileId_fkey" FOREIGN KEY ("patientProfileId") REFERENCES "PatientProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_InsuranceProfile" ("coverageVerificationStatus", "coverageVerifiedAt", "createdAt", "id", "insurerName", "isFictional", "knownExcessCents", "membershipStatus", "patientProfileId", "policyLabel", "policyType", "updatedAt") SELECT "coverageVerificationStatus", "coverageVerifiedAt", "createdAt", "id", "insurerName", "isFictional", "knownExcessCents", "membershipStatus", "patientProfileId", "policyLabel", "policyType", "updatedAt" FROM "InsuranceProfile";
DROP TABLE "InsuranceProfile";
ALTER TABLE "new_InsuranceProfile" RENAME TO "InsuranceProfile";
CREATE INDEX "InsuranceProfile_insurerName_idx" ON "InsuranceProfile"("insurerName");
CREATE UNIQUE INDEX "InsuranceProfile_patientProfileId_policyLabel_key" ON "InsuranceProfile"("patientProfileId", "policyLabel");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "CasePreference_caseId_key" ON "CasePreference"("caseId");
