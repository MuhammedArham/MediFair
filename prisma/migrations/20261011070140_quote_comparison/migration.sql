-- AlterTable
ALTER TABLE "Quote" ADD COLUMN "financialEvidenceConfirmedAt" DATETIME;
ALTER TABLE "Quote" ADD COLUMN "financialEvidenceNote" TEXT;
ALTER TABLE "Quote" ADD COLUMN "scopeConfirmedAt" DATETIME;
ALTER TABLE "Quote" ADD COLUMN "scopeEvidenceNote" TEXT;
