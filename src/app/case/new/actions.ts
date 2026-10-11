"use server";

import { assertWorkspaceAccess } from "@/lib/auth/server-access";

import { redirect } from "next/navigation";
import { onboardingSchema } from "@/lib/onboarding";
import { saveOnboardingCase } from "@/lib/db/onboarding";

export type OnboardingActionState = { message: string; errors: Record<string, string[]> };

export async function saveOnboardingAction(_previous: OnboardingActionState, formData: FormData): Promise<OnboardingActionState> {
  await assertWorkspaceAccess();
  const payload = formData.get("payload");
  const editId = formData.get("editId");
  if (typeof payload !== "string" || payload.length > 20_000 || (editId !== null && (typeof editId !== "string" || editId.length > 100))) {
    return { message: "The form data could not be read. Please review and try again.", errors: {} };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return { message: "The form data could not be read. Please review and try again.", errors: {} };
  }
  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success) {
    return { message: "Check the highlighted details before continuing.", errors: parsed.error.flatten().fieldErrors };
  }
  let caseId: string;
  try {
    caseId = await saveOnboardingCase(parsed.data, editId || undefined);
  } catch {
    return { message: "We could not save this fictional case. Refresh the page and try again.", errors: {} };
  }
  redirect(`/providers?case=${encodeURIComponent(caseId)}&created=1`);
}
