"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { emailSimulatorAllowed } from "@/lib/email/dev-simulator-gate";
import { simulateProviderReply, simulateNegotiationReply } from "@/lib/db/inbound-email";

export async function simulateReplyAction(formData: FormData) {
  const requestHeaders = await headers();
  if (!emailSimulatorAllowed(requestHeaders.get("host"))) return { ok: false as const, message: "The email simulator is only available in local development with mock transport." };
  try {
    const result = await simulateProviderReply({
      caseId: formData.get("caseId"), providerId: formData.get("providerId"),
      templateId: formData.get("templateId"), body: formData.get("body"),
    });
    revalidatePath("/inbox"); revalidatePath("/dev/email-simulator");
    return { ok: result.status === "MATCHED", result, message: result.status === "MATCHED" ? "Synthetic reply added to the inbox." : "Reply could not be matched to a thread." };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : "Could not simulate the reply." };
  }
}

export async function simulateNegotiationReplyAction(formData: FormData) {
  const requestHeaders = await headers();
  if (!emailSimulatorAllowed(requestHeaders.get("host"))) return { ok: false as const, message: "The negotiation simulator is only available in local development with mock transport." };
  try {
    const result = await simulateNegotiationReply({ negotiationId: formData.get("negotiationId"), templateId: formData.get("templateId"), body: formData.get("body") });
    revalidatePath("/inbox"); revalidatePath("/comparison"); revalidatePath("/negotiation"); revalidatePath("/dev/email-simulator");
    return { ok: result.status === "MATCHED", message: result.status === "MATCHED" ? "Synthetic negotiation reply added to the normal inbox and processed." : `Reply status: ${result.status}.` };
  } catch (error) { return { ok: false as const, message: error instanceof Error ? error.message : "Could not simulate the response." }; }
}
