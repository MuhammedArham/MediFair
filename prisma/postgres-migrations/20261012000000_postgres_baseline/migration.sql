-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('DRAFT', 'REQUESTING_QUOTES', 'COMPARING', 'NEGOTIATING', 'CLOSED');

-- CreateEnum
CREATE TYPE "Laterality" AS ENUM ('LEFT', 'RIGHT', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "MbsItemStatus" AS ENUM ('ILLUSTRATIVE', 'CLINICIAN_CONFIRMED', 'PROVIDER_CONFIRMED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MedicareEligibility" AS ENUM ('YES', 'NO', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('REFERRAL', 'TREATMENT_PLAN', 'BOTH', 'NEITHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PolicyType" AS ENUM ('HOSPITAL', 'EXTRAS', 'COMBINED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CoverageStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'PATIENT_REPORTED_CONFIRMED', 'INSURER_CONFIRMED', 'NOT_COVERED');

-- CreateEnum
CREATE TYPE "ProviderVerificationStatus" AS ENUM ('DEMO_ONLY', 'UNVERIFIED', 'USER_VERIFIED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "ProviderSourceType" AS ENUM ('DEMO', 'VERIFIED_EXTERNAL');

-- CreateEnum
CREATE TYPE "QuoteRequestStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED', 'SENT', 'SIMULATED', 'REPLIED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "QuoteResponseStatus" AS ENUM ('NONE', 'COMPLETE_QUOTE', 'INCOMPLETE_QUOTE', 'CONSULTATION_REQUIRED', 'NO_GAP_STATED', 'DISCOUNT_REFUSED', 'REDUCED_QUOTE', 'MORE_INFORMATION_REQUIRED', 'AMBIGUOUS');

-- CreateEnum
CREATE TYPE "EmailDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('DRAFT', 'QUEUED', 'SENT', 'DELIVERED', 'RECEIVED', 'BOUNCED', 'FAILED', 'SIMULATED');

-- CreateEnum
CREATE TYPE "OutboundSendStatus" AS ENUM ('SENDING', 'SENT', 'AUTH_ERROR', 'DOMAIN_ERROR', 'RATE_LIMITED', 'FAILED', 'UNCERTAIN', 'SIMULATED');

-- CreateEnum
CREATE TYPE "EmailMatchStatus" AS ENUM ('MATCHED', 'UNMATCHED', 'PROVIDER_MISMATCH');

-- CreateEnum
CREATE TYPE "EmailEventType" AS ENUM ('SENT', 'DELIVERED', 'BOUNCED', 'RECEIVED', 'FAILED');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('QUOTE', 'INVOICE', 'OTHER');

-- CreateEnum
CREATE TYPE "MedicalDocumentType" AS ENUM ('SPECIALIST_ESTIMATE', 'HOSPITAL_QUOTE', 'ANAESTHETIST_QUOTE', 'FINAL_INVOICE', 'BENEFIT_STATEMENT', 'PREVIOUS_ESTIMATE', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentAnalysisStatus" AS ENUM ('COMPLETE', 'MANUAL_REVIEW', 'FAILED');

-- CreateEnum
CREATE TYPE "DocumentSourceType" AS ENUM ('DEMO', 'UPLOAD', 'EMAIL');

-- CreateEnum
CREATE TYPE "QuoteCompleteness" AS ENUM ('COMPLETE', 'INCOMPLETE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "QuoteConfirmationStatus" AS ENUM ('UNVERIFIED', 'PROVIDER_STATED', 'PATIENT_VERIFIED');

-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('COMPLETE', 'UNSUPPORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "AIProviderMode" AS ENUM ('MOCK_AI', 'OPENAI');

-- CreateEnum
CREATE TYPE "CostCategory" AS ENUM ('SURGEON', 'ANAESTHETIST', 'HOSPITAL', 'THEATRE', 'ACCOMMODATION', 'DEVICES', 'MEDICINES', 'EXCESS', 'CO_PAYMENT', 'MEDICARE_BENEFIT', 'INSURER_BENEFIT', 'OTHER');

-- CreateEnum
CREATE TYPE "Payer" AS ENUM ('PATIENT', 'MEDICARE', 'INSURER', 'PROVIDER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "OpportunityType" AS ENUM ('ITEMISATION', 'GAP_SCHEME', 'COVERAGE_CHECK', 'BILL_CORRECTION', 'PAYMENT_PLAN', 'OTHER');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('PROPOSED', 'PURSUED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ReviewCategory" AS ENUM ('MISSING_ITEMISATION', 'GAP_COVER_ENQUIRY', 'SPECIALIST_FEE_NEGOTIATION', 'FINANCIAL_HARDSHIP', 'QUOTE_VS_INVOICE', 'POSSIBLE_BILLING_ERROR', 'INSURANCE_COVERAGE_REVIEW', 'COMPLAINT_PATHWAY');

-- CreateEnum
CREATE TYPE "ComplaintParty" AS ENUM ('INSURER', 'PROVIDER', 'PUBLIC_HOSPITAL');

-- CreateEnum
CREATE TYPE "ReviewVerificationStatus" AS ENUM ('SOURCE_VERIFIED', 'NEEDS_HUMAN_REVIEW');

-- CreateEnum
CREATE TYPE "NegotiationStatus" AS ENUM ('DRAFT', 'AWAITING_APPROVAL', 'SIMULATED_SENT', 'SENT', 'AWAITING_RESPONSE', 'NEEDS_CLARIFICATION', 'COUNTEROFFERED', 'ACCEPTED', 'REJECTED', 'CLOSED', 'APPROVED', 'AGREED');

-- CreateEnum
CREATE TYPE "NegotiationRequestStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED', 'SENDING', 'SIMULATED', 'SENT', 'FAILED', 'UNCERTAIN');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CASE_CREATED', 'CASE_UPDATED', 'PRACTICES_SELECTED', 'PRACTICE_ADDED', 'PRACTICE_UPDATED', 'CONSENT_GRANTED', 'CONSENT_WITHDRAWN', 'REQUEST_APPROVED', 'REQUEST_DRAFTED', 'REQUEST_EDITED', 'REQUEST_REJECTED', 'SEND_CLAIMED', 'SEND_FAILED', 'MESSAGE_SENT', 'MESSAGE_SIMULATED', 'INBOUND_RECEIVED', 'INBOUND_UNMATCHED', 'MESSAGE_READ', 'QUOTE_ADDED', 'QUOTE_REVISED', 'QUOTE_EXTRACTION_COMPLETED', 'QUOTE_EXTRACTION_CORRECTED', 'QUOTE_EVIDENCE_CONFIRMED', 'QUOTE_SCOPE_CONFIRMED', 'DOCUMENT_UPLOADED', 'DOCUMENT_REVIEWED', 'DOCUMENT_DELETED', 'DOCUMENT_OPPORTUNITY_ADDED', 'NEGOTIATION_UPDATED', 'DEMO_RESET');

-- CreateEnum
CREATE TYPE "AuditActor" AS ENUM ('PATIENT', 'PROVIDER', 'SYSTEM');

-- CreateTable
CREATE TABLE "PatientProfile" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "isFictional" BOOLEAN NOT NULL DEFAULT false,
    "consentGivenAt" TIMESTAMP(3),
    "consentScope" TEXT,
    "consentWithdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceProfile" (
    "id" TEXT NOT NULL,
    "patientProfileId" TEXT NOT NULL,
    "policyLabel" TEXT NOT NULL,
    "insurerName" TEXT,
    "policyType" "PolicyType" NOT NULL DEFAULT 'UNKNOWN',
    "hospitalCoverTier" TEXT,
    "policyDetails" TEXT,
    "membershipStatus" "MembershipStatus" NOT NULL DEFAULT 'UNKNOWN',
    "knownExcessCents" INTEGER,
    "knownCopaymentCents" INTEGER,
    "coverageVerificationStatus" "CoverageStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "coverageVerifiedAt" TIMESTAMP(3),
    "isFictional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsuranceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceReference" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publicationDate" TIMESTAMP(3),
    "effectiveDate" TIMESTAMP(3),
    "effectiveNote" TEXT,
    "retrievedAt" TIMESTAMP(3) NOT NULL,
    "evidenceNotes" TEXT NOT NULL,
    "mbsItemNumber" TEXT,
    "isOfficial" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SourceReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "patientProfileId" TEXT NOT NULL,
    "insuranceProfileId" TEXT,
    "sourceReferenceId" TEXT,
    "title" TEXT NOT NULL,
    "procedureName" TEXT NOT NULL,
    "medicalSpecialty" TEXT,
    "laterality" "Laterality" NOT NULL DEFAULT 'UNSPECIFIED',
    "referralStatus" "ReferralStatus" NOT NULL DEFAULT 'UNKNOWN',
    "medicareEligibility" "MedicareEligibility" NOT NULL DEFAULT 'UNKNOWN',
    "clinicianConfirmedAt" TIMESTAMP(3),
    "mbsItemNumber" TEXT,
    "mbsItemStatus" "MbsItemStatus" NOT NULL DEFAULT 'UNKNOWN',
    "suburb" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'DRAFT',
    "isFictional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CasePreference" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "preferredLocation" TEXT NOT NULL,
    "travelDistanceKm" INTEGER,
    "budgetCents" INTEGER,
    "preferredProviderName" TEXT,
    "preferredHospitalName" TEXT,
    "accessibilityNotes" TEXT,
    "languagePreference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CasePreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hospital" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "suburb" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "isFictional" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Hospital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL,
    "practiceName" TEXT NOT NULL,
    "medicalSpecialty" TEXT,
    "sourceType" "ProviderSourceType" NOT NULL DEFAULT 'DEMO',
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
    "verifiedByUserAt" TIMESTAMP(3),
    "verificationStatus" "ProviderVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedAt" TIMESTAMP(3),
    "isFictional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseProviderSelection" (
    "caseId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseProviderSelection_pkey" PRIMARY KEY ("caseId","providerId")
);

-- CreateTable
CREATE TABLE "ProviderHospital" (
    "providerId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,

    CONSTRAINT "ProviderHospital_pkey" PRIMARY KEY ("providerId","hospitalId")
);

-- CreateTable
CREATE TABLE "QuoteRequest" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "requestVersion" INTEGER NOT NULL DEFAULT 1,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "QuoteRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "quoteResponseStatus" "QuoteResponseStatus" NOT NULL DEFAULT 'NONE',
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedContentHash" TEXT,
    "sentAt" TIMESTAMP(3),
    "isSimulation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundSend" (
    "id" TEXT NOT NULL,
    "quoteRequestId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "replyIdentifier" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "replyToEmail" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "approvedContentHash" TEXT NOT NULL,
    "status" "OutboundSendStatus" NOT NULL DEFAULT 'SENDING',
    "providerMessageId" TEXT,
    "errorCode" TEXT,
    "errorSummary" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundSend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "caseId" TEXT,
    "providerId" TEXT,
    "quoteRequestId" TEXT,
    "negotiationId" TEXT,
    "direction" "EmailDirection" NOT NULL,
    "fromAddress" TEXT,
    "recipientAddress" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "externalMessageId" TEXT,
    "threadId" TEXT,
    "deliveryStatus" "EmailDeliveryStatus" NOT NULL,
    "matchStatus" "EmailMatchStatus",
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "attachmentMetadataJson" TEXT,
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "isSimulation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailEvent" (
    "id" TEXT NOT NULL,
    "emailMessageId" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "type" "EmailEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "providerId" TEXT,
    "emailMessageId" TEXT,
    "kind" "DocumentKind" NOT NULL,
    "documentType" "MedicalDocumentType" NOT NULL DEFAULT 'OTHER',
    "sourceType" "DocumentSourceType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER,
    "storageKey" TEXT,
    "sha256" TEXT,
    "isFictional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentAnalysis" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "providerMode" "AIProviderMode" NOT NULL,
    "status" "DocumentAnalysisStatus" NOT NULL,
    "pageTextJson" TEXT,
    "resultJson" TEXT,
    "reviewedResultJson" TEXT,
    "errorSummary" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillReviewOpportunity" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "primaryDocumentId" TEXT NOT NULL,
    "comparedDocumentId" TEXT,
    "quoteId" TEXT,
    "title" TEXT NOT NULL,
    "detailsJson" TEXT NOT NULL,
    "confidence" "Confidence" NOT NULL,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'PROPOSED',
    "isFictional" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillReviewOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "sourceEmailId" TEXT,
    "sourceDocumentId" TEXT,
    "revisionOfId" TEXT,
    "revisionNumber" INTEGER NOT NULL DEFAULT 1,
    "procedureName" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "completeness" "QuoteCompleteness" NOT NULL DEFAULT 'UNKNOWN',
    "confirmationStatus" "QuoteConfirmationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "scopeConfirmedAt" TIMESTAMP(3),
    "scopeEvidenceNote" TEXT,
    "financialEvidenceConfirmedAt" TIMESTAMP(3),
    "financialEvidenceNote" TEXT,
    "isFictional" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteExtraction" (
    "id" TEXT NOT NULL,
    "emailMessageId" TEXT NOT NULL,
    "quoteId" TEXT,
    "providerMode" "AIProviderMode" NOT NULL,
    "status" "ExtractionStatus" NOT NULL,
    "resultJson" TEXT,
    "reviewedResultJson" TEXT,
    "errorSummary" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "QuoteExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteEvidence" (
    "id" TEXT NOT NULL,
    "extractionId" TEXT NOT NULL,
    "fieldPath" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "startOffset" INTEGER,
    "endOffset" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostLineItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "category" "CostCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "payer" "Payer" NOT NULL DEFAULT 'UNKNOWN',
    "billedAmountCents" INTEGER,
    "knownBenefitCents" INTEGER,
    "patientResponsibilityCents" INTEGER,
    "sourceEmailId" TEXT,
    "sourceDocumentId" TEXT,
    "sourceLocator" TEXT,
    "isFictional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "sourceReferenceId" TEXT,
    "type" "OpportunityType" NOT NULL,
    "title" TEXT NOT NULL,
    "supportingEvidence" TEXT NOT NULL,
    "confidence" "Confidence" NOT NULL,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'PROPOSED',
    "isFictional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseReviewPreference" (
    "caseId" TEXT NOT NULL,
    "financialHardshipDisclosedAt" TIMESTAMP(3),
    "specialistFeeRequestAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseReviewPreference_pkey" PRIMARY KEY ("caseId")
);

-- CreateTable
CREATE TABLE "CaseComplaint" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "party" "ComplaintParty" NOT NULL,
    "providerId" TEXT,
    "summary" TEXT NOT NULL,
    "documentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "isFictional" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CaseComplaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewOpportunity" (
    "id" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "category" "ReviewCategory" NOT NULL,
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
    "confidence" "Confidence" NOT NULL,
    "verificationStatus" "ReviewVerificationStatus" NOT NULL,
    "potentialImpactCents" INTEGER,
    "priorityScore" INTEGER NOT NULL,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'PROPOSED',
    "requestDraftBody" TEXT,
    "requestDraftCreatedAt" TIMESTAMP(3),
    "isFictional" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Negotiation" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "originalQuoteId" TEXT NOT NULL,
    "revisedQuoteId" TEXT,
    "originalRequest" TEXT NOT NULL,
    "counteroffer" TEXT,
    "status" "NegotiationStatus" NOT NULL DEFAULT 'DRAFT',
    "agreedResult" TEXT,
    "agreedPatientAmountCents" INTEGER,
    "isSimulation" BOOLEAN NOT NULL DEFAULT false,
    "billOpportunityId" TEXT,
    "reviewOpportunityId" TEXT,
    "requestType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Negotiation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NegotiationRequest" (
    "id" TEXT NOT NULL,
    "negotiationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "recipientVerifiedAt" TIMESTAMP(3),
    "subject" TEXT NOT NULL,
    "draftBody" TEXT NOT NULL,
    "approvedBody" TEXT,
    "approvedContentHash" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "status" "NegotiationRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "supportingDocumentsJson" TEXT NOT NULL DEFAULT '[]',
    "informationDisclosedJson" TEXT NOT NULL DEFAULT '[]',
    "reason" TEXT NOT NULL,
    "originalPatientGapCents" INTEGER,
    "replyIdentifier" TEXT,
    "idempotencyKey" TEXT,
    "providerMessageId" TEXT,
    "sendError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NegotiationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NegotiationResponse" (
    "id" TEXT NOT NULL,
    "negotiationId" TEXT NOT NULL,
    "emailMessageId" TEXT NOT NULL,
    "providerMode" "AIProviderMode" NOT NULL,
    "interpretationJson" TEXT,
    "interpretationStatus" TEXT NOT NULL,
    "errorSummary" TEXT,
    "revisedQuoteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NegotiationResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "patientProfileId" TEXT,
    "quoteRequestId" TEXT,
    "emailMessageId" TEXT,
    "negotiationId" TEXT,
    "action" "AuditAction" NOT NULL,
    "actor" "AuditActor" NOT NULL,
    "eventKey" TEXT,
    "detailsJson" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

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
CREATE INDEX "Case_patientProfileId_status_idx" ON "Case"("patientProfileId", "status");

-- CreateIndex
CREATE INDEX "Case_postcode_idx" ON "Case"("postcode");

-- CreateIndex
CREATE UNIQUE INDEX "CasePreference_caseId_key" ON "CasePreference"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "Hospital_name_postcode_key" ON "Hospital"("name", "postcode");

-- CreateIndex
CREATE UNIQUE INDEX "Provider_email_key" ON "Provider"("email");

-- CreateIndex
CREATE INDEX "Provider_suburb_state_idx" ON "Provider"("suburb", "state");

-- CreateIndex
CREATE INDEX "Provider_ownerCaseId_sourceType_idx" ON "Provider"("ownerCaseId", "sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "Provider_practiceName_postcode_key" ON "Provider"("practiceName", "postcode");

-- CreateIndex
CREATE INDEX "CaseProviderSelection_providerId_idx" ON "CaseProviderSelection"("providerId");

-- CreateIndex
CREATE INDEX "QuoteRequest_status_createdAt_idx" ON "QuoteRequest"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRequest_caseId_providerId_requestVersion_key" ON "QuoteRequest"("caseId", "providerId", "requestVersion");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundSend_quoteRequestId_key" ON "OutboundSend"("quoteRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundSend_idempotencyKey_key" ON "OutboundSend"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundSend_replyIdentifier_key" ON "OutboundSend"("replyIdentifier");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundSend_providerMessageId_key" ON "OutboundSend"("providerMessageId");

-- CreateIndex
CREATE INDEX "OutboundSend_caseId_status_idx" ON "OutboundSend"("caseId", "status");

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
CREATE UNIQUE INDEX "DocumentAnalysis_documentId_key" ON "DocumentAnalysis"("documentId");

-- CreateIndex
CREATE INDEX "DocumentAnalysis_status_createdAt_idx" ON "DocumentAnalysis"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BillReviewOpportunity_caseId_createdAt_idx" ON "BillReviewOpportunity"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "Quote_caseId_confirmationStatus_idx" ON "Quote"("caseId", "confirmationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_caseId_providerId_revisionNumber_key" ON "Quote"("caseId", "providerId", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteExtraction_emailMessageId_key" ON "QuoteExtraction"("emailMessageId");

-- CreateIndex
CREATE INDEX "QuoteExtraction_quoteId_status_idx" ON "QuoteExtraction"("quoteId", "status");

-- CreateIndex
CREATE INDEX "QuoteEvidence_extractionId_fieldPath_idx" ON "QuoteEvidence"("extractionId", "fieldPath");

-- CreateIndex
CREATE INDEX "CostLineItem_quoteId_category_idx" ON "CostLineItem"("quoteId", "category");

-- CreateIndex
CREATE INDEX "Opportunity_quoteId_status_idx" ON "Opportunity"("quoteId", "status");

-- CreateIndex
CREATE INDEX "CaseComplaint_caseId_resolvedAt_idx" ON "CaseComplaint"("caseId", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewOpportunity_stableKey_key" ON "ReviewOpportunity"("stableKey");

-- CreateIndex
CREATE INDEX "ReviewOpportunity_caseId_status_priorityScore_idx" ON "ReviewOpportunity"("caseId", "status", "priorityScore");

-- CreateIndex
CREATE UNIQUE INDEX "Negotiation_billOpportunityId_key" ON "Negotiation"("billOpportunityId");

-- CreateIndex
CREATE INDEX "Negotiation_caseId_status_idx" ON "Negotiation"("caseId", "status");

-- CreateIndex
CREATE INDEX "Negotiation_reviewOpportunityId_idx" ON "Negotiation"("reviewOpportunityId");

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

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_eventKey_key" ON "AuditEvent"("eventKey");

-- CreateIndex
CREATE INDEX "AuditEvent_caseId_occurredAt_idx" ON "AuditEvent"("caseId", "occurredAt");

-- AddForeignKey
ALTER TABLE "InsuranceProfile" ADD CONSTRAINT "InsuranceProfile_patientProfileId_fkey" FOREIGN KEY ("patientProfileId") REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_patientProfileId_fkey" FOREIGN KEY ("patientProfileId") REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_insuranceProfileId_fkey" FOREIGN KEY ("insuranceProfileId") REFERENCES "InsuranceProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_sourceReferenceId_fkey" FOREIGN KEY ("sourceReferenceId") REFERENCES "SourceReference"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CasePreference" ADD CONSTRAINT "CasePreference_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_ownerCaseId_fkey" FOREIGN KEY ("ownerCaseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseProviderSelection" ADD CONSTRAINT "CaseProviderSelection_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseProviderSelection" ADD CONSTRAINT "CaseProviderSelection_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderHospital" ADD CONSTRAINT "ProviderHospital_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderHospital" ADD CONSTRAINT "ProviderHospital_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "PatientProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundSend" ADD CONSTRAINT "OutboundSend_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundSend" ADD CONSTRAINT "OutboundSend_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundSend" ADD CONSTRAINT "OutboundSend_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "Negotiation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailEvent" ADD CONSTRAINT "EmailEvent_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAnalysis" ADD CONSTRAINT "DocumentAnalysis_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillReviewOpportunity" ADD CONSTRAINT "BillReviewOpportunity_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillReviewOpportunity" ADD CONSTRAINT "BillReviewOpportunity_primaryDocumentId_fkey" FOREIGN KEY ("primaryDocumentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillReviewOpportunity" ADD CONSTRAINT "BillReviewOpportunity_comparedDocumentId_fkey" FOREIGN KEY ("comparedDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillReviewOpportunity" ADD CONSTRAINT "BillReviewOpportunity_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_sourceEmailId_fkey" FOREIGN KEY ("sourceEmailId") REFERENCES "EmailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_revisionOfId_fkey" FOREIGN KEY ("revisionOfId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteExtraction" ADD CONSTRAINT "QuoteExtraction_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteExtraction" ADD CONSTRAINT "QuoteExtraction_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteEvidence" ADD CONSTRAINT "QuoteEvidence_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "QuoteExtraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostLineItem" ADD CONSTRAINT "CostLineItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostLineItem" ADD CONSTRAINT "CostLineItem_sourceEmailId_fkey" FOREIGN KEY ("sourceEmailId") REFERENCES "EmailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostLineItem" ADD CONSTRAINT "CostLineItem_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_sourceReferenceId_fkey" FOREIGN KEY ("sourceReferenceId") REFERENCES "SourceReference"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseReviewPreference" ADD CONSTRAINT "CaseReviewPreference_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseComplaint" ADD CONSTRAINT "CaseComplaint_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewOpportunity" ADD CONSTRAINT "ReviewOpportunity_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewOpportunity" ADD CONSTRAINT "ReviewOpportunity_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewOpportunity" ADD CONSTRAINT "ReviewOpportunity_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewOpportunity" ADD CONSTRAINT "ReviewOpportunity_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewOpportunity" ADD CONSTRAINT "ReviewOpportunity_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "CaseComplaint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negotiation" ADD CONSTRAINT "Negotiation_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negotiation" ADD CONSTRAINT "Negotiation_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negotiation" ADD CONSTRAINT "Negotiation_originalQuoteId_fkey" FOREIGN KEY ("originalQuoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negotiation" ADD CONSTRAINT "Negotiation_revisedQuoteId_fkey" FOREIGN KEY ("revisedQuoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negotiation" ADD CONSTRAINT "Negotiation_billOpportunityId_fkey" FOREIGN KEY ("billOpportunityId") REFERENCES "BillReviewOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negotiation" ADD CONSTRAINT "Negotiation_reviewOpportunityId_fkey" FOREIGN KEY ("reviewOpportunityId") REFERENCES "ReviewOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationRequest" ADD CONSTRAINT "NegotiationRequest_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "Negotiation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationRequest" ADD CONSTRAINT "NegotiationRequest_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationRequest" ADD CONSTRAINT "NegotiationRequest_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationRequest" ADD CONSTRAINT "NegotiationRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "PatientProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationResponse" ADD CONSTRAINT "NegotiationResponse_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "Negotiation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_patientProfileId_fkey" FOREIGN KEY ("patientProfileId") REFERENCES "PatientProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "Negotiation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
