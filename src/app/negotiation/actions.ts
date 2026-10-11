"use server";

import { revalidatePath } from "next/cache";
import { assertWorkspaceAccess } from "@/lib/auth/server-access";
import { startOpportunityNegotiation, editNegotiationDraft, decideNegotiationRequest, sendNegotiationRequest, closeNegotiation } from "@/lib/negotiation/service";

async function access() { await assertWorkspaceAccess(); }
export async function negotiationAction(formData: FormData) {
  try {
    await access();
    const command = String(formData.get("command") ?? "");
    let id = String(formData.get("negotiationId") ?? "");
    let message = "Saved.";
    if (command === "start") {
      const created = await startOpportunityNegotiation({ caseId: formData.get("caseId"), stableKey: formData.get("stableKey"), requestType: formData.get("requestType"), providerId: formData.get("providerId"), recipientEmail: formData.get("recipientEmail"), recipientVerified: formData.get("recipientVerified") === "yes" });
      id = created.id; message = "Editable fictional request created. Review the disclosure and approve it separately.";
    } else if (command === "edit") {
      await editNegotiationDraft(id, { subject: formData.get("subject"), body: formData.get("body") });
      message = "Draft saved. Any earlier approval was cleared.";
    } else if (command === "review" || command === "approve" || command === "reject") {
      await decideNegotiationRequest(id, command === "approve" ? "APPROVE" : command === "reject" ? "REJECT" : "REVIEW");
      message = command === "approve" ? "Exact content approved. Use the separate send button when ready." : command === "reject" ? "Request rejected and closed." : "Draft ready for approval.";
    } else if (command === "send") {
      const outcome = await sendNegotiationRequest(id, formData.get("confirmed") === "yes");
      message = outcome.message;
    } else if (command === "close") {
      await closeNegotiation(id);
      message = "Negotiation closed. The message and decision history remains available.";
    } else throw new Error("Unknown negotiation action.");
    revalidatePath("/negotiation"); revalidatePath("/inbox"); revalidatePath("/comparison");
    return { ok: true as const, message, id };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : "The request could not be saved.", id: null };
  }
}
