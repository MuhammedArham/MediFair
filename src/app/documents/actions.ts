"use server";

import { revalidatePath } from "next/cache";
import { assertWorkspaceAccess } from "@/lib/auth/server-access";
import { MAX_PDF_BYTES } from "@/lib/documents/pdf-storage";
import { createBillReviewOpportunity, deleteStoredDocument, saveDocumentCorrection, seedSyntheticDocuments, startBillNegotiation, uploadPdfDocument, type DocumentUpload } from "@/lib/documents/service";

async function assertAccess() { await assertWorkspaceAccess(); }
function message(error: unknown) { return error instanceof Error ? error.message : "Document operation failed."; }

export async function uploadDocumentAction(formData: FormData) {
  try {
    await assertAccess();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("Choose a PDF file.");
    if (file.size > MAX_PDF_BYTES) throw new Error("PDFs must be 4 MB or smaller.");
    if (formData.get("attestSynthetic") !== "yes") throw new Error("Confirm that this PDF contains synthetic data only.");
    const document = await uploadPdfDocument({
      caseId: String(formData.get("caseId") ?? ""), providerId: String(formData.get("providerId") ?? "") || null,
      documentType: String(formData.get("documentType") ?? "OTHER") as DocumentUpload["documentType"],
      fileName: file.name, mimeType: file.type || "application/octet-stream", bytes: new Uint8Array(await file.arrayBuffer()),
      attestSynthetic: true,
    });
    revalidatePath("/documents");
    return { ok: true as const, message: document.analysis?.status === "COMPLETE" ? "Synthetic PDF analysed and stored privately." : "PDF stored privately. Manual review is needed.", documentId: document.id };
  } catch (error) { return { ok: false as const, message: message(error) }; }
}

export async function seedDocumentsAction(caseId: string) {
  try { await assertAccess(); const documents = await seedSyntheticDocuments(caseId); revalidatePath("/documents"); return { ok: true as const, message: `${documents.length} fictional PDF fixtures are available.` }; }
  catch (error) { return { ok: false as const, message: message(error) }; }
}

export async function deleteDocumentAction(documentId: string) {
  try { await assertAccess(); await deleteStoredDocument(documentId); revalidatePath("/documents"); return { ok: true as const, message: "Private PDF and analysis deleted." }; }
  catch (error) { return { ok: false as const, message: message(error) }; }
}

export async function correctDocumentAction(documentId: string, rawJson: string, note: string) {
  try { await assertAccess(); await saveDocumentCorrection(documentId, JSON.parse(rawJson), note); revalidatePath("/documents"); revalidatePath(`/documents/${documentId}`); return { ok: true as const, message: "Reviewed values saved. Original extraction and PDF remain available." }; }
  catch (error) { return { ok: false as const, message: message(error) }; }
}

export async function createBillOpportunityAction(formData: FormData) {
  try {
    await assertAccess();
    const caseId = String(formData.get("caseId") ?? "");
    const selection = { previous: String(formData.get("previous") ?? "") || null, revised: String(formData.get("revised") ?? "") || null, invoice: String(formData.get("invoice") ?? "") || null, statement: String(formData.get("statement") ?? "") || null };
    const opportunity = await createBillReviewOpportunity(caseId, selection, Number(formData.get("issueIndex")));
    revalidatePath("/documents");
    return { ok: true as const, message: "Potential review opportunity saved for this fictional case.", opportunityId: opportunity.id };
  } catch (error) { return { ok: false as const, message: message(error) }; }
}

export async function startBillNegotiationAction(opportunityId: string) {
  try { await assertAccess(); const negotiation = await startBillNegotiation(opportunityId); revalidatePath("/negotiation"); return { ok: true as const, message: "Unsent negotiation draft created.", draftId: negotiation.id, caseId: negotiation.caseId }; }
  catch (error) { return { ok: false as const, message: message(error) }; }
}
