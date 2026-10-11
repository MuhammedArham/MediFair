import { quoteExtractionSchema, type QuoteExtraction } from "../ai/quote-extraction-schema";
import { getDatabaseClient, type DatabaseClient } from "../db/client";
import { compareQuote, type ComparisonInput } from "./engine";

function parsedExtraction(json: string | null): QuoteExtraction | null {
  if (!json) return null;
  try { const parsed = quoteExtractionSchema.safeParse(JSON.parse(json)); return parsed.success ? parsed.data : null; } catch { return null; }
}

export async function loadComparison(caseId: string, client: DatabaseClient = getDatabaseClient()) {
  const caseRecord = await client.case.findUnique({ where: { id: caseId, isFictional: true }, include: { insuranceProfile: true, patientProfile: true } });
  if (!caseRecord || !caseRecord.patientProfile.isFictional) return null;
  const quotes = await client.quote.findMany({ where: { caseId, isFictional: true }, include: {
    provider: { include: { hospitals: { include: { hospital: true } } } }, lineItems: true,
    sourceEmail: true, extractions: { orderBy: { createdAt: "desc" } },
  }, orderBy: [{ providerId: "asc" }, { revisionNumber: "desc" }] });
  const entries = quotes.map((quote) => {
    const extractionRecord = quote.extractions.find((record) => record.status === "COMPLETE");
    const extraction = parsedExtraction(extractionRecord?.reviewedResultJson ?? extractionRecord?.resultJson ?? null);
    const benefitLine = (category: string) => quote.lineItems.find((line) => line.category === category)?.knownBenefitCents ?? null;
    const chargeLine = (category: string) => quote.lineItems.find((line) => line.category === category)?.billedAmountCents ?? null;
    const input: ComparisonInput = {
      id: quote.id, providerId: quote.providerId, procedureName: quote.procedureName,
      caseProcedureConfirmed: caseRecord.clinicianConfirmedAt !== null,
      quoteScopeConfirmed: quote.scopeConfirmedAt !== null && quote.procedureName === caseRecord.procedureName,
      quoteCompleteness: quote.completeness, issueDate: quote.issueDate, expiryDate: quote.expiryDate,
      fees: extraction ? extraction.fees.map((fee) => ({ category: fee.category, description: fee.description, cents: fee.billedAmountCents, includedInTotal: fee.includedInTotal, evidence: fee.evidence }))
        : quote.lineItems.filter((line) => !["MEDICARE_BENEFIT", "INSURER_BENEFIT"].includes(line.category)).map((line) => ({ category: line.category, description: line.description, cents: line.billedAmountCents, includedInTotal: line.category === "EXCESS" || line.category === "CO_PAYMENT" ? false : true, evidence: line.sourceLocator })),
      totalFeesCents: extraction?.totalFeesCents ?? null,
      medicareBenefitCents: extraction?.benefits.medicareCents ?? benefitLine("MEDICARE_BENEFIT"),
      insurerBenefitCents: extraction?.benefits.privateInsurerCents ?? benefitLine("INSURER_BENEFIT"),
      excessCents: extraction?.insurance.excessCents ?? chargeLine("EXCESS"),
      coPaymentCents: extraction?.insurance.coPaymentCents ?? chargeLine("CO_PAYMENT"),
      reportedPatientGapCents: extraction?.insurance.expectedPatientOutOfPocketCents ?? quote.lineItems.find((line) => line.patientResponsibilityCents !== null && line.category === "OTHER")?.patientResponsibilityCents ?? null,
      insuranceConfirmed: caseRecord.insuranceProfile?.coverageVerificationStatus === "INSURER_CONFIRMED" && extraction?.insurance.coverageConfirmation === "INSURER_CONFIRMED",
      missingFees: extraction?.missingFees ?? (quote.completeness === "COMPLETE" ? [] : ["Full itemised quote and benefits are missing"]),
      excludedComponents: extraction?.excludedComponents ?? [], humanReviewFlags: extraction?.humanReviewFlags ?? [],
    };
    return { quote, extraction, extractionRecord, input, result: compareQuote(input) };
  });
  const byProvider = new Map<string, typeof entries>();
  for (const entry of entries) byProvider.set(entry.quote.providerId, [...(byProvider.get(entry.quote.providerId) ?? []), entry]);
  const groups = [...byProvider.values()].map((versions) => {
    // A delayed older email gets a new database revision number but must not displace a newer source quote.
    versions.sort((a, b) => b.quote.issueDate.getTime() - a.quote.issueDate.getTime() || b.quote.revisionNumber - a.quote.revisionNumber);
    return { current: versions[0], versions };
  }).sort((a, b) => a.current.quote.provider.practiceName.localeCompare(b.current.quote.provider.practiceName));
  return { caseRecord, groups };
}
