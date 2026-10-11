import { describe, expect, it } from "vitest";
import { compareQuote, rankComparableQuotes, type ComparisonInput } from "./engine";

const now = new Date("2026-10-11T12:00:00Z");
const base: ComparisonInput = {
  id: "a", providerId: "practice-a", procedureName: "Clinician-confirmed left-eye cataract procedure",
  caseProcedureConfirmed: true, quoteScopeConfirmed: true, quoteCompleteness: "COMPLETE",
  issueDate: new Date("2026-10-10T00:00:00Z"), expiryDate: new Date("2026-10-31T00:00:00Z"),
  fees: [
    { category: "SURGEON", description: "Surgeon", cents: 230000, includedInTotal: true, evidence: "Surgeon $2,300" },
    { category: "ANAESTHETIST", description: "Anaesthetist", cents: 70000, includedInTotal: true, evidence: "Anaesthetist $700" },
    { category: "HOSPITAL", description: "Hospital", cents: 100000, includedInTotal: true, evidence: "Hospital $1,000" },
    { category: "EXCESS", description: "Excess", cents: 50000, includedInTotal: false, evidence: "Excess $500" },
  ], totalFeesCents: 400000, medicareBenefitCents: 100000, insurerBenefitCents: 200000,
  excessCents: 50000, coPaymentCents: 0, reportedPatientGapCents: 150000,
  insuranceConfirmed: true, missingFees: [], excludedComponents: [], humanReviewFlags: [],
};

const calculate = (patch: Partial<ComparisonInput>) => compareQuote({ ...base, ...patch }, now);

describe("auditable quote comparison", () => {
  it("calculates integer cents and counts excess once when a reported gap includes it", () => {
    const result = calculate({});
    expect(result.status).toBe("COMPLETE");
    expect(result.quotedPatientCostCents).toBe(150000);
    expect(result.calculatedPatientCostCents).toBe(150000);
  });
  it("never converts a missing fee or benefit into zero", () => {
    expect(calculate({ fees: base.fees.map((fee) => fee.category === "ANAESTHETIST" ? { ...fee, cents: null } : fee) }).quotedPatientCostCents).toBeNull();
    expect(calculate({ insurerBenefitCents: null }).status).toBe("INCOMPLETE_QUOTE");
  });
  it("keeps stated zero distinct from unknown and does not subtract benefits twice", () => {
    expect(calculate({ coPaymentCents: 0 }).quotedPatientCostCents).toBe(150000);
    expect(calculate({ insurerBenefitCents: 250000, reportedPatientGapCents: 100000 }).quotedPatientCostCents).toBe(100000);
  });
  it("flags inconsistent component totals and patient gap arithmetic", () => {
    expect(calculate({ totalFeesCents: 420000 }).status).toBe("ARITHMETIC_REVIEW");
    expect(calculate({ reportedPatientGapCents: 200000 }).status).toBe("ARITHMETIC_REVIEW");
  });
  it("excludes unknown insurer verification and unconfirmed scope from ranking", () => {
    expect(calculate({ insuranceConfirmed: false }).status).toBe("INSURANCE_NOT_VERIFIED");
    expect(calculate({ quoteScopeConfirmed: false }).status).toBe("SCOPE_NOT_CONFIRMED");
  });
  it("does not rank incomplete, expired, or different-scope quotes as cheaper", () => {
    const complete = { input: base, result: calculate({}) };
    const incompleteInput = { ...base, id: "b", providerId: "practice-b", missingFees: ["Hospital"] };
    const differentInput = { ...base, id: "c", providerId: "practice-c", procedureName: "Different procedure", quoteScopeConfirmed: false };
    const expiredInput = { ...base, id: "d", providerId: "practice-d", expiryDate: new Date("2026-10-01") };
    expect(rankComparableQuotes([complete, { input: incompleteInput, result: compareQuote(incompleteInput, now) }, { input: differentInput, result: compareQuote(differentInput, now) }, { input: expiredInput, result: compareQuote(expiredInput, now) }])).toHaveLength(1);
  });
  it("requires the provider to state gross fees independently of the MBS schedule", () => {
    expect(calculate({ totalFeesCents: null }).quotedPatientCostCents).toBeNull();
  });
});
