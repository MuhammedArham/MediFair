import { describe, expect, it } from "vitest";
import { mockQuoteFixtures } from "../ai/mock-quote-fixtures";
import { mockDocumentFixtures } from "../documents/mock-fixtures";
import { detectReviewOpportunities, type DocumentFact, type QuoteFact, type ReviewInput } from "./engine";

const complete = structuredClone(mockQuoteFixtures.find((item) => item.id === "complete-clear")!.extraction);
complete.missingFees = [];
complete.benefits.privateInsurerCents = 300000;
complete.insurance.coverageConfirmation = "INSURER_CONFIRMED";
complete.insurance.gapCoverStatus = "CONFIRMED_NO_GAP";
const quote = (patch: Partial<QuoteFact> = {}): QuoteFact => ({ id: "quote-1", providerId: "provider-1", providerName: "Fictional Practice", procedureName: "Fictional cataract procedure", completeness: "COMPLETE", extraction: structuredClone(complete), missingFees: [], sourceText: null, patientGapCents: 0, ...patch });
const doc = (name: string): DocumentFact => { const fixture = mockDocumentFixtures.find((item) => item.id === name)!; return { id: name, label: fixture.fileName, result: structuredClone(fixture.result), providerId: "provider-1", documentType: fixture.result.documentType, isHumanReviewed: false }; };
const input = (patch: Partial<ReviewInput> = {}): ReviewInput => ({ caseId: "demo-case", state: "NSW", procedureName: "Fictional cataract procedure", insurerName: "DemoCover (fictional)", insurerCoverageStatus: "INSURER_CONFIRMED", quotes: [quote()], documents: [], financialHardshipDisclosed: false, specialistFeeRequest: false, complaints: [], ...patch });
const has = (data: ReviewInput, category: string) => detectReviewOpportunities(data).some((finding) => finding.category === category);

describe("Australian cost review rules", () => {
  it("does not flag a complete, insurer-confirmed no-gap quote or guess a saving", () => { expect(detectReviewOpportunities(input())).toEqual([]); });
  it("A requests separate fees for an incomplete quote and does not turn missing amounts into zero", () => {
    const changed = quote({ completeness: "INCOMPLETE", missingFees: ["Anaesthetist fee", "Hospital fee"] });
    const findings = detectReviewOpportunities(input({ quotes: [changed] }));
    expect(findings.find((item) => item.category === "MISSING_ITEMISATION")?.missingInformation).toContain("Anaesthetist fee");
    expect(findings.find((item) => item.category === "MISSING_ITEMISATION")?.potentialImpactCents).toBeNull();
    expect(has(input({ quotes: [quote()] }), "MISSING_ITEMISATION")).toBe(false);
    expect(has(input({ quotes: [quote({ completeness: "COMPLETE", missingFees: ["Anaesthetist fee"] })] }), "MISSING_ITEMISATION")).toBe(true);
  });
  it("B asks about unknown gap-cover use but does not flag confirmed no-gap use", () => {
    const changed = quote(); changed.extraction!.insurance.gapCoverStatus = "NOT_STATED";
    expect(has(input({ quotes: [changed] }), "GAP_COVER_ENQUIRY")).toBe(true);
    expect(has(input(), "GAP_COVER_ENQUIRY")).toBe(false);
    expect(has(input({ insurerName: null, quotes: [changed] }), "GAP_COVER_ENQUIRY")).toBe(false);
  });
  it("C requires an explicit patient request and never calls a specialist fee unlawful", () => {
    expect(has(input(), "SPECIALIST_FEE_NEGOTIATION")).toBe(false);
    const finding = detectReviewOpportunities(input({ specialistFeeRequest: true })).find((item) => item.category === "SPECIALIST_FEE_NEGOTIATION")!;
    expect(finding.explanation).toContain("not a finding");
    expect(finding.potentialImpactCents).toBeNull();
  });
  it("D requires explicit hardship disclosure and assumes no assistance exists", () => {
    expect(has(input(), "FINANCIAL_HARDSHIP")).toBe(false);
    const finding = detectReviewOpportunities(input({ financialHardshipDisclosed: true })).find((item) => item.category === "FINANCIAL_HARDSHIP")!;
    expect(finding.missingInformation[0]).toContain("Whether");
    expect(finding.potentialImpactCents).toBeNull();
  });
  it("E flags an unexplained $700 invoice change but not a charge expressly excluded from the estimate", () => {
    const revised = doc("revised"), invoice = doc("invoice");
    const finding = detectReviewOpportunities(input({ documents: [revised, invoice] })).find((item) => item.category === "QUOTE_VS_INVOICE")!;
    expect(finding.potentialImpactCents).toBe(70000);
    expect(finding.title).toContain("$700");
    revised.result.excludedComponents.push("Additional theatre session");
    expect(has(input({ documents: [revised, invoice] }), "QUOTE_VS_INVOICE")).toBe(false);
  });
  it("F asks for a check of a duplicate, arithmetic mismatch and apparently missing payment without alleging fraud", () => {
    const revised = doc("revised"), invoice = doc("invoice"), statement = doc("benefit");
    invoice.result.lineItems.push({ ...invoice.result.lineItems[0] });
    const findings = detectReviewOpportunities(input({ documents: [revised, invoice, statement] })).filter((item) => item.category === "POSSIBLE_BILLING_ERROR");
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings.some((item) => item.title.includes("duplicate"))).toBe(true);
    expect(findings.some((item) => item.title.includes("payment"))).toBe(true);
    expect(findings.every((item) => item.potentialImpactCents === null)).toBe(true);
    expect(has(input({ documents: [doc("revised"), doc("invoice")] }), "POSSIBLE_BILLING_ERROR")).toBe(false);
    expect(has(input({ documents: [doc("inconsistent")] }), "POSSIBLE_BILLING_ERROR")).toBe(true);
    const arithmeticQuote = quote();
    arithmeticQuote.extraction!.totalFeesCents = 999999;
    expect(has(input({ quotes: [arithmeticQuote] }), "POSSIBLE_BILLING_ERROR")).toBe(true);
  });
  it("G asks the insurer when benefits or coverage are unverified, but not when both are confirmed", () => {
    const changed = quote(); changed.extraction!.benefits.privateInsurerCents = null; changed.extraction!.insurance.coverageConfirmation = "PROVIDER_STATED";
    expect(has(input({ quotes: [changed] }), "INSURANCE_COVERAGE_REVIEW")).toBe(true);
    expect(has(input(), "INSURANCE_COVERAGE_REVIEW")).toBe(false);
  });
  it("H distinguishes insurer, NSW provider and NSW public hospital paths; resolved complaints do not trigger", () => {
    const complaints = [
      { id: "insurer", party: "INSURER" as const, providerId: null, summary: "Fictional insurer benefit complaint remained unanswered", resolved: false },
      { id: "provider", party: "PROVIDER" as const, providerId: "provider-1", summary: "Fictional specialist fee complaint remained unanswered", resolved: false },
      { id: "hospital", party: "PUBLIC_HOSPITAL" as const, providerId: null, summary: "Fictional NSW hospital complaint remained unanswered", resolved: false },
      { id: "resolved", party: "INSURER" as const, providerId: null, summary: "Fictional complaint already resolved", resolved: true },
    ];
    const findings = detectReviewOpportunities(input({ complaints })).filter((item) => item.category === "COMPLAINT_PATHWAY");
    expect(findings).toHaveLength(3);
    expect(new Set(findings.map((item) => item.officialSourceUrl)).size).toBe(3);
    expect(findings.some((item) => item.complaintId === "resolved")).toBe(false);
    expect(detectReviewOpportunities(input({ state: "VIC", complaints })).filter((item) => item.category === "COMPLAINT_PATHWAY")).toHaveLength(1);
  });
  it("keeps priority evidence-based and IDs stable across runs", () => {
    const data = input({ documents: [doc("revised"), doc("invoice")], financialHardshipDisclosed: true });
    const first = detectReviewOpportunities(data), second = detectReviewOpportunities(data);
    expect(first.map((item) => item.id)).toEqual(second.map((item) => item.id));
    expect(first[0].priorityScore).toBeGreaterThanOrEqual(first.at(-1)!.priorityScore);
    expect(first.every((item) => item.officialSourceUrl.startsWith("https://"))).toBe(true);
  });
});
