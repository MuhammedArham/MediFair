import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getDatabaseClient, type DatabaseClient } from "./client";
import { EmailServiceError } from "../email/email-service";
import type { EmailTransport, ReceivedEmail } from "../email/email-transport";
import { processQuoteExtraction } from "./quote-extraction";
import { processNegotiationReply } from "../negotiation/processing";

const receivedEmailSchema = z.object({
  providerMessageId: z.string().trim().min(1).max(300), from: z.string().trim().min(1).max(320),
  to: z.array(z.string().trim().min(1).max(320)).max(30), subject: z.string().max(998),
  text: z.string().max(200_000).nullable(), html: z.string().max(1_000_000).nullable(),
  receivedAt: z.date(), headers: z.record(z.string(), z.string()).nullable(),
  attachments: z.array(z.object({ id: z.string().min(1).max(300), filename: z.string().nullable(), size: z.number().int().nonnegative(), content_type: z.string().max(200), content_id: z.string().nullable(), content_disposition: z.string().nullable() })).max(50),
  receivedFor: z.array(z.string().max(320)).max(30),
});

export const receivedWebhookSchema = z.object({
  type: z.literal("email.received"),
  created_at: z.iso.datetime().optional(),
  data: z.object({ email_id: z.string().trim().min(1).max(300) }).passthrough(),
});

const simulatorInputSchema = z.strictObject({
  caseId: z.string().trim().min(1).max(100), providerId: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(200_000), templateId: z.string().trim().min(1).max(80),
});

export type QuoteResponseStatus = "COMPLETE_QUOTE" | "INCOMPLETE_QUOTE" | "CONSULTATION_REQUIRED" | "NO_GAP_STATED" | "DISCOUNT_REFUSED" | "REDUCED_QUOTE" | "MORE_INFORMATION_REQUIRED" | "AMBIGUOUS";

export function classifyQuoteResponse(body: string): QuoteResponseStatus {
  const text = body.toLowerCase();
  if (/require an initial consultation|consultation and referral before|consultation required before|before we can (provide|quote)/.test(text)) return "CONSULTATION_REQUIRED";
  if (/no[- ]gap/.test(text)) return "NO_GAP_STATED";
  if (/unable to reduce|unable to offer.*discount|refus(e|ing).*discount|fee estimate remains unchanged/.test(text)) return "DISCOUNT_REFUSED";
  if (/revised.*fee|reduced.*quote|offer a reduced|reduce the .*fee/.test(text)) return "REDUCED_QUOTE";
  if (/please provide|please confirm|additional information|more information/.test(text)) return "MORE_INFORMATION_REQUIRED";
  if (/anaesthetist[^.;]{0,60}(not included|confirm|missing)|not included[^.;]{0,60}anaesthetist|without[^.;]{0,60}anaesthetist|missing[^.;]{0,60}anaesthetist|facility fees?[^.;]{0,60}(not|confirm)|incomplete/.test(text)) return "INCOMPLETE_QUOTE";
  if (/quote|estimate/.test(text) && /surgeon/.test(text) && /anaesthetist/.test(text) && /hospital|facility/.test(text)) return "COMPLETE_QUOTE";
  return "AMBIGUOUS";
}

export function safeEmailText(email: Pick<ReceivedEmail, "text" | "html">) {
  if (email.text?.trim()) return email.text.replace(/\u0000/g, "").slice(0, 200_000);
  return (email.html ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/\u0000/g, "").trim().slice(0, 200_000);
}

function emailAddress(value: string) {
  return value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ?? "";
}

function headerValue(headers: Record<string, string> | null, wanted: string) {
  if (!headers) return "";
  return Object.entries(headers).find(([key]) => key.toLowerCase() === wanted)?.[1] ?? "";
}

function replyIdentifier(address: string) {
  return address.toLowerCase().match(/\+mf-([a-f0-9]{28})(?:@|$)/)?.[1] ?? null;
}

function cleanFileName(filename: string | null, id: string) {
  const safe = (filename ?? `attachment-${id}`).replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 160).trim();
  return safe || `attachment-${id}`;
}

export type InboundResult = { status: "MATCHED" | "UNMATCHED" | "PROVIDER_MISMATCH" | "DUPLICATE"; emailMessageId?: string; caseId?: string; providerId?: string; responseStatus?: QuoteResponseStatus; extractionStatus?: string };

type ReplyThreadContext = {
  caseId: string; providerId: string; quoteRequestId: string | null; negotiationId: string | null; replyIdentifier: string; expectedSender: string;
  case: { isFictional: boolean; patientProfile: { isFictional: boolean; consentGivenAt: Date | null; consentWithdrawnAt: Date | null } };
  provider: { email: string | null; isFictional: boolean };
};

function threadContext(send: { caseId: string; providerId: string; quoteRequestId: string; replyIdentifier: string; case: ReplyThreadContext["case"]; provider: ReplyThreadContext["provider"] }): ReplyThreadContext {
  return { caseId: send.caseId, providerId: send.providerId, quoteRequestId: send.quoteRequestId, negotiationId: null, replyIdentifier: send.replyIdentifier, expectedSender: send.provider.email ?? "", case: send.case, provider: send.provider };
}

export async function ingestInboundEmail(input: unknown, options: { eventId: string; simulated?: boolean; client?: DatabaseClient } ): Promise<InboundResult> {
  const email = receivedEmailSchema.parse(input);
  const eventId = z.string().trim().min(1).max(300).parse(options.eventId);
  const client = options.client ?? getDatabaseClient();
  if (options.simulated && (process.env.EMAIL_TRANSPORT?.trim().toLowerCase() || "mock") !== "mock") throw new EmailServiceError("FAILED", "Synthetic replies are disabled outside mock email mode.");
  const existing = await client.emailMessage.findUnique({ where: { externalMessageId: email.providerMessageId } });
  if (existing) return { status: "DUPLICATE", emailMessageId: existing.id, caseId: existing.caseId ?? undefined, providerId: existing.providerId ?? undefined };

  const addresses = [...email.to, ...email.receivedFor];
  const token = addresses.map(replyIdentifier).find(Boolean) ?? null;
  const references = `${headerValue(email.headers, "in-reply-to")} ${headerValue(email.headers, "references")}`;
  const referenceIds = references.match(/<[^>]+>|[A-Za-z0-9_-]{12,}/g) ?? [];
  let outbound: ReplyThreadContext | null = null;
  if (token) {
    const found = await client.outboundSend.findUnique({ where: { replyIdentifier: token }, include: { case: { include: { patientProfile: true } }, provider: true, quoteRequest: true } });
    if (found) outbound = threadContext(found);
    if (!outbound) {
      const request = await client.negotiationRequest.findUnique({ where: { replyIdentifier: token }, include: { case: { include: { patientProfile: true } }, provider: true } });
      if (request && ["SIMULATED", "SENT"].includes(request.status)) outbound = { caseId: request.caseId, providerId: request.providerId, quoteRequestId: null, negotiationId: request.negotiationId, replyIdentifier: token, expectedSender: request.recipientEmail, case: request.case, provider: request.provider };
    }
  }
  if (!outbound && referenceIds.length) {
    const candidates = await client.outboundSend.findMany({ where: { providerMessageId: { in: referenceIds } }, include: { case: { include: { patientProfile: true } }, provider: true, quoteRequest: true } });
    if (candidates[0]) outbound = threadContext(candidates[0]);
    if (!outbound) {
      const request = await client.negotiationRequest.findFirst({ where: { providerMessageId: { in: referenceIds }, status: { in: ["SIMULATED", "SENT"] } }, include: { case: { include: { patientProfile: true } }, provider: true } });
      if (request?.replyIdentifier) outbound = { caseId: request.caseId, providerId: request.providerId, quoteRequestId: null, negotiationId: request.negotiationId, replyIdentifier: request.replyIdentifier, expectedSender: request.recipientEmail, case: request.case, provider: request.provider };
    }
  }
  let threadId = outbound?.replyIdentifier ?? null;
  if (!outbound) {
    const threadHeader = headerValue(email.headers, "x-medifair-thread-id").trim();
    if (threadHeader) {
      const prior = await client.emailMessage.findFirst({ where: { threadId: threadHeader, direction: "OUTBOUND" }, include: { case: { include: { patientProfile: true } }, provider: true, quoteRequest: true } });
      if (prior?.provider && prior.case && (prior.quoteRequest || prior.negotiationId)) {
        outbound = { caseId: prior.caseId!, providerId: prior.providerId!, quoteRequestId: prior.quoteRequestId, negotiationId: prior.negotiationId, replyIdentifier: threadHeader, expectedSender: prior.recipientAddress ?? prior.provider.email ?? "", case: prior.case, provider: prior.provider };
        threadId = threadHeader;
      }
    }
  }

  const sender = emailAddress(email.from);
  const expectedSender = outbound?.expectedSender.toLowerCase() ?? "";
  const matched = Boolean(outbound && outbound.case.isFictional && outbound.case.patientProfile.isFictional && outbound.provider.isFictional === options.simulated && (options.simulated || outbound.case.patientProfile.consentGivenAt && !outbound.case.patientProfile.consentWithdrawnAt));
  const senderMatches = matched && Boolean(sender && expectedSender && sender === expectedSender);
  const body = safeEmailText(email);
  const subject = email.subject.trim() || "(no subject)";
  const attachmentMetadata = email.attachments.map((item) => ({ id: item.id, filename: cleanFileName(item.filename, item.id), size: item.size, contentType: item.content_type, contentId: item.content_id, disposition: item.content_disposition }));
  const attachmentMetadataJson = JSON.stringify(attachmentMetadata);
  const receivedAt = email.receivedAt;

  if (!senderMatches) {
    const status = outbound ? "PROVIDER_MISMATCH" : "UNMATCHED";
    try {
      const stored = await client.emailMessage.create({ data: {
        caseId: null, providerId: null, quoteRequestId: null, direction: "INBOUND", subject, body,
        fromAddress: sender || email.from, recipientAddress: [...email.to, ...email.receivedFor].join(", "),
        externalMessageId: email.providerMessageId, threadId, deliveryStatus: "RECEIVED", receivedAt,
        isSimulation: Boolean(options.simulated), matchStatus: status, attachmentMetadataJson,
      } });
      return { status, emailMessageId: stored.id };
    } catch {
      const duplicate = await client.emailMessage.findUnique({ where: { externalMessageId: email.providerMessageId } });
      if (duplicate) return { status: "DUPLICATE", emailMessageId: duplicate.id };
      throw new Error("Could not store the unmatched inbound email.");
    }
  }

  const responseStatus = classifyQuoteResponse(body);
  try {
    const stored = await client.$transaction(async (tx) => {
      const message = await tx.emailMessage.create({ data: {
        caseId: outbound!.caseId, providerId: outbound!.providerId, quoteRequestId: outbound!.quoteRequestId, negotiationId: outbound!.negotiationId,
        direction: "INBOUND", fromAddress: sender || email.from, recipientAddress: [...email.to, ...email.receivedFor].join(", "), subject, body, externalMessageId: email.providerMessageId, threadId,
        deliveryStatus: "RECEIVED", receivedAt, isSimulation: Boolean(options.simulated), matchStatus: "MATCHED", attachmentMetadataJson,
      } });
      if (outbound!.quoteRequestId) await tx.quoteRequest.update({ where: { id: outbound!.quoteRequestId }, data: { status: "REPLIED", quoteResponseStatus: responseStatus } });
      await tx.emailEvent.create({ data: { emailMessageId: message.id, providerEventId: eventId, type: "RECEIVED", occurredAt: receivedAt } });
      if (!outbound!.negotiationId && ["COMPLETE_QUOTE", "INCOMPLETE_QUOTE", "REDUCED_QUOTE"].includes(responseStatus)) {
        const latestQuote = await tx.quote.findFirst({ where: { caseId: outbound!.caseId, providerId: outbound!.providerId }, orderBy: { revisionNumber: "desc" } });
        const caseRecord = await tx.case.findUniqueOrThrow({ where: { id: outbound!.caseId } });
        const quote = await tx.quote.create({ data: {
          caseId: outbound!.caseId, providerId: outbound!.providerId, sourceEmailId: message.id,
          revisionOfId: latestQuote?.id ?? null, revisionNumber: (latestQuote?.revisionNumber ?? 0) + 1,
          procedureName: caseRecord.procedureName, issueDate: receivedAt,
          completeness: responseStatus === "COMPLETE_QUOTE" ? "UNKNOWN" : "INCOMPLETE",
          confirmationStatus: "PROVIDER_STATED", isFictional: Boolean(options.simulated),
          notes: "Raw provider reply retained. No fee amounts or patient responsibility were automatically extracted; review the message and confirm each amount.",
        } });
        await tx.auditEvent.create({ data: { caseId: outbound!.caseId, quoteRequestId: outbound!.quoteRequestId, emailMessageId: message.id, action: latestQuote ? "QUOTE_REVISED" : "QUOTE_ADDED", actor: "SYSTEM", eventKey: `quote-from-email:${eventId}`, detailsJson: JSON.stringify({ quoteId: quote.id, completeness: quote.completeness, amountExtraction: "not performed" }) } });
      }
      if (attachmentMetadata.length) await tx.document.createMany({ data: attachmentMetadata.map((attachment) => ({
        caseId: outbound!.caseId, providerId: outbound!.providerId, emailMessageId: message.id, kind: "OTHER" as const,
        sourceType: options.simulated ? "DEMO" as const : "EMAIL" as const, fileName: attachment.filename, mimeType: attachment.contentType || "application/octet-stream",
        byteSize: attachment.size, storageKey: null, sha256: createHash("sha256").update(`${email.providerMessageId}:${attachment.id}`).digest("hex"), isFictional: Boolean(options.simulated),
      })) });
      await tx.auditEvent.create({ data: { caseId: outbound!.caseId, emailMessageId: message.id, quoteRequestId: outbound!.quoteRequestId, action: options.simulated ? "MESSAGE_SIMULATED" : "INBOUND_RECEIVED", actor: "PROVIDER", eventKey: `inbound:${eventId}`, detailsJson: JSON.stringify({ simulated: Boolean(options.simulated), responseStatus, attachmentCount: attachmentMetadata.length, untrustedContent: true }) } });
      return message;
    });
    const extraction = await processQuoteExtraction(stored.id, client);
    if (outbound!.negotiationId) await processNegotiationReply(stored.id, client);
    return { status: "MATCHED", emailMessageId: stored.id, caseId: outbound!.caseId, providerId: outbound!.providerId, responseStatus, extractionStatus: extraction.status };
  } catch {
    const duplicate = await client.emailMessage.findUnique({ where: { externalMessageId: email.providerMessageId } });
    if (duplicate) return { status: "DUPLICATE", emailMessageId: duplicate.id, caseId: duplicate.caseId ?? undefined, providerId: duplicate.providerId ?? undefined };
    throw new Error("Could not persist the inbound email and quote response.");
  }
}

export async function processResendReceivedWebhook(raw: unknown, eventId: string, transport: EmailTransport, client: DatabaseClient = getDatabaseClient()) {
  const event = receivedWebhookSchema.parse(raw);
  const fullEmail = await transport.getMessage(event.data.email_id);
  return ingestInboundEmail(fullEmail, { eventId, client, simulated: false });
}

export async function simulateProviderReply(raw: unknown, client: DatabaseClient = getDatabaseClient()): Promise<InboundResult> {
  if ((process.env.EMAIL_TRANSPORT?.trim().toLowerCase() || "mock") !== "mock") throw new Error("Email simulator only runs when EMAIL_TRANSPORT=mock.");
  const input = simulatorInputSchema.parse(raw);
  const marker = input.body.match(/\[\[MOCK_QUOTE_FIXTURE:baseline-(north|harbour)\]\]/)?.[1];
  if (marker && input.providerId !== `demo-provider-${marker}`) throw new Error("This fictional baseline quote belongs to a different practice.");
  const request = await client.quoteRequest.findFirst({ where: { caseId: input.caseId, providerId: input.providerId, messages: { some: { direction: "OUTBOUND" } } }, orderBy: { requestVersion: "desc" }, include: { provider: true, case: true } });
  if (!request || !request.provider.isFictional || !request.case.isFictional || !request.isSimulation) throw new Error("Choose a fictional practice with a synthetic outgoing quote request.");
  const outbound = await client.emailMessage.findFirst({ where: { caseId: input.caseId, providerId: input.providerId, quoteRequestId: request.id, direction: "OUTBOUND" }, orderBy: { createdAt: "desc" } });
  if (!outbound?.threadId) throw new Error("There is no outgoing message thread for this practice yet.");
  const now = new Date();
  const email: ReceivedEmail = {
    providerMessageId: `sim-reply-${createHash("sha256").update(`${input.caseId}:${input.providerId}:${input.templateId}:${now.toISOString()}:${Math.random()}`).digest("hex").slice(0, 30)}`,
    from: request.provider.email ?? "demo-provider@mock.invalid", to: ["replies+mf-simulator@mock.invalid"], receivedFor: [],
    subject: `Re: ${outbound.subject}`, text: `SIMULATED PROVIDER RESPONSE — ${input.body}`, html: null, receivedAt: now,
    headers: { "x-medifair-thread-id": outbound.threadId }, attachments: [],
  };
  return ingestInboundEmail(email, { eventId: `sim-event-${email.providerMessageId}`, simulated: true, client });
}

export function parseSimulateProviderReply(input: unknown) { return simulatorInputSchema.parse(input); }

export async function simulateNegotiationReply(raw: unknown, client: DatabaseClient = getDatabaseClient()) {
  if (process.env.DEMO_MODE === "false" || (process.env.EMAIL_TRANSPORT?.trim().toLowerCase() || "mock") !== "mock") throw new Error("Negotiation replies can only be simulated in local mock mode.");
  const input = z.strictObject({ negotiationId: z.string().min(1).max(100), templateId: z.string().min(1).max(80), body: z.string().trim().min(1).max(200_000) }).parse(raw);
  const negotiation = await client.negotiation.findUniqueOrThrow({ where: { id: input.negotiationId, isSimulation: true }, include: { provider: true, case: true, requests: { where: { status: "SIMULATED" }, orderBy: { version: "desc" }, take: 1 } } });
  const request = negotiation.requests[0];
  if (!negotiation.case.isFictional || !negotiation.provider.isFictional || !request || !request.replyIdentifier || negotiation.status === "CLOSED") throw new Error("A simulated, approved outgoing negotiation request is required before a reply.");
  if (input.templateId === "agrees-discount" && negotiation.providerId !== "demo-provider-north") throw new Error("The $900 synthetic revised quote belongs only to Demo Northside Ophthalmology.");
  const providerMessageId = `sim-neg-reply-${randomUUID()}`;
  return ingestInboundEmail({ providerMessageId, from: request.recipientEmail, to: [`replies+mf-${request.replyIdentifier}@mock.invalid`], receivedFor: [], subject: `Re: ${request.subject}`, text: `SIMULATED PROVIDER RESPONSE — ${input.body}`, html: null, receivedAt: new Date(), headers: { "x-medifair-thread-id": request.replyIdentifier }, attachments: [] }, { eventId: `sim-event-${providerMessageId}`, simulated: true, client });
}
