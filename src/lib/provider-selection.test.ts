import { describe, expect, it } from "vitest";
import { manualPracticeSchema, selectedPracticeIdsSchema } from "./provider-selection";

const verifiedForm = {
  practiceName: "User supplied test practice", email: "quotes@synthetic-medifair.au",
  websiteUrl: "https://synthetic-medifair.au", suburb: "Sydney", state: "NSW", postcode: "2000",
  contactSource: "Checked directly with the practice for a test case", contactSourceUrl: "",
  reportedHospitalName: "", verifiedContact: true,
};

describe("practice selection input", () => {
  it("allows up to three distinct practices and supports changing the selection", () => {
    expect(selectedPracticeIdsSchema.safeParse(["a", "b", "c"]).success).toBe(true);
    expect(selectedPracticeIdsSchema.safeParse(["a", "c"]).success).toBe(true);
    expect(selectedPracticeIdsSchema.safeParse([]).success).toBe(true);
    expect(selectedPracticeIdsSchema.safeParse(["a", "b", "c", "d"]).success).toBe(false);
    expect(selectedPracticeIdsSchema.safeParse(["a", "a"]).success).toBe(false);
  });

  it("requires a checked contact source and valid email and location", () => {
    expect(manualPracticeSchema.safeParse(verifiedForm).success).toBe(true);
    expect(manualPracticeSchema.safeParse({ ...verifiedForm, verifiedContact: false }).success).toBe(false);
    expect(manualPracticeSchema.safeParse({ ...verifiedForm, email: "not-an-email" }).success).toBe(false);
    expect(manualPracticeSchema.safeParse({ ...verifiedForm, email: "quotes@fictional.example" }).success).toBe(false);
    expect(manualPracticeSchema.safeParse({ ...verifiedForm, postcode: "200" }).success).toBe(false);
    expect(manualPracticeSchema.safeParse({ ...verifiedForm, contactSource: "" }).success).toBe(false);
  });

  it("rejects unsafe or malformed website and source links", () => {
    expect(manualPracticeSchema.safeParse({ ...verifiedForm, websiteUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(manualPracticeSchema.safeParse({ ...verifiedForm, websiteUrl: "http://synthetic-medifair.au" }).success).toBe(false);
    expect(manualPracticeSchema.safeParse({ ...verifiedForm, contactSourceUrl: "not-a-url" }).success).toBe(false);
  });
});
