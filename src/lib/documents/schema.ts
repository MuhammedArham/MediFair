import { z } from "zod";

export const documentTypes = ["SPECIALIST_ESTIMATE", "HOSPITAL_QUOTE", "ANAESTHETIST_QUOTE", "FINAL_INVOICE", "BENEFIT_STATEMENT", "PREVIOUS_ESTIMATE", "OTHER"] as const;
const cents = z.number().int().min(0).max(100_000_000).nullable();
const date = z.iso.date().nullable();
export const documentAnalysisSchema = z.strictObject({
  documentType: z.enum(documentTypes),
  providerName: z.string().max(200).nullable(),
  facilityName: z.string().max(200).nullable(),
  documentDate: date,
  serviceDates: z.array(z.iso.date()).max(30),
  mbsItemNumbers: z.array(z.string().max(20)).max(30),
  lineItems: z.array(z.strictObject({
    category: z.enum(["SURGEON", "ASSISTANT_SURGEON", "ANAESTHETIST", "HOSPITAL", "THEATRE", "ACCOMMODATION", "DEVICE", "DIAGNOSTIC_TEST", "MEDICINE", "EXCESS", "CO_PAYMENT", "TAX", "OTHER", "MEDICARE_PAYMENT", "INSURER_PAYMENT", "PATIENT_PAYMENT"]),
    description: z.string().trim().min(1).max(300),
    kind: z.enum(["CHARGE", "TAX", "PAYMENT", "BENEFIT"]),
    amountCents: cents,
    page: z.number().int().positive(),
    evidence: z.string().trim().min(1).max(1000),
  })).max(100),
  totalCents: cents,
  totalMeaning: z.enum(["GROSS_CHARGES", "PAYMENT_TOTAL", "NET_BALANCE", "UNKNOWN"]),
  patientBalanceCents: cents,
  includedComponents: z.array(z.string().max(300)).max(50),
  excludedComponents: z.array(z.string().max(300)).max(50),
  conditions: z.array(z.string().max(500)).max(50),
  evidence: z.array(z.strictObject({ fieldPath: z.string().max(120), page: z.number().int().positive(), excerpt: z.string().trim().min(1).max(1000) })).max(150),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  humanReviewFlags: z.array(z.string().max(300)).max(50),
});

export type DocumentAnalysisResult = z.infer<typeof documentAnalysisSchema>;
export type PageText = { page: number; text: string };

export function validateEvidence(result: DocumentAnalysisResult, pages: PageText[]) {
  const failures: string[] = [];
  for (const item of result.lineItems) {
    const text = pages.find((page) => page.page === item.page)?.text ?? "";
    if (!text.includes(item.evidence)) failures.push(`${item.description}: evidence not found on page ${item.page}`);
  }
  for (const item of result.evidence) {
    const text = pages.find((page) => page.page === item.page)?.text ?? "";
    if (!text.includes(item.excerpt)) failures.push(`${item.fieldPath}: evidence not found on page ${item.page}`);
  }
  return failures;
}
