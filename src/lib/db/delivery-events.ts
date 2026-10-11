import { z } from "zod";
import { getDatabaseClient, type DatabaseClient } from "./client";

const deliveryEventSchema = z.strictObject({
  type: z.enum(["email.delivered", "email.bounced", "email.failed"]),
  created_at: z.iso.datetime(),
  data: z.object({ email_id: z.string().min(1) }).passthrough(),
});

export async function recordDeliveryEvent(raw: unknown, providerEventId: string, client: DatabaseClient = getDatabaseClient()) {
  const event = deliveryEventSchema.parse(raw);
  const eventId = z.string().trim().min(1).max(200).parse(providerEventId);
  const kind = event.type === "email.delivered" ? "DELIVERED" : event.type === "email.bounced" ? "BOUNCED" : "FAILED";
  const message = await client.emailMessage.findUnique({ where: { externalMessageId: event.data.email_id } });
  if (!message || message.direction !== "OUTBOUND") return { recorded: false, reason: "unknown-message" };
  if (await client.emailEvent.findUnique({ where: { providerEventId: eventId } })) return { recorded: false, reason: "duplicate" };
  await client.$transaction(async (tx) => {
    await tx.emailEvent.create({ data: { emailMessageId: message.id, providerEventId: eventId, type: kind, occurredAt: new Date(event.created_at) } });
    if (["BOUNCED", "FAILED"].includes(message.deliveryStatus) && kind === "DELIVERED") return;
    await tx.emailMessage.update({ where: { id: message.id }, data: { deliveryStatus: kind } });
    if (kind !== "DELIVERED" && message.quoteRequestId) {
      await tx.quoteRequest.update({ where: { id: message.quoteRequestId }, data: { status: "FAILED" } });
      await tx.outboundSend.updateMany({ where: { quoteRequestId: message.quoteRequestId }, data: { status: "FAILED", errorCode: `DELIVERY_${kind}`, errorSummary: kind === "BOUNCED" ? "Resend reported a delivery bounce." : "Resend reported a delivery failure." } });
      if (message.caseId) await tx.auditEvent.create({ data: { caseId: message.caseId, quoteRequestId: message.quoteRequestId, emailMessageId: message.id, action: "SEND_FAILED", actor: "SYSTEM", eventKey: `delivery:${eventId}`, detailsJson: JSON.stringify({ type: event.type }) } });
    }
  });
  return { recorded: true, status: kind };
}
