-- CreateTable
CREATE TABLE "CaseProviderSelection" (
    "caseId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "selectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("caseId", "providerId"),
    CONSTRAINT "CaseProviderSelection_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CaseProviderSelection_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Provider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "practiceName" TEXT NOT NULL,
    "medicalSpecialty" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'DEMO',
    "websiteUrl" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "suburb" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "contactSource" TEXT NOT NULL,
    "contactSourceUrl" TEXT,
    "reportedHospitalName" TEXT,
    "ownerCaseId" TEXT,
    "verifiedByUserAt" DATETIME,
    "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedAt" DATETIME,
    "isFictional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Provider_ownerCaseId_fkey" FOREIGN KEY ("ownerCaseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Provider" ("contactSource", "createdAt", "email", "id", "isFictional", "phone", "postcode", "practiceName", "state", "suburb", "updatedAt", "verificationStatus", "verifiedAt") SELECT "contactSource", "createdAt", "email", "id", "isFictional", "phone", "postcode", "practiceName", "state", "suburb", "updatedAt", "verificationStatus", "verifiedAt" FROM "Provider";
DROP TABLE "Provider";
ALTER TABLE "new_Provider" RENAME TO "Provider";
CREATE UNIQUE INDEX "Provider_email_key" ON "Provider"("email");
CREATE INDEX "Provider_suburb_state_idx" ON "Provider"("suburb", "state");
CREATE INDEX "Provider_ownerCaseId_sourceType_idx" ON "Provider"("ownerCaseId", "sourceType");
CREATE UNIQUE INDEX "Provider_practiceName_postcode_key" ON "Provider"("practiceName", "postcode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CaseProviderSelection_providerId_idx" ON "CaseProviderSelection"("providerId");
