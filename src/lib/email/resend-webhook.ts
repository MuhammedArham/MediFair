import type { Resend } from "resend";

export function verifyResendWebhook(rawPayload: string, headers: { id: string; timestamp: string; signature: string }, webhookSecret: string, resend: Resend) {
  return resend.webhooks.verify({ payload: rawPayload, headers, webhookSecret });
}
