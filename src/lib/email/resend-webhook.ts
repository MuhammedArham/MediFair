import type { Resend } from "resend";

export function verifyResendWebhook(rawPayload: string, headers: { id: string; timestamp: string; signature: string }, webhookSecret: string, resend: Resend) {
  // Dashboard copy/paste can include surrounding whitespace. Normalise only
  // configuration, never the signed payload or signature headers.
  return resend.webhooks.verify({ payload: rawPayload, headers, webhookSecret: webhookSecret.trim() });
}
