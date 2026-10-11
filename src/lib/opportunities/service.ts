import { z } from "zod";
import { getDatabaseClient, type DatabaseClient } from "../db/client";
import { quoteExtractionSchema, type QuoteExtraction } from "../ai/quote-extraction-schema";
import { effectiveDocumentResult } from "../documents/service";
import { detectReviewOpportunities, type DocumentFact, type QuoteFact, type ReviewFinding, type ReviewInput } from "./engine";

const id = z.string().min(1).max(100);
const note = z.string().trim().min(15).max(1200);
const party = z.enum(["INSURER", "PROVIDER", "PUBLIC_HOSPITAL"]);
function assertDemo() { if (process.env.DEMO_MODE === "false") throw new Error("Cost review is available only for fictional demo cases."); }
async function fictionalCase(caseId: string, client: DatabaseClient) {
  assertDemo();
  const record = await client.case.findUniqueOrThrow({ where: { id: id.parse(caseId), isFictional: true }, include: { patientProfile: true, insuranceProfile: true } });
  if (!record.patientProfile.isFictional || !record.patientProfile.consentGivenAt || record.patientProfile.consentWithdrawnAt) throw new Error("A consenting fictional case is required.");
  return record;
}
function parseExtraction(value: string | null): QuoteExtraction | null {
  if (!value) return null;
  try { const parsed = quoteExtractionSchema.safeParse(JSON.parse(value)); return parsed.success ? parsed.data : null; } catch { return null; }
}
export async function loadReviewInput(caseId: string, client: DatabaseClient = getDatabaseClient()): Promise<ReviewInput> {
  const record = await fictionalCase(caseId, client);
  const [quotes, documents, preference, complaints] = await Promise.all([
    client.quote.findMany({ where: { caseId, isFictional: true }, include: { provider: true, sourceEmail: true, lineItems: true, extractions: { orderBy: { createdAt: "desc" } } }, orderBy: [{ issueDate: "desc" }, { revisionNumber: "desc" }] }),
    client.document.findMany({ where: { caseId, isFictional: true, storageKey: { not: null } }, include: { analysis: true } }),
    client.caseReviewPreference.findUnique({ where: { caseId } }),
    client.caseComplaint.findMany({ where: { caseId, isFictional: true } }),
  ]);
  const seen = new Set<string>();
  const currentQuotes: QuoteFact[] = quotes.filter((quote) => { if (seen.has(quote.providerId)) return false; seen.add(quote.providerId); return true; }).map((quote) => {
    const extractionRecord = quote.extractions.find((entry) => entry.status === "COMPLETE");
    const extraction = parseExtraction(extractionRecord?.reviewedResultJson ?? extractionRecord?.resultJson ?? null);
    const missingFees = extraction?.missingFees ?? quote.lineItems.filter((line) => line.billedAmountCents === null && !["MEDICARE_BENEFIT", "INSURER_BENEFIT"].includes(line.category)).map((line) => line.description);
    return { id: quote.id, providerId: quote.providerId, providerName: quote.provider.practiceName, procedureName: quote.procedureName, completeness: quote.completeness, extraction, missingFees, sourceText: quote.sourceEmail?.body ?? null, patientGapCents: extraction?.insurance.expectedPatientOutOfPocketCents ?? null };
  });
  const documentFacts: DocumentFact[] = documents.flatMap((document) => {
    const result = effectiveDocumentResult(document.analysis);
    return result ? [{ id: document.id, label: document.fileName, providerId: document.providerId, documentType: document.documentType, result, isHumanReviewed: Boolean(document.analysis?.reviewedAt) }] : [];
  });
  return { caseId, state: record.state, procedureName: record.procedureName, insurerName: record.insuranceProfile?.insurerName ?? null, insurerCoverageStatus: record.insuranceProfile?.coverageVerificationStatus ?? "UNVERIFIED", quotes: currentQuotes, documents: documentFacts,
    financialHardshipDisclosed: Boolean(preference?.financialHardshipDisclosedAt), specialistFeeRequest: Boolean(preference?.specialistFeeRequestAt), complaints: complaints.map((complaint) => ({ id: complaint.id, party: complaint.party, providerId: complaint.providerId, summary: complaint.summary, resolved: Boolean(complaint.resolvedAt) })) };
}
export async function loadReviewPage(caseId: string, client: DatabaseClient = getDatabaseClient()) {
  const input = await loadReviewInput(caseId, client);
  const current = detectReviewOpportunities(input);
  const saved = await client.reviewOpportunity.findMany({ where: { caseId, stableKey: { in: current.map((item) => item.stableKey) } } });
  const byKey = new Map(saved.map((item) => [item.stableKey, item]));
  return { input, opportunities: current.map((item) => ({ ...item, status: byKey.get(item.stableKey)?.status ?? item.status, draftBody: byKey.get(item.stableKey)?.requestDraftBody ?? null })), savedCount: saved.length };
}
export async function saveReviewPreferences(caseId: string, raw: { financialHardshipDisclosed: unknown; specialistFeeRequest: unknown }, client: DatabaseClient = getDatabaseClient()) {
  await fictionalCase(caseId, client);
  const parsed = z.strictObject({ financialHardshipDisclosed: z.boolean(), specialistFeeRequest: z.boolean() }).parse(raw);
  const current = await client.caseReviewPreference.findUnique({ where: { caseId } });
  return client.caseReviewPreference.upsert({ where: { caseId }, create: { caseId, financialHardshipDisclosedAt: parsed.financialHardshipDisclosed ? new Date() : null, specialistFeeRequestAt: parsed.specialistFeeRequest ? new Date() : null }, update: { financialHardshipDisclosedAt: parsed.financialHardshipDisclosed ? current?.financialHardshipDisclosedAt ?? new Date() : null, specialistFeeRequestAt: parsed.specialistFeeRequest ? current?.specialistFeeRequestAt ?? new Date() : null } });
}
export async function recordCaseComplaint(caseId: string, raw: { party: unknown; providerId: unknown; summary: unknown }, client: DatabaseClient = getDatabaseClient()) {
  const record = await fictionalCase(caseId, client);
  const parsed = z.strictObject({ party, providerId: id.nullable(), summary: note }).parse(raw);
  if (parsed.party === "INSURER" && !record.insuranceProfile?.insurerName) throw new Error("Add a fictional insurer before recording an insurer complaint.");
  if (parsed.party === "PROVIDER") {
    if (!parsed.providerId) throw new Error("Choose the practice named in the complaint.");
    const selected = await client.caseProviderSelection.findUnique({ where: { caseId_providerId: { caseId, providerId: parsed.providerId } } });
    if (!selected) throw new Error("Choose a practice selected for this case.");
  }
  if (parsed.party === "PUBLIC_HOSPITAL" && record.state !== "NSW") throw new Error("This demo only has a verified public hospital complaint path for NSW.");
  return client.caseComplaint.create({ data: { caseId, party: parsed.party, providerId: parsed.party === "PROVIDER" ? parsed.providerId : null, summary: parsed.summary, isFictional: true } });
}
export async function resolveCaseComplaint(caseId: string, complaintId: string, client: DatabaseClient = getDatabaseClient()) {
  await fictionalCase(caseId, client);
  return client.caseComplaint.update({ where: { id: id.parse(complaintId), caseId, isFictional: true }, data: { resolvedAt: new Date() } });
}
function draftFor(finding: ReviewFinding) {
  const questions = finding.suggestedQuestions.map((question) => `- ${question}`).join("\n");
  return `Subject: Request for written clarification — fictional case\n\nHello,\n\nI am reviewing the costs for my fictional ${finding.caseId} case. ${finding.explanation}\n\nCould you please clarify the following in writing?\n${questions}\n\nPlease identify any relevant fees, benefits and remaining out-of-pocket amount separately where possible. I am seeking information and have not assumed an error or an entitlement to a discount.\n\nKind regards,\nFictional patient\n\nDEMO DRAFT — NOT SENT`;
}
function snapshotFields(finding: ReviewFinding) {
  return { category: finding.category, providerId: finding.providerId, insurerName: finding.insurerName, quoteId: finding.quoteId, documentId: finding.documentId, complaintId: finding.complaintId, title: finding.title, evidenceJson: JSON.stringify(finding.evidence), missingInformationJson: JSON.stringify(finding.missingInformation), ruleTriggered: finding.ruleTriggered, officialSourceUrl: finding.officialSourceUrl, explanation: finding.explanation, responsibleParty: finding.responsibleParty, suggestedQuestionsJson: JSON.stringify(finding.suggestedQuestions), confidence: finding.confidence, verificationStatus: finding.verificationStatus, potentialImpactCents: finding.potentialImpactCents, priorityScore: finding.priorityScore, isFictional: true };
}
async function currentFinding(caseId: string, stableKey: string, client: DatabaseClient) {
  await fictionalCase(caseId, client);
  const finding = detectReviewOpportunities(await loadReviewInput(caseId, client)).find((item) => item.stableKey === z.string().length(64).parse(stableKey));
  if (!finding) throw new Error("This opportunity is no longer current. Refresh the review before updating it.");
  return finding;
}
export async function generateReviewRequest(caseId: string, stableKey: string, client: DatabaseClient = getDatabaseClient()) {
  const finding = await currentFinding(caseId, stableKey, client);
  const body = draftFor(finding);
  const fields = snapshotFields(finding);
  return client.reviewOpportunity.upsert({ where: { stableKey }, create: { ...fields, id: finding.id, stableKey, caseId, requestDraftBody: body, requestDraftCreatedAt: new Date() }, update: { ...fields, requestDraftBody: body, requestDraftCreatedAt: new Date() } });
}
export async function updateReviewOpportunityStatus(caseId: string, stableKey: string, rawStatus: unknown, client: DatabaseClient = getDatabaseClient()) {
  const finding = await currentFinding(caseId, stableKey, client);
  const status = z.enum(["PROPOSED", "RESOLVED", "DISMISSED"]).parse(rawStatus);
  const fields = snapshotFields(finding);
  return client.reviewOpportunity.upsert({ where: { stableKey }, create: { ...fields, id: finding.id, stableKey, caseId, status }, update: { ...fields, status } });
}
export async function saveReviewRequest(caseId: string, stableKey: string, body: unknown, client: DatabaseClient = getDatabaseClient()) {
  await fictionalCase(caseId, client);
  const text = z.string().trim().min(30).max(6000).parse(body);
  const saved = await client.reviewOpportunity.findUniqueOrThrow({ where: { stableKey: z.string().length(64).parse(stableKey), caseId, isFictional: true } });
  if (!saved.requestDraftBody) throw new Error("Generate a draft before editing it.");
  return client.reviewOpportunity.update({ where: { id: saved.id }, data: { requestDraftBody: text } });
}
