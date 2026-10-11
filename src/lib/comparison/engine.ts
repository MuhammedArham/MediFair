export type ComparisonFee = {
  category: string;
  description: string;
  cents: number | null;
  includedInTotal: boolean | null;
  evidence: string | null;
};

export type ComparisonInput = {
  id: string;
  providerId: string;
  procedureName: string;
  caseProcedureConfirmed: boolean;
  quoteScopeConfirmed: boolean;
  quoteCompleteness: "COMPLETE" | "INCOMPLETE" | "UNKNOWN";
  issueDate: Date;
  expiryDate: Date | null;
  fees: ComparisonFee[];
  totalFeesCents: number | null;
  medicareBenefitCents: number | null;
  insurerBenefitCents: number | null;
  excessCents: number | null;
  coPaymentCents: number | null;
  reportedPatientGapCents: number | null;
  insuranceConfirmed: boolean;
  missingFees: string[];
  excludedComponents: string[];
  humanReviewFlags: string[];
};

export type ComparisonResult = {
  quotedPatientCostCents: number | null;
  calculatedPatientCostCents: number | null;
  reportedPatientGapCents: number | null;
  grossFeeSumCents: number | null;
  status: "COMPLETE" | "INCOMPLETE_QUOTE" | "INSURANCE_NOT_VERIFIED" | "SCOPE_NOT_CONFIRMED" | "EXPIRED" | "ARITHMETIC_REVIEW";
  reasons: string[];
  rankable: boolean;
  calculation: string;
};

const additionalPatientCharges = new Set(["EXCESS", "CO_PAYMENT"]);

export function compareQuote(input: ComparisonInput, now = new Date()): ComparisonResult {
  const reasons = [...input.missingFees, ...input.humanReviewFlags];
  const grossFees = input.fees.filter((fee) => !additionalPatientCharges.has(fee.category));
  const mandatory = ["SURGEON", "ANAESTHETIST"];
  for (const category of mandatory) {
    if (!grossFees.some((fee) => fee.category === category && fee.cents !== null)) reasons.push(`${category.toLowerCase().replaceAll("_", " ")} fee not stated`);
  }
  if (!grossFees.some((fee) => ["HOSPITAL", "THEATRE"].includes(fee.category) && fee.cents !== null)) reasons.push("Hospital or theatre fee not stated");
  if (!grossFees.length || grossFees.some((fee) => fee.cents === null || fee.includedInTotal !== true)) reasons.push("Itemised fee amount or inclusion is unknown");
  if (input.excludedComponents.length) reasons.push(`Excluded charges: ${input.excludedComponents.join(", ")}`);
  if (input.quoteCompleteness !== "COMPLETE") reasons.push("Provider quote is marked incomplete");
  if (input.totalFeesCents === null) reasons.push("Total provider fees not stated");
  const grossFeeSumCents = grossFees.length && grossFees.every((fee) => fee.cents !== null && fee.includedInTotal === true)
    ? grossFees.reduce((sum, fee) => sum + fee.cents!, 0) : null;
  const mismatch = grossFeeSumCents !== null && input.totalFeesCents !== null && grossFeeSumCents !== input.totalFeesCents;
  if (mismatch) reasons.push("Stated total differs from itemised provider fees");

  const chargedExcess = input.fees.find((fee) => fee.category === "EXCESS" && fee.cents !== null)?.cents ?? null;
  const chargedCoPayment = input.fees.find((fee) => fee.category === "CO_PAYMENT" && fee.cents !== null)?.cents ?? null;
  if (chargedExcess !== null && input.excessCents !== null && chargedExcess !== input.excessCents) reasons.push("Excess amount conflicts with the itemised quote");
  if (chargedCoPayment !== null && input.coPaymentCents !== null && chargedCoPayment !== input.coPaymentCents) reasons.push("Co-payment amount conflicts with the itemised quote");
  const excess = input.excessCents ?? chargedExcess;
  const coPayment = input.coPaymentCents ?? chargedCoPayment;
  if (excess === null) reasons.push("Excess not confirmed");
  if (coPayment === null) reasons.push("Co-payment not confirmed");
  if (input.medicareBenefitCents === null) reasons.push("Medicare benefit not confirmed");
  if (input.insurerBenefitCents === null) reasons.push("Insurer benefit not confirmed");
  if (!input.insuranceConfirmed) reasons.push("Insurer coverage not independently confirmed");
  if (!input.caseProcedureConfirmed || !input.quoteScopeConfirmed) reasons.push("Same clinical scope has not been confirmed for this quote");
  if (input.expiryDate && input.expiryDate < now) reasons.push("Quote has expired");

  const calculable = grossFeeSumCents !== null && !mismatch && input.totalFeesCents !== null &&
    excess !== null && coPayment !== null && input.medicareBenefitCents !== null && input.insurerBenefitCents !== null &&
    input.missingFees.length === 0 && input.excludedComponents.length === 0 && input.quoteCompleteness === "COMPLETE" &&
    input.humanReviewFlags.length === 0 && !reasons.some((reason) => reason.includes("conflicts"));
  const calculatedPatientCostCents = calculable
    ? input.totalFeesCents! - input.medicareBenefitCents! - input.insurerBenefitCents! + excess! + coPayment! : null;
  if (calculatedPatientCostCents !== null && calculatedPatientCostCents < 0) reasons.push("Benefits exceed stated fees and charges");
  if (calculatedPatientCostCents !== null && input.reportedPatientGapCents !== null && calculatedPatientCostCents !== input.reportedPatientGapCents) reasons.push("Provider-reported patient gap differs from the checked calculation");
  const arithmeticReview = reasons.some((reason) => /differs|conflicts|exceed/.test(reason));
  const financialComplete = calculable && !arithmeticReview && calculatedPatientCostCents! >= 0;
  const status: ComparisonResult["status"] = arithmeticReview ? "ARITHMETIC_REVIEW"
    : !financialComplete ? "INCOMPLETE_QUOTE"
    : !input.caseProcedureConfirmed || !input.quoteScopeConfirmed ? "SCOPE_NOT_CONFIRMED"
    : !input.insuranceConfirmed ? "INSURANCE_NOT_VERIFIED"
    : input.expiryDate && input.expiryDate < now ? "EXPIRED" : "COMPLETE";
  return {
    quotedPatientCostCents: status === "COMPLETE" ? (input.reportedPatientGapCents ?? calculatedPatientCostCents) : null,
    calculatedPatientCostCents, reportedPatientGapCents: input.reportedPatientGapCents,
    grossFeeSumCents, status, reasons: [...new Set(reasons)], rankable: status === "COMPLETE",
    calculation: "Gross itemised provider fees − Medicare benefit − insurer benefit + excess + co-payment. Excess and co-payment are counted once; a provider-stated gap is cross-checked, never added to.",
  };
}

export function rankComparableQuotes<T extends { input: ComparisonInput; result: ComparisonResult }>(quotes: T[]) {
  return quotes.filter((quote) => quote.result.rankable && quote.result.quotedPatientCostCents !== null)
    .sort((a, b) => a.result.quotedPatientCostCents! - b.result.quotedPatientCostCents!);
}
