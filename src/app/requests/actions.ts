"use server";

import { assertWorkspaceAccess } from "@/lib/auth/server-access";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { approveSelectedQuoteDraft, rejectSelectedQuoteDraft, saveSelectedQuoteDraft } from "@/lib/db/quote-drafts";
import { getCase } from "@/lib/db/repository";
import { personaliseSyntheticDraft } from "@/lib/quote-draft-ai";
import { quoteFactsFromCase } from "@/lib/quote-request-template";

type DraftInput = { subject: string; body: string };

function errorMessage(error: unknown) {
  return error instanceof z.ZodError ? error.issues[0]?.message ?? "Check the draft." : error instanceof Error ? error.message : "The draft could not be saved.";
}

export async function saveDraftAction(caseId: string, providerId: string, draft: DraftInput) {
  await assertWorkspaceAccess();
  try {
    const saved = await saveSelectedQuoteDraft(caseId, providerId, draft);
    revalidatePath("/requests");
    return { ok: true as const, id: saved.id, status: saved.status, version: saved.requestVersion, subject: saved.subject, body: saved.body, message: "Draft saved. No email was sent." };
  } catch (error) { return { ok: false as const, message: errorMessage(error) }; }
}

export async function decideDraftAction(caseId: string, providerId: string, draft: DraftInput, decision: "APPROVE" | "REJECT") {
  await assertWorkspaceAccess();
  try {
    const saved = await saveSelectedQuoteDraft(caseId, providerId, draft);
    const result = decision === "APPROVE"
      ? saved.status === "APPROVED" ? saved : await approveSelectedQuoteDraft(caseId, providerId, saved.id)
      : saved.status === "REJECTED" ? saved : await rejectSelectedQuoteDraft(caseId, providerId, saved.id);
    revalidatePath("/requests");
    return { ok: true as const, id: result.id, status: result.status, version: result.requestVersion, subject: result.subject, body: result.body, message: decision === "APPROVE" ? "Exact draft approved and recorded. No email was sent." : "Draft rejected and recorded. No email was sent." };
  } catch (error) { return { ok: false as const, message: errorMessage(error) }; }
}

export async function personaliseDraftAction(caseId: string, providerId: string) {
  await assertWorkspaceAccess();
  try {
    const record = await getCase(caseId);
    if (!record || !record.isFictional || !record.patientProfile.isFictional || !record.selectedProviders.some((selection) => selection.providerId === providerId)) throw new Error("A selected fictional case is required.");
    const draft = await personaliseSyntheticDraft(quoteFactsFromCase(record));
    return { ok: true as const, draft, message: "Template opening adjusted. Review and save the complete draft." };
  } catch (error) { return { ok: false as const, message: errorMessage(error) }; }
}
