"use server";

import { revalidatePath } from "next/cache";
import { assertWorkspaceAccess } from "@/lib/auth/server-access";
import { generateReviewRequest, recordCaseComplaint, resolveCaseComplaint, saveReviewPreferences, saveReviewRequest, updateReviewOpportunityStatus } from "@/lib/opportunities/service";

async function assertAccess() { await assertWorkspaceAccess(); }
function errorText(error: unknown) { return error instanceof Error ? error.message : "Unable to save this review."; }
export async function savePreferencesAction(form: FormData) {
  try { await assertAccess(); const caseId = String(form.get("caseId") ?? ""); await saveReviewPreferences(caseId, { financialHardshipDisclosed: form.get("hardship") === "yes", specialistFeeRequest: form.get("feeRequest") === "yes" }); revalidatePath("/opportunities"); return { ok: true as const, message: "Fictional preferences saved." }; }
  catch (error) { return { ok: false as const, message: errorText(error) }; }
}
export async function recordComplaintAction(form: FormData) {
  try { await assertAccess(); if (form.get("attestSynthetic") !== "yes") throw new Error("Confirm this is a fictional complaint."); await recordCaseComplaint(String(form.get("caseId") ?? ""), { party: form.get("party"), providerId: String(form.get("providerId") ?? "") || null, summary: form.get("summary") }); revalidatePath("/opportunities"); return { ok: true as const, message: "Fictional complaint recorded for review." }; }
  catch (error) { return { ok: false as const, message: errorText(error) }; }
}
export async function updateOpportunityStatusAction(caseId: string, stableKey: string, status: string) {
  try { await assertAccess(); await updateReviewOpportunityStatus(caseId, stableKey, status); revalidatePath("/opportunities"); return { ok: true as const, message: `Review marked ${status.toLowerCase()}.` }; }
  catch (error) { return { ok: false as const, message: errorText(error) }; }
}
export async function resolveComplaintAction(caseId: string, complaintId: string) {
  try { await assertAccess(); await resolveCaseComplaint(caseId, complaintId); revalidatePath("/opportunities"); return { ok: true as const, message: "Complaint marked resolved." }; }
  catch (error) { return { ok: false as const, message: errorText(error) }; }
}
export async function generateRequestAction(caseId: string, stableKey: string) {
  try { await assertAccess(); await generateReviewRequest(caseId, stableKey); revalidatePath("/opportunities"); return { ok: true as const, message: "Editable request draft saved. Nothing was sent." }; }
  catch (error) { return { ok: false as const, message: errorText(error) }; }
}
export async function saveRequestAction(caseId: string, stableKey: string, body: string) {
  try { await assertAccess(); await saveReviewRequest(caseId, stableKey, body); revalidatePath("/opportunities"); return { ok: true as const, message: "Draft changes saved. Nothing was sent." }; }
  catch (error) { return { ok: false as const, message: errorText(error) }; }
}
