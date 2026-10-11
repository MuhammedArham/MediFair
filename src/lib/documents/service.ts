import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { getDatabaseClient, type DatabaseClient } from "../db/client";
import { compareBills, type BillDocument, type BillSelection } from "./compare";
import { createDocumentProvider } from "./provider";
import { documentAnalysisSchema, documentTypes, validateEvidence, type DocumentAnalysisResult, type PageText } from "./schema";
import { deletePrivatePdf, extractPdfPages, readPrivatePdf, validatePdfUpload, writePrivatePdf } from "./pdf-storage";
import { mockDocumentFixtures } from "./mock-fixtures";

const id = z.string().trim().min(1).max(100);
const uploadSchema = z.strictObject({ caseId: id, providerId: id.nullable(), documentType: z.enum(documentTypes), fileName: z.string(), mimeType: z.string(), attestSynthetic: z.literal(true) });
export type DocumentUpload = z.infer<typeof uploadSchema> & { bytes: Uint8Array };

function assertDemo() { if (process.env.DEMO_MODE === "false") throw new Error("Document writes require the local fictional demo environment."); }
async function eligibleCase(caseId: string, client: DatabaseClient) {
  const record = await client.case.findUniqueOrThrow({ where: { id: caseId, isFictional: true }, include: { patientProfile: true } });
  if (!record.patientProfile.isFictional || !record.patientProfile.consentGivenAt || record.patientProfile.consentWithdrawnAt) throw new Error("A consenting fictional case is required.");
  return record;
}

export async function uploadPdfDocument(input: DocumentUpload, client: DatabaseClient = getDatabaseClient(), sourceType: "UPLOAD" | "DEMO" = "UPLOAD") {
  assertDemo();
  const { bytes, ...fields } = input;
  const parsed = uploadSchema.parse(fields);
  const record = await eligibleCase(parsed.caseId, client);
  if (parsed.providerId) {
    const selected = await client.caseProviderSelection.findUnique({ where: { caseId_providerId: { caseId: record.id, providerId: parsed.providerId } } });
    if (!selected) throw new Error("Choose a practice selected for this case.");
  }
  const metadata = validatePdfUpload(parsed.fileName, parsed.mimeType, bytes);
  const existing = await client.document.findFirst({ where: { caseId: record.id, sha256: metadata.sha256, storageKey: { not: null } }, include: { analysis: true } });
  if (existing) return existing;
  const pages = await extractPdfPages(bytes);
  let interpretation: Awaited<ReturnType<ReturnType<typeof createDocumentProvider>["interpret"]>> | null = null;
  let failure: string | null = null;
  try { interpretation = await createDocumentProvider().interpret({ bytes, pages, isFictional: true }); }
  catch (error) { failure = error instanceof Error ? error.message.slice(0, 300) : "Document interpretation failed."; }
  const storageKey = await writePrivatePdf(bytes);
  try {
    return await client.$transaction(async (tx) => {
      const document = await tx.document.create({ data: { caseId: record.id, providerId: parsed.providerId, emailMessageId: null, kind: parsed.documentType === "FINAL_INVOICE" ? "INVOICE" : parsed.documentType === "BENEFIT_STATEMENT" ? "OTHER" : "QUOTE", documentType: parsed.documentType, sourceType, fileName: metadata.fileName, mimeType: metadata.mimeType, byteSize: metadata.byteSize, storageKey, sha256: metadata.sha256, isFictional: true } });
      await tx.documentAnalysis.create({ data: { documentId: document.id, providerMode: interpretation?.providerMode ?? ((process.env.AI_PROVIDER?.trim().toLowerCase() || "mock") === "mock" ? "MOCK_AI" : "OPENAI"), status: interpretation?.status ?? "FAILED", pageTextJson: JSON.stringify(pages), resultJson: interpretation?.result ? JSON.stringify(interpretation.result) : null, errorSummary: failure ?? interpretation?.message ?? null } });
      await tx.auditEvent.create({ data: { caseId: record.id, patientProfileId: record.patientProfileId, action: "DOCUMENT_UPLOADED", actor: "PATIENT", detailsJson: JSON.stringify({ documentId: document.id, sha256: metadata.sha256, documentType: parsed.documentType, sourceType, simulated: true }) } });
      return tx.document.findUniqueOrThrow({ where: { id: document.id }, include: { analysis: true } });
    });
  } catch (error) { await deletePrivatePdf(storageKey).catch(() => {}); throw error; }
}

export async function seedSyntheticDocuments(caseId: string, client: DatabaseClient = getDatabaseClient()) {
  assertDemo();
  if (caseId !== "demo-case") throw new Error("Built-in PDF examples belong only to the seeded fictional cataract case.");
  const added = [];
  for (const fixture of mockDocumentFixtures) {
    const bytes = await readFile(join(process.cwd(), "output", "pdf", fixture.fileName));
    const document = await uploadPdfDocument({ caseId, providerId: fixture.id === "benefit" ? null : "demo-provider-harbour", documentType: fixture.result.documentType, fileName: fixture.fileName, mimeType: "application/pdf", attestSynthetic: true, bytes }, client, "DEMO");
    added.push(document);
  }
  return added;
}

export async function getStoredDocument(documentId: string, client: DatabaseClient = getDatabaseClient()) {
  const document = await client.document.findUniqueOrThrow({ where: { id: id.parse(documentId), isFictional: true }, include: { case: { include: { patientProfile: true } }, analysis: true, provider: true } });
  if (!document.case.isFictional || !document.case.patientProfile.isFictional) throw new Error("Fictional document only.");
  return document;
}

export async function downloadStoredDocument(documentId: string, client: DatabaseClient = getDatabaseClient()) {
  const document = await getStoredDocument(documentId, client);
  if (!document.storageKey) throw new Error("This record has no stored PDF.");
  const bytes = await readPrivatePdf(document.storageKey);
  if (document.sha256 !== null && validatePdfUpload(document.fileName, document.mimeType, bytes).sha256 !== document.sha256) throw new Error("Stored document integrity check failed.");
  return { document, bytes };
}

export async function deleteStoredDocument(documentId: string, client: DatabaseClient = getDatabaseClient()) {
  assertDemo();
  const document = await getStoredDocument(documentId, client);
  if (!document.storageKey) throw new Error("Only privately stored PDFs can be deleted here.");
  await client.$transaction(async (tx) => {
    await tx.document.delete({ where: { id: document.id } });
    await tx.auditEvent.create({ data: { caseId: document.caseId, patientProfileId: document.case.patientProfileId, action: "DOCUMENT_DELETED", actor: "PATIENT", detailsJson: JSON.stringify({ documentId: document.id, sha256: document.sha256, simulated: true }) } });
  });
  await deletePrivatePdf(document.storageKey).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
}

export async function saveDocumentCorrection(documentId: string, raw: unknown, note: unknown, client: DatabaseClient = getDatabaseClient()) {
  assertDemo();
  const document = await getStoredDocument(documentId, client);
  if (!document.analysis) throw new Error("Document analysis record missing.");
  const result = documentAnalysisSchema.parse(raw);
  const reviewNote = z.string().trim().min(12).max(1200).parse(note);
  const pages = JSON.parse(document.analysis.pageTextJson ?? "[]") as PageText[];
  if (result.lineItems.some((line) => line.page > pages.length) || result.evidence.some((item) => item.page > pages.length)) throw new Error("Evidence page is outside the uploaded PDF.");
  const evidenceFailures = validateEvidence(result, pages);
  const saved = await client.$transaction(async (tx) => {
    const updated = await tx.documentAnalysis.update({ where: { documentId }, data: { reviewedResultJson: JSON.stringify(result), reviewedAt: new Date(), reviewNote, status: evidenceFailures.length ? "MANUAL_REVIEW" : "COMPLETE", errorSummary: evidenceFailures.length ? `Manual correction saved; source evidence needs review: ${evidenceFailures[0]}` : "Manually entered or corrected; check values against the source PDF." } });
    await tx.auditEvent.create({ data: { caseId: document.caseId, patientProfileId: document.case.patientProfileId, action: "DOCUMENT_REVIEWED", actor: "PATIENT", detailsJson: JSON.stringify({ documentId, note: reviewNote, simulated: true }) } });
    return updated;
  });
  return saved;
}

export function effectiveDocumentResult(analysis: { reviewedResultJson: string | null; resultJson: string | null } | null): DocumentAnalysisResult | null {
  const json = analysis?.reviewedResultJson ?? analysis?.resultJson;
  if (!json) return null;
  try { const parsed = documentAnalysisSchema.safeParse(JSON.parse(json)); return parsed.success ? parsed.data : null; } catch { return null; }
}

export async function listCaseDocuments(caseId: string, client: DatabaseClient = getDatabaseClient()) {
  await eligibleCase(id.parse(caseId), client);
  return client.document.findMany({ where: { caseId, isFictional: true, storageKey: { not: null } }, include: { analysis: true, provider: true }, orderBy: { createdAt: "desc" } });
}

export async function analyseSelectedDocuments(caseId: string, rawSelection: { previous?: string | null; revised?: string | null; invoice?: string | null; statement?: string | null }, client: DatabaseClient = getDatabaseClient()) {
  const documents = await listCaseDocuments(caseId, client);
  const selection: BillSelection = { previous: null, revised: null, invoice: null, statement: null };
  for (const role of ["previous", "revised", "invoice", "statement"] as const) {
    const selectedId = rawSelection[role];
    if (!selectedId) continue;
    const document = documents.find((item) => item.id === id.parse(selectedId));
    if (!document) throw new Error("A selected document does not belong to this case.");
    const result = effectiveDocumentResult(document.analysis);
    if (!result) throw new Error("A selected document needs manual entry or extraction review first.");
    selection[role] = { id: document.id, label: document.fileName, result } satisfies BillDocument;
  }
  return { selection, comparison: compareBills(selection) };
}

export async function createBillReviewOpportunity(caseId: string, rawSelection: { previous?: string | null; revised?: string | null; invoice?: string | null; statement?: string | null }, issueIndex: number, client: DatabaseClient = getDatabaseClient()) {
  assertDemo();
  const record = await eligibleCase(id.parse(caseId), client);
  const { selection, comparison } = await analyseSelectedDocuments(caseId, rawSelection, client);
  const index = z.number().int().min(0).parse(issueIndex);
  const issue = comparison.issues[index];
  if (!issue) throw new Error("Choose a current review finding.");
  const primary = selection.invoice ?? selection.revised ?? selection.previous ?? selection.statement;
  if (!primary) throw new Error("Select at least one document.");
  const compared = selection.revised?.id !== primary.id ? selection.revised : selection.previous?.id !== primary.id ? selection.previous : selection.statement?.id !== primary.id ? selection.statement : null;
  const primaryRecord = await client.document.findUniqueOrThrow({ where: { id: primary.id } });
  const quote = primaryRecord.providerId ? await client.quote.findFirst({ where: { caseId, providerId: primaryRecord.providerId, isFictional: true }, orderBy: { issueDate: "desc" } }) : null;
  const saved = await client.$transaction(async (tx) => {
    const opportunity = await tx.billReviewOpportunity.create({ data: { caseId, primaryDocumentId: primary.id, comparedDocumentId: compared?.id ?? null, quoteId: quote?.id ?? null, title: issue.description.slice(0, 240), detailsJson: JSON.stringify(issue), confidence: issue.confidence, isFictional: true } });
    await tx.auditEvent.create({ data: { caseId, patientProfileId: record.patientProfileId, action: "DOCUMENT_OPPORTUNITY_ADDED", actor: "PATIENT", detailsJson: JSON.stringify({ opportunityId: opportunity.id, primaryDocumentId: primary.id, issueKind: issue.kind, simulated: true }) } });
    return opportunity;
  });
  return saved;
}

export async function startBillNegotiation(opportunityId: string, client: DatabaseClient = getDatabaseClient()) {
  assertDemo();
  const opportunity = await client.billReviewOpportunity.findUniqueOrThrow({ where: { id: id.parse(opportunityId), isFictional: true }, include: { primaryDocument: { include: { provider: true } }, quote: true, case: { include: { patientProfile: true } }, negotiation: true } });
  if (!opportunity.case.isFictional || !opportunity.case.patientProfile.isFictional || !opportunity.case.patientProfile.consentGivenAt || opportunity.case.patientProfile.consentWithdrawnAt) throw new Error("A consenting fictional case is required.");
  if (opportunity.negotiation) return opportunity.negotiation;
  if (!opportunity.quote || !opportunity.primaryDocument.providerId || opportunity.quote.providerId !== opportunity.primaryDocument.providerId) throw new Error("A quote from the same fictional practice is required before creating a negotiation draft.");
  const issue = JSON.parse(opportunity.detailsJson) as { description: string; evidence?: { page: number; excerpt: string }[] };
  const request = `Fictional unsent bill clarification request. I am reviewing ${opportunity.primaryDocument.fileName} against the earlier written estimate for ${opportunity.quote.procedureName}. Please clarify: ${issue.description}\n\nPlease provide an itemised written explanation and, if relevant, a corrected invoice or revised estimate showing all charges, payments and the expected patient balance. I understand a difference alone does not establish an error.\n\nNo detailed medical records are attached.`;
  try {
    return await client.$transaction(async (tx) => {
      const negotiation = await tx.negotiation.create({ data: { caseId: opportunity.caseId, providerId: opportunity.quote!.providerId, originalQuoteId: opportunity.quote!.id, billOpportunityId: opportunity.id, originalRequest: request, requestType: "BILLING_DISCREPANCY", status: "DRAFT", isSimulation: true } });
      const recipient = opportunity.primaryDocument.provider?.email;
      if (!recipient) throw new Error("A verified practice contact is required.");
      await tx.negotiationRequest.create({ data: {
        version: 1, negotiationId: negotiation.id, caseId: opportunity.caseId, providerId: opportunity.quote!.providerId,
        recipientEmail: recipient, subject: "Fictional invoice clarification request", draftBody: request,
        reason: opportunity.title, supportingDocumentsJson: JSON.stringify([opportunity.primaryDocumentId, opportunity.comparedDocumentId].filter(Boolean)),
        informationDisclosedJson: JSON.stringify(["Fictional procedure", "Document names", "Documented billing discrepancy"]),
      } });
      await tx.auditEvent.create({ data: { caseId: opportunity.caseId, patientProfileId: opportunity.case.patientProfileId, negotiationId: negotiation.id, action: "NEGOTIATION_UPDATED", actor: "PATIENT", detailsJson: JSON.stringify({ billOpportunityId: opportunity.id, status: "DRAFT", sent: false, simulated: true }) } });
      return negotiation;
    });
  } catch (error) {
    const existing = await client.negotiation.findUnique({ where: { billOpportunityId: opportunity.id } });
    if (existing) return existing;
    throw error;
  }
}
