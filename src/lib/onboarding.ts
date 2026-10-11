import { z } from "zod";
import { australianPostcode, australianState } from "./db/validation";

const shortText = (max: number) => z.string().trim().min(2, "Enter at least 2 characters.").max(max);
const optionalText = (max: number) => z.string().trim().max(max);
const optionalMoney = z.string().trim().refine((value) => value === "" || /^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(value), "Enter a valid amount in dollars, up to 2 decimal places.");
const optionalDistance = z.string().trim().refine((value) => value === "" || /^(?:0|[1-9]\d{0,2})$/.test(value), "Enter a distance from 0 to 999 km.");

export const procedureStepSchema = z.strictObject({
  procedureName: shortText(120),
  medicalSpecialty: shortText(80),
  mbsItemNumber: z.string().trim().refine((value) => value === "" || /^\d{4,6}$/.test(value), "Use a 4 to 6 digit MBS item number, or leave blank."),
  mbsClinicianConfirmed: z.boolean(),
  suburb: shortText(80),
  state: australianState,
  postcode: australianPostcode,
  referralStatus: z.enum(["REFERRAL", "TREATMENT_PLAN", "BOTH", "NEITHER", "UNKNOWN"]),
});

export const insuranceStepSchema = z.strictObject({
  medicareEligibility: z.enum(["YES", "NO", "UNKNOWN"]),
  insurerName: optionalText(80),
  hospitalCoverTier: optionalText(80),
  policyDetails: optionalText(200),
  excessDollars: optionalMoney,
  copaymentDollars: optionalMoney,
  coverageVerification: z.enum(["CONFIRMED", "NOT_CONFIRMED"]),
});

export const preferencesStepSchema = z.strictObject({
  preferredLocation: shortText(80),
  travelDistanceKm: optionalDistance,
  budgetDollars: optionalMoney,
  preferredProviderName: optionalText(100),
  preferredHospitalName: optionalText(100),
  accessibilityNotes: optionalText(160),
  languagePreference: optionalText(80),
});

export const consentStepSchema = z.strictObject({
  consent: z.literal(true, "Please consent to save the demo case and prepare drafts."),
  demoAcknowledged: z.literal(true, "Confirm that all details are fictional."),
});

export const onboardingSchema = procedureStepSchema.safeExtend(insuranceStepSchema.shape)
  .safeExtend(preferencesStepSchema.shape).safeExtend(consentStepSchema.shape)
  .superRefine((value, context) => {
    if (value.mbsClinicianConfirmed && !value.mbsItemNumber) {
      context.addIssue({ code: "custom", path: ["mbsItemNumber"], message: "Add the item number that your treating clinician confirmed." });
    }
    if (value.coverageVerification === "CONFIRMED" && !value.insurerName) {
      context.addIssue({ code: "custom", path: ["insurerName"], message: "Name the insurer that confirmed this cover." });
    }
    if (!value.insurerName && (value.hospitalCoverTier || value.policyDetails || value.excessDollars || value.copaymentDollars)) {
      context.addIssue({ code: "custom", path: ["insurerName"], message: "Add an insurer name or clear the private cover details." });
    }
  });

export type OnboardingValues = Omit<z.input<typeof onboardingSchema>, "consent" | "demoAcknowledged"> & {
  consent: boolean;
  demoAcknowledged: boolean;
};
export type OnboardingField = keyof OnboardingValues;

export const emptyOnboardingValues: OnboardingValues = {
  procedureName: "", medicalSpecialty: "", mbsItemNumber: "", mbsClinicianConfirmed: false,
  suburb: "", state: "NSW", postcode: "", referralStatus: "UNKNOWN",
  medicareEligibility: "UNKNOWN", insurerName: "", hospitalCoverTier: "", policyDetails: "",
  excessDollars: "", copaymentDollars: "", coverageVerification: "NOT_CONFIRMED",
  preferredLocation: "", travelDistanceKm: "", budgetDollars: "", preferredProviderName: "",
  preferredHospitalName: "", accessibilityNotes: "", languagePreference: "",
  consent: false, demoAcknowledged: false,
};

export const fictionalCataractExample: OnboardingValues = {
  ...emptyOnboardingValues,
  procedureName: "Cataract procedure for one eye", medicalSpecialty: "Ophthalmology", mbsItemNumber: "42702",
  mbsClinicianConfirmed: true, suburb: "Sydney", state: "NSW", postcode: "2000", referralStatus: "REFERRAL",
  medicareEligibility: "UNKNOWN", insurerName: "DemoCover (fictional)", hospitalCoverTier: "Gold (fictional)",
  excessDollars: "500", preferredLocation: "Sydney", travelDistanceKm: "25", languagePreference: "English",
};

export function dollarsToCents(value: string): number | null {
  if (value === "") return null;
  const [whole, fractional = ""] = value.split(".");
  return Number(whole) * 100 + Number(fractional.padEnd(2, "0"));
}

export function centsToDollars(value: number | null): string {
  return value === null ? "" : (value / 100).toFixed(2).replace(/\.00$/, "");
}
