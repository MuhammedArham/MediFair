import { z } from "zod";

const nullableCents = z.number().int().min(0).max(100_000_000).nullable();

export const quoteExtractionSchema = z.object({
  messageKind: z.enum(["QUOTE", "PARTIAL_QUOTE", "NO_PRICES", "REFUSAL", "UNCLEAR"]),
  provider: z.object({
    identity: z.string().nullable(),
    procedureOffered: z.boolean().nullable(),
    facility: z.string().nullable(),
    consultationRequired: z.boolean().nullable(),
    validityDays: z.number().int().min(0).max(3650).nullable(),
  }),
  mbsItemNumbers: z.array(z.string().max(20)).max(20),
  fees: z.array(z.object({
    category: z.enum(["SURGEON", "ASSISTANT_SURGEON", "ANAESTHETIST", "HOSPITAL", "ACCOMMODATION", "THEATRE", "DEVICE", "DIAGNOSTIC_TEST", "MEDICINE", "EXCESS", "CO_PAYMENT", "OTHER"]),
    description: z.string().max(500),
    billedAmountCents: nullableCents,
    payer: z.enum(["PATIENT", "MEDICARE", "INSURER", "PROVIDER", "UNKNOWN"]),
    includedInTotal: z.boolean().nullable(),
    evidence: z.string().max(1200).nullable(),
  })).max(80),
  benefits: z.object({ medicareCents: nullableCents, privateInsurerCents: nullableCents }),
  insurance: z.object({
    gapCoverStatus: z.enum(["CONFIRMED_NO_GAP", "KNOWN_GAP", "NOT_CONFIRMED", "NOT_STATED"]),
    excessCents: nullableCents,
    coPaymentCents: nullableCents,
    expectedPatientOutOfPocketCents: nullableCents,
    coverageConfirmation: z.enum(["PROVIDER_STATED", "INSURER_CONFIRMED", "PATIENT_REPORTED", "NOT_CONFIRMED", "NOT_STATED"]),
  }),
  totalFeesCents: nullableCents,
  feeNature: z.enum(["ESTIMATE", "FIRM_WRITTEN_QUOTE", "UNKNOWN"]),
  includedComponents: z.array(z.string().max(300)).max(50),
  excludedComponents: z.array(z.string().max(300)).max(50),
  missingFees: z.array(z.string().max(300)).max(50),
  conditions: z.array(z.string().max(500)).max(50),
  evidence: z.array(z.object({ fieldPath: z.string().max(120), excerpt: z.string().min(1).max(1200) })).max(100),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  humanReviewFlags: z.array(z.string().max(300)).max(50),
  arithmeticDeclaredFeeTotalCents: nullableCents,
}).strict();

export type QuoteExtraction = z.infer<typeof quoteExtractionSchema>;

export type ExtractionResult = {
  providerMode: "MOCK_AI" | "OPENAI";
  status: "COMPLETE" | "UNSUPPORTED";
  extraction: QuoteExtraction | null;
  message: string | null;
};
