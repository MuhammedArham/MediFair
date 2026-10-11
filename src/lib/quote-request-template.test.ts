import { describe, expect, it } from "vitest";
import { buildQuoteRequestDraft, editableDraftSchema, type QuoteDraftFacts } from "./quote-request-template";

const facts: QuoteDraftFacts = {
  patientName: "Alex Example", procedureName: "One-eye cataract procedure", specialty: "Ophthalmology",
  mbsItemNumber: "42702", mbsItemStatus: "ILLUSTRATIVE", insurerName: null,
  hospitalCoverTier: null, coverageVerificationStatus: null, referralStatus: "UNKNOWN",
};

describe("quote request template", () => {
  it("does not present an illustrative or unknown MBS item as confirmed", () => {
    const draft = buildQuoteRequestDraft(facts);
    expect(draft.body).toContain("do not have a clinician-confirmed MBS item number");
    expect(draft.body).not.toContain("42702");
    expect(draft.body).toContain("which item numbers you propose");
    expect(buildQuoteRequestDraft({ ...facts, mbsItemNumber: null, mbsItemStatus: "UNKNOWN" }).body).not.toContain("null");
  });

  it("handles absent insurance details without assuming benefits", () => {
    const draft = buildQuoteRequestDraft(facts);
    expect(draft.body).toContain("I have not provided private insurer details");
    expect(draft.body).toContain("do not assume that I have cover");
    expect(draft.body).toContain("out-of-pocket cost");
    expect(draft.body).toContain("hardship or reduced-fee");
  });

  it("uses clinician-confirmed item information only when stated and validates edits", () => {
    expect(buildQuoteRequestDraft({ ...facts, mbsItemStatus: "CLINICIAN_CONFIRMED" }).body).toContain("42702, as confirmed by my treating clinician");
    expect(editableDraftSchema.safeParse({ subject: "", body: "short" }).success).toBe(false);
  });
});
