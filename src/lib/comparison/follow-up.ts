import { z } from "zod";
import { getDatabaseClient, type DatabaseClient } from "../db/client";
import { saveSelectedQuoteDraft } from "../db/quote-drafts";
import { loadComparison } from "./data";

const noteSchema = z.string().trim().min(12, "Describe the source of confirmation in at least 12 characters.").max(1200);

async function fictionalQuote(quoteId: string, client: DatabaseClient) {
  const quote = await client.quote.findUniqueOrThrow({ where: { id: z.string().min(1).max(100).parse(quoteId) }, include: { case: { include: { patientProfile: true } }, provider: true } });
  if (process.env.DEMO_MODE === "false" || !quote.isFictional || !quote.case.isFictional || !quote.case.patientProfile.isFictional || !quote.case.patientProfile.consentGivenAt || quote.case.patientProfile.consentWithdrawnAt) throw new Error("Only an open, consented fictional case can be changed in demo mode.");
  return quote;
}

export async function confirmQuoteEvidence(quoteId: string, kind: "FINANCIAL" | "SCOPE", rawNote: unknown, client: DatabaseClient = getDatabaseClient()) {
  const note = noteSchema.parse(rawNote);
  const quote = await fictionalQuote(quoteId, client);
  if (kind === "SCOPE" && !quote.case.clinicianConfirmedAt) throw new Error("A treating clinician must first confirm the case procedure.");
  const at = new Date();
  await client.$transaction(async (tx) => {
    await tx.quote.update({ where: { id: quote.id }, data: kind === "SCOPE"
      ? { scopeConfirmedAt: at, scopeEvidenceNote: note }
      : { financialEvidenceConfirmedAt: at, financialEvidenceNote: note, confirmationStatus: "PATIENT_VERIFIED" } });
    await tx.auditEvent.create({ data: { caseId: quote.caseId, patientProfileId: quote.case.patientProfileId, action: kind === "SCOPE" ? "QUOTE_SCOPE_CONFIRMED" : "QUOTE_EVIDENCE_CONFIRMED", actor: "PATIENT", detailsJson: JSON.stringify({ quoteId, note, kind, simulated: true }) } });
  });
}

export function missingInformationDraft(providerName: string, procedureName: string, missing: string[], excluded: string[]) {
  const questions = [...new Set([...missing, ...excluded])];
  return {
    subject: `Follow-up questions on your written estimate — ${procedureName}`.slice(0, 180),
    body: `Hello ${providerName},\n\nThank you for your estimate for ${procedureName}. Before I can compare costs, could you please clarify the following in a revised written estimate?\n\n${questions.length ? questions.map((item) => `• ${item}`).join("\n") : "• Please confirm all included and excluded charges, benefits, excess and the total expected patient out-of-pocket amount."}\n\nPlease state which proposed MBS items apply, whether surgeon, assistant, anaesthetist, hospital, theatre, accommodation, device, medicines and any other charges are included, and whether any insurer arrangement has been independently confirmed. Please also state the quote expiry and whether a consultation or referral is required.\n\nThere is no need to include detailed medical information by email.\n\nThank you.`,
  };
}

export async function saveMissingInformationDraft(quoteId: string, rawDraft: unknown, client: DatabaseClient = getDatabaseClient()) {
  const quote = await fictionalQuote(quoteId, client);
  return saveSelectedQuoteDraft(quote.caseId, quote.providerId, rawDraft, client);
}

export async function startQuoteNegotiation(quoteId: string, client: DatabaseClient = getDatabaseClient()) {
  const quote = await fictionalQuote(quoteId, client);
  const existing = await client.negotiation.findFirst({ where: { originalQuoteId: quote.id, status: "DRAFT" } });
  if (existing) return existing;
  const comparison = await loadComparison(quote.caseId, client);
  const selected = comparison?.groups.flatMap((group) => group.versions).find((entry) => entry.quote.id === quote.id);
  const gaps = selected?.result.reasons ?? [];
  return client.$transaction(async (tx) => {
    const negotiation = await tx.negotiation.create({ data: { caseId: quote.caseId, providerId: quote.providerId, originalQuoteId: quote.id, status: "DRAFT", originalRequest: `Fictional unsent request: please review your written estimate for ${quote.procedureName}. ${gaps.length ? `Please clarify: ${gaps.join("; ")}.` : "Please advise whether a reduced specialist fee, a confirmed gap arrangement, or a payment plan is available."} Please provide any revised offer in writing, including all affected charges and expected patient cost.`, isSimulation: true } });
    if (quote.provider.email) await tx.negotiationRequest.create({ data: { negotiationId: negotiation.id, caseId: quote.caseId, providerId: quote.providerId, version: 1, recipientEmail: quote.provider.email,
      subject: "Fictional request for written cost clarification", draftBody: negotiation.originalRequest, reason: "Clarify or review the quoted costs", originalPatientGapCents: selected?.result.quotedPatientCostCents ?? null,
      informationDisclosedJson: JSON.stringify(["Fictional procedure", "Quote review questions"]), supportingDocumentsJson: "[]" } });
    await tx.auditEvent.create({ data: { caseId: quote.caseId, patientProfileId: quote.case.patientProfileId, negotiationId: negotiation.id, action: "NEGOTIATION_UPDATED", actor: "PATIENT", detailsJson: JSON.stringify({ originalQuoteId: quote.id, status: "DRAFT", sent: false, simulated: true }) } });
    return negotiation;
  });
}

/** Explicit local synthetic evidence review; never inferred from a provider email. */
export async function confirmSyntheticScenario(quoteId: string, rawNote: unknown, client: DatabaseClient = getDatabaseClient()) {
  const note = noteSchema.parse(rawNote);
  const quote = await fictionalQuote(quoteId, client);
  const source = await client.quoteExtraction.findFirst({ where: { quoteId, providerMode: "MOCK_AI", status: "COMPLETE" } });
  if (!source || !quote.case.insuranceProfileId) throw new Error("A mock extraction and fictional insurer profile are required.");
  const extraction = JSON.parse(source.reviewedResultJson ?? source.resultJson ?? "{}");
  if (extraction.insurance?.coverageConfirmation !== "INSURER_CONFIRMED") throw new Error("This fixture does not contain synthetic insurer confirmation.");
  await client.$transaction(async (tx) => {
    await tx.case.update({ where: { id: quote.caseId }, data: { clinicianConfirmedAt: new Date() } });
    await tx.insuranceProfile.update({ where: { id: quote.case.insuranceProfileId!, isFictional: true }, data: { coverageVerificationStatus: "INSURER_CONFIRMED", coverageVerifiedAt: new Date() } });
    await tx.quote.update({ where: { id: quote.id }, data: { scopeConfirmedAt: new Date(), scopeEvidenceNote: note, financialEvidenceConfirmedAt: new Date(), financialEvidenceNote: note } });
    await tx.auditEvent.create({ data: { caseId: quote.caseId, patientProfileId: quote.case.patientProfileId, action: "QUOTE_SCOPE_CONFIRMED", actor: "PATIENT", detailsJson: JSON.stringify({ quoteId, note, simulated: true, source: "Explicit review of synthetic scope and insurer fixture; no real coverage verification" }) } });
  });
}
