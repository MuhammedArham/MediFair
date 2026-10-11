"use server";

import { assertWorkspaceAccess } from "@/lib/auth/server-access";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { confirmSyntheticScenario, confirmQuoteEvidence, saveMissingInformationDraft, startQuoteNegotiation } from "@/lib/comparison/follow-up";

export async function confirmQuoteAction(quoteId: string, kind: "FINANCIAL" | "SCOPE", formData: FormData) {
  await assertWorkspaceAccess();
  if (formData.get("acknowledge") !== "yes") throw new Error("Confirm the source statement before saving.");
  await confirmQuoteEvidence(quoteId, kind, formData.get("note"));
  revalidatePath("/comparison");
  revalidatePath(`/comparison/quote/${quoteId}`);
}

export async function saveMissingDraftAction(quoteId: string, formData: FormData) {
  await assertWorkspaceAccess();
  const saved = await saveMissingInformationDraft(quoteId, { subject: formData.get("subject"), body: formData.get("body") });
  revalidatePath("/requests");
  redirect(`/requests?case=${encodeURIComponent(saved.caseId)}`);
}

export async function startNegotiationAction(quoteId: string) {
  await assertWorkspaceAccess();
  const saved = await startQuoteNegotiation(quoteId);
  revalidatePath("/negotiation");
  redirect(`/negotiation?case=${encodeURIComponent(saved.caseId)}&draft=${encodeURIComponent(saved.id)}`);
}

export async function confirmScenarioAction(quoteId: string, formData: FormData) {
  await assertWorkspaceAccess();
  if (formData.get("confirmSyntheticScope") !== "yes" || formData.get("confirmSyntheticCover") !== "yes") throw new Error("Review both fictional evidence statements first.");
  await confirmSyntheticScenario(quoteId, formData.get("note"));
  revalidatePath("/", "layout");
}
