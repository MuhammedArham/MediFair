import { z } from "zod";

export const editableDraftSchema = z.strictObject({
  subject: z.string().trim().min(8).max(180),
  body: z.string().trim().min(80).max(12_000),
});

export type QuoteDraftFacts = {
  patientName: string;
  procedureName: string;
  specialty: string | null;
  mbsItemNumber: string | null;
  mbsItemStatus: string;
  insurerName: string | null;
  hospitalCoverTier: string | null;
  coverageVerificationStatus: string | null;
  referralStatus: string;
};

export type DraftTone = "standard" | "warm" | "direct";

export function quoteFactsFromCase(record: {
  patientProfile: { displayName: string };
  insuranceProfile: { insurerName: string | null; hospitalCoverTier: string | null; coverageVerificationStatus: string } | null;
  procedureName: string; medicalSpecialty: string | null; mbsItemNumber: string | null;
  mbsItemStatus: string; referralStatus: string;
}): QuoteDraftFacts {
  return {
    patientName: record.patientProfile.displayName, procedureName: record.procedureName,
    specialty: record.medicalSpecialty, mbsItemNumber: record.mbsItemNumber,
    mbsItemStatus: record.mbsItemStatus, insurerName: record.insuranceProfile?.insurerName ?? null,
    hospitalCoverTier: record.insuranceProfile?.hospitalCoverTier ?? null,
    coverageVerificationStatus: record.insuranceProfile?.coverageVerificationStatus ?? null,
    referralStatus: record.referralStatus,
  };
}

export function buildQuoteRequestDraft(facts: QuoteDraftFacts, tone: DraftTone = "standard") {
  const confirmedMbs = facts.mbsItemNumber && ["CLINICIAN_CONFIRMED", "PROVIDER_CONFIRMED"].includes(facts.mbsItemStatus);
  const mbsSentence = confirmedMbs
    ? `The MBS item recorded for this treatment is ${facts.mbsItemNumber}, as confirmed by ${facts.mbsItemStatus === "CLINICIAN_CONFIRMED" ? "my treating clinician" : "a provider"}. Please confirm the item numbers your practice expects to use.`
    : "I do not have a clinician-confirmed MBS item number for this request. Please advise which item numbers you propose, if you can determine them.";
  const coverSentence = facts.insurerName
    ? `My private insurer is ${facts.insurerName}${facts.hospitalCoverTier ? `, with ${facts.hospitalCoverTier} hospital cover` : ""}. My cover and benefits for this treatment ${facts.coverageVerificationStatus === "INSURER_CONFIRMED" ? "have been recorded as insurer-confirmed, but I would still like the practice-specific arrangements checked" : "have not been independently confirmed"}.`
    : "I have not provided private insurer details, so please do not assume that I have cover or that any insurer benefit applies.";
  const referralSentence = ["REFERRAL", "BOTH"].includes(facts.referralStatus)
    ? "I have a referral, although I understand your practice may need to review it."
    : "Please advise whether a referral or initial consultation is needed before a personalised quote.";
  const opening = tone === "warm"
    ? `Hello, my name is ${facts.patientName}. I would appreciate your help understanding the likely costs of ${facts.procedureName}.`
    : tone === "direct"
      ? `Hello, I am ${facts.patientName} and I am seeking a written cost estimate for ${facts.procedureName}.`
      : `Hello, my name is ${facts.patientName}. I am comparing written estimates for ${facts.procedureName} and would like to understand your practice's process and likely costs.`;

  return editableDraftSchema.parse({
    subject: `Request for written cost estimate: ${facts.procedureName}`,
    body: `${opening}\n\n${mbsSentence}\n${coverSentence}\n${referralSentence}\n\nCould you please let me know:\n1. Does your practice offer this treatment, and can you advise whether an initial consultation or referral is needed before providing a personalised estimate?\n2. Where possible, what is the written estimate of fees, and which MBS item numbers do you propose?\n3. Does the estimate include the surgeon, anaesthetist, assistant, hospital or facility, theatre and other charges? Which amounts are billed separately?\n4. Which hospital or facility is normally used, if known?\n5. Does your practice participate in a gap-cover arrangement with my insurer, if applicable? Are no-gap, known-gap, hardship or reduced-fee arrangements available, and what conditions apply?\n6. What other fees or exclusions should I allow for, and when would the estimate expire?\n7. If it can be determined from the available information, what is my expected out-of-pocket cost after known Medicare and insurer benefits, excess and co-payments? Please mark any unknown amounts rather than estimating them.\n\nI understand clinical suitability, item numbers, coverage and final fees may require a consultation or checks with my insurer. I can provide a referral through your usual secure process if needed. Please let me know the next step without requesting detailed medical information by email.\n\nKind regards,\n${facts.patientName}`,
  });
}
