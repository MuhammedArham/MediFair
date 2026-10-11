import { Resend } from "resend";
import { recordDeliveryEvent } from "@/lib/db/delivery-events";
import { processResendReceivedWebhook, receivedWebhookSchema } from "@/lib/db/inbound-email";
import { createEmailTransport } from "@/lib/email/email-transport";
import { verifyResendWebhook } from "@/lib/email/resend-webhook";

export const runtime = "nodejs";

async function readLimitedBody(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new RangeError("Webhook too large");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(body);
}

export async function POST(request: Request) {
  if ((process.env.EMAIL_TRANSPORT?.trim().toLowerCase() || "mock") !== "resend") return new Response("Resend webhooks are disabled in mock email mode", { status: 404 });
  const apiKey = process.env.RESEND_API_KEY;
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret || !apiKey) return new Response("Webhook not configured", { status: 503 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 1_000_000) return new Response("Webhook too large", { status: 413 });
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature) return new Response("Invalid webhook", { status: 400 });
  let event;
  try {
    const rawPayload = await readLimitedBody(request, 1_000_000);
    event = verifyResendWebhook(rawPayload, { id, timestamp, signature }, secret, new Resend(apiKey));
  } catch (error) {
    if (error instanceof RangeError) return new Response("Webhook too large", { status: 413 });
    return new Response("Invalid webhook", { status: 400 });
  }
  try {
    if (event.type === "email.received") {
      try { receivedWebhookSchema.parse(event); }
      catch { return new Response("Invalid inbound email event", { status: 400 }); }
      const result = await processResendReceivedWebhook(event, id, createEmailTransport());
      return Response.json({ ok: true, result });
    }
    if (["email.delivered", "email.bounced", "email.failed"].includes(event.type)) {
      await recordDeliveryEvent(event, id);
      return Response.json({ ok: true });
    }
    return Response.json({ ok: true, ignored: true });
  } catch { return new Response("Webhook processing unavailable", { status: 503 }); }
}
