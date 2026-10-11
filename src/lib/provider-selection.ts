import { z } from "zod";
import { australianPostcode, australianState } from "./db/validation";

const optionalHttpsUrl = z.string().trim().refine((value) => {
  if (!value) return true;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}, "Use a full https:// web address or leave blank.");

const realEmail = z.email().refine((value) => {
  const domain = value.split("@")[1]?.toLowerCase() ?? "";
  return !/(?:^|\.)(?:example|test|invalid|localhost|local)$/.test(domain) && !/(?:^|\.)example\.(?:com|org|net)$/.test(domain);
}, "Use a real practice email address, not a demo or reserved address.");

export const selectedPracticeIdsSchema = z.array(z.string().trim().min(1))
  .max(3, "Choose no more than three practices.")
  .refine((ids) => new Set(ids).size === ids.length, "Each practice can only be selected once.");

export const manualPracticeSchema = z.strictObject({
  practiceName: z.string().trim().min(2).max(120),
  email: realEmail,
  websiteUrl: optionalHttpsUrl,
  suburb: z.string().trim().min(2).max(80),
  state: australianState,
  postcode: australianPostcode,
  contactSource: z.string().trim().min(8, "Describe how you checked the email address.").max(200),
  contactSourceUrl: optionalHttpsUrl,
  reportedHospitalName: z.string().trim().max(120),
  verifiedContact: z.literal(true, "Confirm you checked this contact information."),
});

export type ManualPracticeForm = Omit<z.input<typeof manualPracticeSchema>, "verifiedContact"> & { verifiedContact: boolean };
export const emptyManualPractice: ManualPracticeForm = {
  practiceName: "", email: "", websiteUrl: "", suburb: "", state: "NSW", postcode: "",
  contactSource: "", contactSourceUrl: "", reportedHospitalName: "", verifiedContact: false,
};
