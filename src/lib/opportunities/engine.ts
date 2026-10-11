import { createHash } from "node:crypto";
import { z } from "zod";
import { compareBills, type BillDocument } from "../documents/compare";
import { quoteExtractionSchema, type QuoteExtraction } from "../ai/quote-extraction-schema";
import { documentAnalysisSchema } from "../documents/schema";
import { reviewSources } from "./sources";

export const categories = ["MISSING_ITEMISATION", "GAP_COVER_ENQUIRY", "SPECIALIST_FEE_NEGOTIATION", "FINANCIAL_HARDSHIP", "QUOTE_VS_INVOICE", "POSSIBLE_BILLING_ERROR", "INSURANCE_COVERAGE_REVIEW", "COMPLAINT_PATHWAY"] as const;
export type Category = typeof categories[number];
export type ReviewEvidence = { sourceType: "QUOTE" | "DOCUMENT" | "PREFERENCE" | "COMPLAINT" | "INSURANCE"; sourceId: string; excerpt: string; page?: number };
export type QuoteFact = { id: string; providerId: string; providerName: string; procedureName: string; completeness: "COMPLETE" | "INCOMPLETE" | "UNKNOWN"; extraction: QuoteExtraction | null; missingFees: string[]; sourceText: string | null; patientGapCents: number | null };
export type DocumentFact = BillDocument & { providerId: string | null; documentType: string; isHumanReviewed: boolean };
export type ComplaintFact = { id: string; party: "INSURER" | "PROVIDER" | "PUBLIC_HOSPITAL"; providerId: string | null; summary: string; resolved: boolean };
export type ReviewInput = { caseId: string; state: string; procedureName: string; insurerName: string | null; insurerCoverageStatus: string; quotes: QuoteFact[]; documents: DocumentFact[]; financialHardshipDisclosed: boolean; specialistFeeRequest: boolean; complaints: ComplaintFact[] };
export type ReviewFinding = {
  id: string; stableKey: string; caseId: string; category: Category; providerId: string | null; insurerName: string | null; quoteId: string | null; documentId: string | null; complaintId: string | null;
  title: string; evidence: ReviewEvidence[]; missingInformation: string[]; ruleTriggered: string; officialSourceUrl: string; explanation: string; responsibleParty: string; suggestedQuestions: string[];
  confidence: "LOW" | "MEDIUM" | "HIGH"; verificationStatus: "SOURCE_VERIFIED" | "NEEDS_HUMAN_REVIEW"; potentialImpactCents: number | null; priorityScore: number; status: "PROPOSED" | "PURSUED" | "RESOLVED" | "DISMISSED";
};
const reviewInputSchema = z.strictObject({
  caseId: z.string().min(1), state: z.string().min(2), procedureName: z.string().min(1), insurerName: z.string().nullable(), insurerCoverageStatus: z.string(), financialHardshipDisclosed: z.boolean(), specialistFeeRequest: z.boolean(),
  quotes: z.array(z.strictObject({ id: z.string().min(1), providerId: z.string().min(1), providerName: z.string().min(1), procedureName: z.string().min(1), completeness: z.enum(["COMPLETE", "INCOMPLETE", "UNKNOWN"]), extraction: quoteExtractionSchema.nullable(), missingFees: z.array(z.string()), sourceText: z.string().nullable(), patientGapCents: z.number().int().nonnegative().nullable() })),
  documents: z.array(z.strictObject({ id: z.string().min(1), label: z.string().min(1), providerId: z.string().nullable(), documentType: z.string().min(1), result: documentAnalysisSchema, isHumanReviewed: z.boolean() })),
  complaints: z.array(z.strictObject({ id: z.string().min(1), party: z.enum(["INSURER", "PROVIDER", "PUBLIC_HOSPITAL"]), providerId: z.string().nullable(), summary: z.string().min(1), resolved: z.boolean() })),
});
function identity(parts: (string | null)[]) { return createHash("sha256").update(parts.map((part) => part ?? "").join("\u001f")).digest("hex"); }
function priority(evidence: ReviewEvidence[], actionable: boolean, documentedDifference: boolean, partyKnown: boolean, impact: number | null) {
  // Ordering is deterministic, not a probability or a savings estimate.
  return Math.min(100, Math.min(evidence.length, 3) * 12 + (actionable ? 20 : 0) + (documentedDifference ? 25 : 0) + (partyKnown ? 10 : 0) + (impact !== null && impact >= 50_000 ? 9 : 0));
}
function quoteEvidence(quote: QuoteFact, excerpt: string): ReviewEvidence[] { return [{ sourceType: "QUOTE", sourceId: quote.id, excerpt }]; }
function documentEvidence(document: DocumentFact, excerpt: string, page?: number): ReviewEvidence[] { return [{ sourceType: "DOCUMENT", sourceId: document.id, excerpt, ...(page ? { page } : {}) }]; }
function eligibleExtraCharge(description: string, estimate: DocumentFact) {
  const name = description.toLowerCase().trim();
  return !estimate.result.excludedComponents.some((excluded) => {
    const clause = excluded.toLowerCase().trim();
    return clause === name || clause.includes(name) || name.includes(clause);
  });
}
export function detectReviewOpportunities(raw: ReviewInput): ReviewFinding[] {
  reviewInputSchema.parse(raw);
  const findings: ReviewFinding[] = [];
  function add(input: Omit<ReviewFinding, "id" | "stableKey" | "caseId" | "priorityScore" | "status"> & { identity: string; documentedDifference?: boolean; actionable?: boolean }) {
    const { identity: discriminator, documentedDifference = false, actionable = true, ...fields } = input;
    const stableKey = identity([raw.caseId, fields.category, fields.providerId, fields.quoteId, fields.documentId, fields.complaintId, discriminator]);
    findings.push({ ...fields, id: stableKey.slice(0, 24), stableKey, caseId: raw.caseId, priorityScore: priority(fields.evidence, actionable, documentedDifference, Boolean(fields.responsibleParty) && fields.responsibleParty !== "Chosen practice or hospital", fields.potentialImpactCents), status: "PROPOSED" });
  }
  for (const quote of raw.quotes) {
    const missing = [...new Set([...quote.missingFees, ...(quote.extraction?.missingFees ?? [])].filter(Boolean))];
    if (quote.completeness !== "COMPLETE" && !missing.length) missing.push("Separate relevant fees and inclusions");
    if (missing.length) add({ identity: "quote-missing", category: "MISSING_ITEMISATION", providerId: quote.providerId, insurerName: null, quoteId: quote.id, documentId: null, complaintId: null,
      title: `Request a breakdown from ${quote.providerName}`, evidence: quoteEvidence(quote, `Quote marked ${quote.completeness.toLowerCase()}; missing: ${missing.join(", ")}`), missingInformation: missing, ruleTriggered: "A written estimate omits relevant fee categories or amounts.", officialSourceUrl: reviewSources.costs.url,
      explanation: "The written response does not identify all relevant costs. Ask the practice which doctor, hospital and other fees are included, and for separate estimates where available.", responsibleParty: quote.providerName, suggestedQuestions: [`Can you provide a written breakdown that includes ${missing.join(", ")}?`, "Which charges come from independently billing practitioners or the hospital?"], confidence: "HIGH", verificationStatus: "NEEDS_HUMAN_REVIEW", potentialImpactCents: null });
    const gap = quote.extraction?.insurance.gapCoverStatus;
    if (raw.insurerName && quote.providerId && (!gap || gap === "NOT_CONFIRMED" || gap === "NOT_STATED")) add({ identity: "gap-unknown", category: "GAP_COVER_ENQUIRY", providerId: quote.providerId, insurerName: raw.insurerName, quoteId: quote.id, documentId: null, complaintId: null,
      title: "Ask about gap-cover arrangements", evidence: quoteEvidence(quote, `Gap-cover status: ${gap ?? "not stated"}`), missingInformation: ["Whether this practitioner will use an applicable no-gap or known-gap arrangement for this treatment"], ruleTriggered: "Insurer and practice are known; applicable practitioner gap-cover use is not confirmed.", officialSourceUrl: reviewSources.gap.url,
      explanation: "A doctor may decide case by case whether to use an insurer's gap arrangement. Neither participation nor a reduction is assumed.", responsibleParty: quote.providerName, suggestedQuestions: [`Will the treating practitioner use any applicable ${raw.insurerName} no-gap or known-gap arrangement for this service?`, "What out-of-pocket fee would apply if the arrangement is used?"], confidence: "MEDIUM", verificationStatus: "NEEDS_HUMAN_REVIEW", potentialImpactCents: null });
    if (raw.specialistFeeRequest) add({ identity: "patient-fee-request", category: "SPECIALIST_FEE_NEGOTIATION", providerId: quote.providerId, insurerName: null, quoteId: quote.id, documentId: null, complaintId: null,
      title: "Ask whether a reduced specialist fee is possible", evidence: [{ sourceType: "PREFERENCE", sourceId: raw.caseId, excerpt: "Specialist-fee request selected by fictional patient" }], missingInformation: ["Whether the practice offers any reduced fee"], ruleTriggered: "Patient explicitly asked to explore a discretionary specialist-fee reduction.", officialSourceUrl: reviewSources.costs.url,
      explanation: "Practitioners set their own fees. This is a respectful enquiry, not a finding that the quoted fee is excessive or unlawful.", responsibleParty: quote.providerName, suggestedQuestions: ["Would the specialist consider a reduced fee for this case?", "If so, could you provide a revised written estimate?"], confidence: "MEDIUM", verificationStatus: "SOURCE_VERIFIED", potentialImpactCents: null });
    const coverageConfirmed = raw.insurerCoverageStatus === "INSURER_CONFIRMED" && quote.extraction?.insurance.coverageConfirmation === "INSURER_CONFIRMED";
    const insurerBenefitKnown = quote.extraction?.benefits.privateInsurerCents !== null && quote.extraction?.benefits.privateInsurerCents !== undefined;
    if (raw.insurerName && (!coverageConfirmed || !insurerBenefitKnown)) add({ identity: "coverage-unknown", category: "INSURANCE_COVERAGE_REVIEW", providerId: quote.providerId, insurerName: raw.insurerName, quoteId: quote.id, documentId: null, complaintId: null,
      title: "Ask your insurer to confirm cover and benefits", evidence: quoteEvidence(quote, `Coverage: ${quote.extraction?.insurance.coverageConfirmation ?? "not stated"}; insurer benefit: ${insurerBenefitKnown ? "stated" : "not stated"}`), missingInformation: ["Written insurer confirmation for this treatment and setting", ...(insurerBenefitKnown ? [] : ["Insurer benefit amount or claims assessment"])], ruleTriggered: "Insurer coverage or the quoted insurer contribution is not confirmed.", officialSourceUrl: reviewSources.costs.url,
      explanation: "A provider's quote cannot establish the insurer's final benefit or the patient's eligibility. Ask the insurer to review the likely claim in writing.", responsibleParty: raw.insurerName, suggestedQuestions: ["Is this treatment covered under my policy in the proposed setting?", "What benefit, excess, co-payment and waiting period would apply to the proposed items?"], confidence: "MEDIUM", verificationStatus: "NEEDS_HUMAN_REVIEW", potentialImpactCents: null });
    if (quote.extraction && quote.extraction.totalFeesCents !== null && quote.extraction.fees.length && quote.extraction.fees.every((fee) => fee.billedAmountCents !== null && fee.includedInTotal !== null)) {
      const sum = quote.extraction.fees.filter((fee) => fee.includedInTotal).reduce((total, fee) => total + fee.billedAmountCents!, 0);
      if (sum !== quote.extraction.totalFeesCents) add({ identity: "quote-arithmetic", category: "POSSIBLE_BILLING_ERROR", providerId: quote.providerId, insurerName: null, quoteId: quote.id, documentId: null, complaintId: null,
        title: "Ask for an arithmetic review of the quote", evidence: quoteEvidence(quote, `Itemised fees total ${sum} cents; stated total is ${quote.extraction.totalFeesCents} cents.`), missingInformation: ["Which figure or itemisation is correct"], ruleTriggered: "Known included quote fees do not add to the stated total.", officialSourceUrl: reviewSources.consent.url,
        explanation: "The amounts are inconsistent. Ask for a corrected written estimate; this does not establish improper billing.", responsibleParty: quote.providerName, suggestedQuestions: ["Could you review the total and provide a corrected itemised estimate?"], confidence: "HIGH", verificationStatus: "NEEDS_HUMAN_REVIEW", potentialImpactCents: null, documentedDifference: true });
    }
  }
  if (raw.financialHardshipDisclosed) add({ identity: "hardship", category: "FINANCIAL_HARDSHIP", providerId: null, insurerName: null, quoteId: null, documentId: null, complaintId: null,
    title: "Ask about help with payment", evidence: [{ sourceType: "PREFERENCE", sourceId: raw.caseId, excerpt: "Fictional patient explicitly selected financial difficulty" }], missingInformation: ["Whether any assistance, reduced fee or payment plan is offered"], ruleTriggered: "Patient explicitly disclosed difficulty affording the bill or treatment.", officialSourceUrl: reviewSources.costs.url,
    explanation: "The official guidance encourages discussing cost concerns. This does not establish that a particular practice offers assistance.", responsibleParty: "Chosen practice or hospital", suggestedQuestions: ["Do you offer any financial hardship assistance, reduced fees or payment plans?", "If available, what terms would apply in writing?"], confidence: "HIGH", verificationStatus: "SOURCE_VERIFIED", potentialImpactCents: null });
  const estimates = raw.documents.filter((doc) => ["SPECIALIST_ESTIMATE", "PREVIOUS_ESTIMATE", "HOSPITAL_QUOTE", "ANAESTHETIST_QUOTE"].includes(doc.documentType));
  const invoices = raw.documents.filter((doc) => doc.documentType === "FINAL_INVOICE");
  const statements = raw.documents.filter((doc) => doc.documentType === "BENEFIT_STATEMENT");
  for (const document of raw.documents.filter((doc) => doc.documentType !== "BENEFIT_STATEMENT")) {
    const charges = document.result.lineItems.filter((line) => line.kind === "CHARGE" || line.kind === "TAX");
    const unknown = charges.filter((line) => line.amountCents === null);
    if ((document.result.totalCents !== null && !charges.length) || unknown.length) add({ identity: "document-itemisation", category: "MISSING_ITEMISATION", providerId: document.providerId, insurerName: null, quoteId: null, documentId: document.id, complaintId: null,
      title: "Request a clearer itemised bill", evidence: documentEvidence(document, unknown.length ? `${unknown.length} charge amount(s) not stated` : "Total stated without separate charges"), missingInformation: unknown.map((line) => line.description).concat(charges.length ? [] : ["Separate fee amounts"]), ruleTriggered: "A document states a total without separate charges or leaves a listed charge amount unknown.", officialSourceUrl: reviewSources.costs.url,
      explanation: "The document does not make all relevant costs clear. Ask for a written breakdown; no unknown amount is treated as zero.", responsibleParty: document.result.providerName ?? "Issuing provider", suggestedQuestions: ["Could you provide a written breakdown of each charge and what it covers?"], confidence: "HIGH", verificationStatus: "NEEDS_HUMAN_REVIEW", potentialImpactCents: null });
    const standalone = compareBills({ previous: null, revised: null, invoice: document, statement: null });
    for (const issue of standalone.issues.filter((item) => item.kind === "ARITHMETIC" || item.kind === "POTENTIAL_DUPLICATE")) add({ identity: `${issue.kind}:${issue.evidence.map((e) => e.excerpt).join("|")}`, category: "POSSIBLE_BILLING_ERROR", providerId: document.providerId, insurerName: null, quoteId: null, documentId: document.id, complaintId: null,
      title: issue.kind === "POTENTIAL_DUPLICATE" ? "Ask about a possible duplicate charge" : "Ask for an arithmetic review", evidence: issue.evidence.map((e) => ({ sourceType: "DOCUMENT", sourceId: document.id, excerpt: e.excerpt, page: e.page })), missingInformation: ["Whether the itemisation and total are correct"], ruleTriggered: `Deterministic document check flagged ${issue.kind.toLowerCase().replaceAll("_", " ")}.`, officialSourceUrl: reviewSources.consent.url,
      explanation: "The figures need checking. A potential duplicate or arithmetic mismatch is not proof of fraud or an invalid charge.", responsibleParty: document.result.providerName ?? "Issuing provider", suggestedQuestions: ["Could you review the itemised charges and provide a corrected statement if needed?"], confidence: issue.confidence, verificationStatus: "NEEDS_HUMAN_REVIEW", potentialImpactCents: null, documentedDifference: true });
  }
  for (const invoice of invoices) {
    const matching = estimates.filter((doc) => doc.providerId && doc.providerId === invoice.providerId && doc.result.documentDate && invoice.result.documentDate && doc.result.documentDate <= invoice.result.documentDate).sort((a, b) => (b.result.documentDate ?? "").localeCompare(a.result.documentDate ?? ""));
    const estimate = matching[0] ?? null;
    const statement = statements.find((doc) => doc.result.serviceDates.some((date) => invoice.result.serviceDates.includes(date)) && doc.result.mbsItemNumbers.some((item) => invoice.result.mbsItemNumbers.includes(item))) ?? null;
    const result = compareBills({ previous: null, revised: estimate, invoice, statement });
    const providerName = invoice.result.providerName ?? "provider";
    if (estimate && result.revisedToInvoice) {
      const changed = result.issues.filter((issue) => ["ADDED_CHARGE", "INCREASE", "REMOVED_CHARGE", "DECREASE"].includes(issue.kind) && (issue.kind !== "ADDED_CHARGE" || eligibleExtraCharge(issue.description.replace(/^.*?: added /, "").replace(/\.$/, ""), estimate)));
      if (changed.length) {
        const delta = invoice.result.totalMeaning === "GROSS_CHARGES" && estimate.result.totalMeaning === "GROSS_CHARGES" && invoice.result.totalCents !== null && estimate.result.totalCents !== null ? invoice.result.totalCents - estimate.result.totalCents : null;
        const supportedDelta = delta !== null && changed.every((issue) => issue.deltaCents !== null) && changed.reduce((sum, issue) => sum + issue.deltaCents!, 0) === delta ? delta : null;
        add({ identity: `invoice-change:${estimate.id}`, category: "QUOTE_VS_INVOICE", providerId: invoice.providerId, insurerName: null, quoteId: null, documentId: invoice.id, complaintId: null,
          title: delta !== null && delta > 0 ? `Final invoice is ${new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(delta / 100)} above the earlier estimate` : "Ask about changed invoice charges",
          evidence: changed.flatMap((issue) => issue.evidence.map((e) => ({ sourceType: "DOCUMENT" as const, sourceId: e.role === "invoice" ? invoice.id : estimate.id, excerpt: e.excerpt, page: e.page }))), missingInformation: ["Why the written estimate and final invoice differ", "Whether the added or changed charge was discussed before treatment"], ruleTriggered: "Matching written estimate and final invoice contain changed itemised charges not marked as excluded in the estimate.", officialSourceUrl: reviewSources.consent.url,
          explanation: "A difference is documented, but the reason is not established. Ask for a written explanation; a change alone does not prove improper billing.", responsibleParty: providerName, suggestedQuestions: ["Please explain each charge that changed from the written estimate.", "When was the additional charge discussed and what service does it cover?"], confidence: "HIGH", verificationStatus: "NEEDS_HUMAN_REVIEW", potentialImpactCents: supportedDelta !== null && supportedDelta > 0 ? supportedDelta : null, documentedDifference: true });
      }
    }
    for (const issue of result.issues.filter((item) => item.kind === "MISSING_PAYMENT")) add({ identity: `${issue.kind}:${issue.evidence.map((e) => e.excerpt).join("|")}`, category: "POSSIBLE_BILLING_ERROR", providerId: invoice.providerId, insurerName: null, quoteId: null, documentId: invoice.id, complaintId: null,
      title: "Ask whether the insurer payment was applied",
      evidence: issue.evidence.map((e) => ({ sourceType: "DOCUMENT", sourceId: e.role === "statement" ? statement?.id ?? invoice.id : invoice.id, excerpt: e.excerpt, page: e.page })), missingInformation: [issue.kind === "MISSING_PAYMENT" ? "Whether the statement payment has been applied to this bill" : "Whether the itemisation and total are correct"], ruleTriggered: `Deterministic bill comparison flagged ${issue.kind.toLowerCase().replaceAll("_", " ")}.`, officialSourceUrl: reviewSources.consent.url,
      explanation: "The records need checking. A payment absent from the invoice is not proof of an invalid charge or processing error.", responsibleParty: providerName, suggestedQuestions: ["Has the insurer payment shown on the statement been applied to this invoice?"], confidence: issue.confidence, verificationStatus: "NEEDS_HUMAN_REVIEW", potentialImpactCents: null, documentedDifference: true });
  }
  for (const complaint of raw.complaints.filter((item) => !item.resolved)) {
    const source = complaint.party === "INSURER" ? reviewSources.insurer : complaint.party === "PUBLIC_HOSPITAL" && raw.state === "NSW" ? reviewSources.publicHospital : complaint.party === "PROVIDER" && raw.state === "NSW" ? reviewSources.providerComplaint : null;
    if (!source) continue;
    const party = complaint.party === "INSURER" ? raw.insurerName ?? "your insurer" : complaint.party === "PUBLIC_HOSPITAL" ? "the NSW public hospital or health service" : "the NSW provider or practice";
    add({ identity: complaint.id, category: "COMPLAINT_PATHWAY", providerId: complaint.providerId, insurerName: complaint.party === "INSURER" ? raw.insurerName : null, quoteId: null, documentId: null, complaintId: complaint.id,
      title: complaint.party === "INSURER" ? "Review an unresolved insurance complaint" : complaint.party === "PUBLIC_HOSPITAL" ? "Review an unresolved public hospital complaint" : "Review an unresolved provider complaint", evidence: [{ sourceType: "COMPLAINT", sourceId: complaint.id, excerpt: complaint.summary }], missingInformation: ["What response the organisation has given and what remains unresolved"], ruleTriggered: "A fictional complaint was documented and has no resolution date.", officialSourceUrl: source.url,
      explanation: complaint.party === "INSURER" ? "First try to resolve the insurance matter with the insurer. The Commonwealth Ombudsman may assist with private health insurance arrangements." : complaint.party === "PUBLIC_HOSPITAL" ? "For an NSW public hospital concern, contact the service or its complaints team; NSW Health describes further independent support." : "For an NSW provider concern, seek an explanation from the practice; the NSW HCCC can advise whether it can assist. It may not resolve every billing dispute.", responsibleParty: party, suggestedQuestions: ["Could you respond in writing to the documented concern and explain the next review step?"], confidence: "HIGH", verificationStatus: "SOURCE_VERIFIED", potentialImpactCents: null });
  }
  return findings.sort((a, b) => b.priorityScore - a.priorityScore || a.category.localeCompare(b.category) || a.stableKey.localeCompare(b.stableKey));
}
