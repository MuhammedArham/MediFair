import { describe, expect, it } from "vitest";
import { centsToDollars, dollarsToCents, fictionalCataractExample, onboardingSchema, procedureStepSchema } from "./onboarding";

const consentedExample = { ...fictionalCataractExample, consent: true, demoAcknowledged: true };

describe("onboarding form validation", () => {
  it("accepts the reviewed fictional cataract example", () => {
    expect(onboardingSchema.safeParse(consentedExample).success).toBe(true);
    expect(procedureStepSchema.safeParse({
      procedureName: consentedExample.procedureName, medicalSpecialty: consentedExample.medicalSpecialty,
      mbsItemNumber: consentedExample.mbsItemNumber, mbsClinicianConfirmed: true,
      suburb: consentedExample.suburb, state: consentedExample.state, postcode: consentedExample.postcode,
      referralStatus: consentedExample.referralStatus,
    }).success).toBe(true);
  });

  it("requires both explicit consent and confirmation of fictional data", () => {
    expect(onboardingSchema.safeParse({ ...consentedExample, consent: false }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...consentedExample, demoAcknowledged: false }).success).toBe(false);
  });

  it("rejects unsupported confirmation claims and invalid location or money", () => {
    expect(onboardingSchema.safeParse({ ...consentedExample, mbsItemNumber: "" }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...consentedExample, insurerName: "", coverageVerification: "CONFIRMED" }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...consentedExample, postcode: "200" }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...consentedExample, excessDollars: "-1" }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...consentedExample, budgetDollars: "10.999" }).success).toBe(false);
  });

  it("keeps unknown financial values null and preserves a known zero", () => {
    expect(dollarsToCents("")).toBeNull();
    expect(dollarsToCents("0")).toBe(0);
    expect(dollarsToCents("1200.50")).toBe(120050);
    expect(centsToDollars(null)).toBe("");
  });
});
