"use server";

import { assertWorkspaceAccess } from "@/lib/auth/server-access";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addManualPractice, saveSelectedPractices, updateManualPractice } from "@/lib/db/provider-selection";
import { manualPracticeSchema } from "@/lib/provider-selection";

export async function saveSelectionAction(caseId: string, rawIds: unknown) {
  await assertWorkspaceAccess();
  try {
    const selectedIds = await saveSelectedPractices(caseId, rawIds);
    revalidatePath("/providers");
    revalidatePath(`/case/${caseId}`);
    return { ok: true as const, selectedIds, message: `${selectedIds.length} practice${selectedIds.length === 1 ? "" : "s"} saved for this case.` };
  } catch (error) {
    return { ok: false as const, message: error instanceof z.ZodError ? error.issues[0]?.message ?? "Check your selection." : "Could not save this selection. Check the case and try again." };
  }
}

export async function saveManualPracticeAction(caseId: string, editId: string | null, raw: unknown) {
  await assertWorkspaceAccess();
  const parsed = manualPracticeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, message: "Check the highlighted contact details.", errors: parsed.error.flatten().fieldErrors };
  try {
    const provider = editId
      ? await updateManualPractice(caseId, editId, parsed.data)
      : await addManualPractice(caseId, parsed.data);
    revalidatePath("/providers");
    return { ok: true as const, providerId: provider.id, message: editId ? "Practice details updated." : "User-verified practice added. Select it above to include it in your shortlist." };
  } catch {
    return { ok: false as const, message: "Could not save this practice. Check that its email and name are not already used for another entry.", errors: {} };
  }
}
