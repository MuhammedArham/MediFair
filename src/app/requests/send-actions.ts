"use server";

import { assertWorkspaceAccess } from "@/lib/auth/server-access";

import { revalidatePath } from "next/cache";
import { sendApprovedRequests } from "@/lib/db/outbound-sends";

export async function sendApprovedRequestsAction(caseId: string, confirmed: boolean) {
  await assertWorkspaceAccess();
  try {
    const outcomes = await sendApprovedRequests(caseId, confirmed);
    revalidatePath("/requests");
    revalidatePath("/inbox");
    revalidatePath(`/case/${caseId}`);
    return { ok: true as const, outcomes };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : "Could not start sending." };
  }
}
