import { z } from "zod";

export const requestTypeSchema = z.enum([
  "GAP_COVER", "LOWER_SPECIALIST_FEE", "FINANCIAL_HARDSHIP", "ITEMISED_PRICING",
  "BILLING_DISCREPANCY", "POSSIBLE_BILLING_ERROR", "INSURER_BENEFITS_REVIEW", "WRITTEN_REVISED_QUOTE",
]);
export type RequestType = z.infer<typeof requestTypeSchema>;

export const requestLabels: Record<RequestType, string> = {
  GAP_COVER: "Ask about insurer gap cover",
  LOWER_SPECIALIST_FEE: "Request a lower specialist fee",
  FINANCIAL_HARDSHIP: "Request hardship consideration",
  ITEMISED_PRICING: "Request itemised pricing",
  BILLING_DISCREPANCY: "Clarify a billing discrepancy",
  POSSIBLE_BILLING_ERROR: "Request review of a possible billing error",
  INSURER_BENEFITS_REVIEW: "Ask the insurer to review benefits",
  WRITTEN_REVISED_QUOTE: "Request a written revised quote",
};

export type DraftContext = {
  type: RequestType; providerName: string; procedureName: string; mbsItemNumber: string | null;
  insurerName: string | null; patientName: string; originalGapCents: number | null;
  evidence: string[]; missing: string[]; sourceUrl: string | null; preferredLocation: string | null;
  hardshipDisclosed: boolean; specialistFeeRequested: boolean;
};

const aud = (cents: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);

export function draftNegotiationRequest(input: DraftContext) {
  if (input.type === "FINANCIAL_HARDSHIP" && !input.hardshipDisclosed) throw new Error("The patient must explicitly disclose financial hardship before this request can be drafted.");
  if (input.type === "LOWER_SPECIALIST_FEE" && !input.specialistFeeRequested) throw new Error("The patient must explicitly choose to request a lower specialist fee.");
  if (input.type === "INSURER_BENEFITS_REVIEW" && !input.insurerName) throw new Error("An insurer name is needed for a benefits review draft.");
  const topic = requestLabels[input.type].toLowerCase();
  const context = `I am reviewing the fictional written estimate for ${input.procedureName}${input.mbsItemNumber ? ` (proposed MBS item ${input.mbsItemNumber}, as recorded for this case)` : ""}.`;
  const cost = input.originalGapCents === null ? "The expected out-of-pocket amount has not been established." : `The current written estimate states an expected patient out-of-pocket amount of ${aud(input.originalGapCents)}; I understand this may depend on confirmed benefits and inclusions.`;
  const evidence = input.evidence.length ? `The information I am asking about is: ${input.evidence.slice(0, 3).join("; ")}.` : "I would appreciate written clarification of the current estimate.";
  const questions: Record<RequestType, string> = {
    GAP_COVER: `Could you confirm whether you would use any applicable no-gap or known-gap arrangement with ${input.insurerName ?? "my insurer"} for this service? If so, please state the conditions, any specialist gap, and which other charges remain separate. I will also confirm benefits directly with the insurer.`,
    LOWER_SPECIALIST_FEE: "Would the treating specialist consider a lower discretionary fee for this quoted service? Please let me know the revised fee and any changes to what is included. I understand any reduction is at the practitioner's discretion.",
    FINANCIAL_HARDSHIP: "I have difficulty affording the estimated costs. Are any financial assistance options, fee reductions, or payment plans available? Please explain any eligibility conditions and the resulting written cost estimate.",
    ITEMISED_PRICING: "Could you provide a written breakdown of surgeon, assistant, anaesthetist, hospital, theatre, accommodation, device, medicine and other charges where relevant? Please identify fees billed separately and any items not yet quoted.",
    BILLING_DISCREPANCY: "Could you explain the difference between the earlier written estimate and the later invoice or quote, including any added or changed charges? Please provide an itemised reconciliation and identify any changed inclusions or conditions.",
    POSSIBLE_BILLING_ERROR: "Could you review the itemisation and arithmetic, including any possibly duplicated entry or payment that may be missing? Please correct any error you identify or explain why the entries are correct.",
    INSURER_BENEFITS_REVIEW: `Could ${input.insurerName} review the benefits that may apply to this proposed service and provide written confirmation of the relevant policy terms, excess, co-payment, gap-cover arrangements and any remaining patient responsibility? Please identify any details you need to make that assessment.`,
    WRITTEN_REVISED_QUOTE: "Could you provide a revised written estimate that separately states all known fees, benefits, excess, co-payment, exclusions, validity period and expected patient out-of-pocket amount, if it can be determined? Please identify any assumptions or services that have changed.",
  };
  const missing = input.missing.length ? `I would also appreciate clarification of: ${input.missing.slice(0, 4).join("; ")}.` : "";
  const source = input.sourceUrl ? `For general cost-information context, I have consulted ${input.sourceUrl}. I am asking for my own written estimate rather than assuming a particular fee or entitlement.` : "";
  const location = input.preferredLocation ? `My preferred location is ${input.preferredLocation}, if that is relevant to the quote.` : "";
  const body = [`Hello ${input.providerName},`, "", context, cost, evidence, "", questions[input.type], missing, location, source, "", "Please do not include detailed medical records by email. I understand a consultation or referral may be needed before a personalised quote is possible.", "", `Kind regards,`, input.patientName, "", "FICTIONAL DEMO REQUEST — no real patient details"].filter(Boolean).join("\n");
  return { subject: `Fictional cost question: ${topic}`, body, reason: requestLabels[input.type], informationDisclosed: ["Fictional patient name", "Procedure and proposed MBS item if recorded", "Fictional quoted cost", "Relevant billing evidence", ...(input.type === "FINANCIAL_HARDSHIP" ? ["Explicitly disclosed financial difficulty"] : [])] };
}
