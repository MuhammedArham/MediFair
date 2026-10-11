import { z } from "zod";

const text = z.string().trim().min(1);
export const cents = z.number().int().min(0).max(2_147_483_647).nullable();
export const australianPostcode = z.string().regex(/^\d{4}$/);
export const australianState = z.enum(["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"]);

export const patientInput = z.strictObject({
  id: text.optional(),
  displayName: text,
  email: z.email().optional(),
  isFictional: z.literal(true),
  consentGivenAt: z.date(),
  consentScope: text,
});

export const insuranceInput = z.strictObject({
  id: text.optional(),
  patientProfileId: text,
  policyLabel: text,
  insurerName: text.nullable(),
  policyType: z.enum(["HOSPITAL", "EXTRAS", "COMBINED", "UNKNOWN"]),
  membershipStatus: z.enum(["ACTIVE", "INACTIVE", "UNKNOWN"]),
  knownExcessCents: cents,
  coverageVerificationStatus: z.enum(["UNVERIFIED", "PENDING", "PATIENT_REPORTED_CONFIRMED", "INSURER_CONFIRMED", "NOT_COVERED"]),
  isFictional: z.literal(true),
});

export const caseInput = z.strictObject({
  id: text.optional(),
  patientProfileId: text,
  insuranceProfileId: text.nullable(),
  sourceReferenceId: text.nullable(),
  title: text,
  procedureName: text,
  medicalSpecialty: text.nullable().optional(),
  laterality: z.enum(["LEFT", "RIGHT", "UNSPECIFIED"]),
  clinicianConfirmedAt: z.date().nullable(),
  mbsItemNumber: text.nullable(),
  mbsItemStatus: z.enum(["ILLUSTRATIVE", "CLINICIAN_CONFIRMED", "PROVIDER_CONFIRMED", "UNKNOWN"]),
  suburb: text,
  state: australianState,
  postcode: australianPostcode,
  status: z.enum(["DRAFT", "REQUESTING_QUOTES", "COMPARING", "NEGOTIATING", "CLOSED"]),
  isFictional: z.literal(true),
});

export const providerInput = z.strictObject({
  id: text.optional(),
  practiceName: text,
  medicalSpecialty: text.nullable().optional(),
  sourceType: z.literal("DEMO").optional(),
  websiteUrl: z.url().nullable().optional(),
  email: z.email().nullable(),
  phone: text.nullable(),
  suburb: text,
  state: australianState,
  postcode: australianPostcode,
  contactSource: text,
  contactSourceUrl: z.url().nullable().optional(),
  verificationStatus: z.enum(["DEMO_ONLY", "UNVERIFIED", "VERIFIED"]),
  isFictional: z.literal(true),
});

export const quoteRequestInput = z.strictObject({
  id: text.optional(),
  caseId: text,
  providerId: text,
  requestVersion: z.number().int().positive(),
  recipientEmail: z.email(),
  subject: text,
  body: text,
  isSimulation: z.literal(true),
});

export const emailMessageInput = z.strictObject({
  id: text.optional(),
  caseId: text.nullable(),
  providerId: text.nullable(),
  quoteRequestId: text.nullable(),
  direction: z.enum(["OUTBOUND", "INBOUND"]),
  fromAddress: text.nullable().optional(),
  recipientAddress: text.nullable().optional(),
  subject: text,
  body: text,
  externalMessageId: text.nullable(),
  threadId: text.nullable(),
  deliveryStatus: z.enum(["DRAFT", "QUEUED", "SENT", "DELIVERED", "RECEIVED", "BOUNCED", "FAILED", "SIMULATED"]),
  sentAt: z.date().nullable(),
  receivedAt: z.date().nullable(),
  isSimulation: z.boolean(),
  isRead: z.boolean().optional(),
  matchStatus: z.enum(["MATCHED", "UNMATCHED", "PROVIDER_MISMATCH"]).nullable().optional(),
  attachmentMetadataJson: text.nullable().optional(),
});

export const documentInput = z.strictObject({
  id: text.optional(),
  caseId: text,
  providerId: text.nullable(),
  emailMessageId: text.nullable(),
  kind: z.enum(["QUOTE", "INVOICE", "OTHER"]),
  sourceType: z.enum(["DEMO", "UPLOAD", "EMAIL"]),
  fileName: text,
  mimeType: text,
  byteSize: z.number().int().nonnegative().nullable(),
  storageKey: text.nullable(),
  sha256: text.nullable(),
  isFictional: z.literal(true),
});

export const costLineItemInput = z.strictObject({
  id: text.optional(),
  category: z.enum(["SURGEON", "ANAESTHETIST", "HOSPITAL", "THEATRE", "ACCOMMODATION", "DEVICES", "MEDICINES", "EXCESS", "CO_PAYMENT", "MEDICARE_BENEFIT", "INSURER_BENEFIT", "OTHER"]),
  description: text,
  payer: z.enum(["PATIENT", "MEDICARE", "INSURER", "PROVIDER", "UNKNOWN"]),
  billedAmountCents: cents,
  knownBenefitCents: cents,
  patientResponsibilityCents: cents,
  sourceEmailId: text.nullable(),
  sourceDocumentId: text.nullable(),
  sourceLocator: text.nullable(),
  isFictional: z.literal(true),
});

export const quoteInput = z.strictObject({
  id: text.optional(),
  caseId: text,
  providerId: text,
  sourceEmailId: text.nullable(),
  sourceDocumentId: text.nullable(),
  revisionOfId: text.nullable(),
  revisionNumber: z.number().int().positive(),
  procedureName: text,
  issueDate: z.date(),
  expiryDate: z.date().nullable(),
  completeness: z.enum(["COMPLETE", "INCOMPLETE", "UNKNOWN"]),
  confirmationStatus: z.enum(["UNVERIFIED", "PROVIDER_STATED", "PATIENT_VERIFIED"]),
  isFictional: z.literal(true),
  notes: text.nullable(),
  lineItems: z.array(costLineItemInput).min(1),
}).refine((quote) => quote.expiryDate === null || quote.expiryDate >= quote.issueDate, {
  message: "Expiry cannot precede issue date.", path: ["expiryDate"],
});

export const opportunityInput = z.strictObject({
  id: text.optional(),
  quoteId: text,
  sourceReferenceId: text.nullable(),
  type: z.enum(["ITEMISATION", "GAP_SCHEME", "COVERAGE_CHECK", "BILL_CORRECTION", "PAYMENT_PLAN", "OTHER"]),
  title: text,
  supportingEvidence: text,
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  isFictional: z.literal(true),
});

export const sourceReferenceInput = z.strictObject({
  id: text.optional(),
  url: z.url(),
  publisher: text,
  title: text,
  publicationDate: z.date().nullable(),
  effectiveDate: z.date().nullable(),
  effectiveNote: text.nullable(),
  retrievedAt: z.date(),
  evidenceNotes: text,
  mbsItemNumber: text.nullable(),
  isOfficial: z.literal(true),
});

export const emailEventInput = z.strictObject({
  emailMessageId: text,
  providerEventId: text,
  type: z.enum(["SENT", "DELIVERED", "BOUNCED", "RECEIVED", "FAILED"]),
  occurredAt: z.date(),
});

export const negotiationInput = z.strictObject({
  id: text.optional(),
  caseId: text,
  providerId: text,
  originalQuoteId: text,
  originalRequest: text,
  isSimulation: z.literal(true),
});

export type PatientInput = z.infer<typeof patientInput>;
export type InsuranceInput = z.infer<typeof insuranceInput>;
export type CaseInput = z.infer<typeof caseInput>;
export type ProviderInput = z.infer<typeof providerInput>;
export type QuoteRequestInput = z.infer<typeof quoteRequestInput>;
export type EmailMessageInput = z.infer<typeof emailMessageInput>;
export type DocumentInput = z.infer<typeof documentInput>;
export type QuoteInput = z.infer<typeof quoteInput>;
export type OpportunityInput = z.infer<typeof opportunityInput>;
export type NegotiationInput = z.infer<typeof negotiationInput>;
export type SourceReferenceInput = z.infer<typeof sourceReferenceInput>;
export type EmailEventInput = z.infer<typeof emailEventInput>;
