import { randomUUID } from "node:crypto";
import { Resend } from "resend";
import type { DatabaseClient } from "../db/client";
import { getDatabaseClient } from "../db/client";
import { EmailServiceError, ResendEmailService, type OutboundEmail } from "./email-service";
import { quoteRequestContentHash } from "../db/repository";

export type ReceivedEmail = {
  providerMessageId: string;
  from: string;
  to: string[];
  subject: string;
  text: string | null;
  html: string | null;
  receivedAt: Date;
  headers: Record<string, string> | null;
  attachments: Array<{ id: string; filename: string | null; size: number; content_type: string; content_id: string | null; content_disposition: string | null }>;
  receivedFor: string[];
};

export interface OutboundEmailTransport {
  sendEmail(message: OutboundEmail): Promise<{ providerMessageId: string; simulated: boolean }>;
  getDeliveryStatus(providerMessageId: string): Promise<string | null>;
}

export interface InboundEmailTransport {
  getMessage(providerMessageId: string): Promise<ReceivedEmail>;
  getThreadMessages(threadId: string): Promise<unknown[]>;
}

export interface EmailTransport extends OutboundEmailTransport, InboundEmailTransport {}

export class MockEmailTransport implements EmailTransport {
  constructor(private readonly client: DatabaseClient = getDatabaseClient()) {}

  async sendEmail(message: OutboundEmail) {
    const approval = message.approval;
    if (!approval) throw new EmailServiceError("FAILED", "The mock transport requires recorded approval for this exact request.");
    if ("negotiationRequestId" in approval) {
      const request = await this.client.negotiationRequest.findUnique({ where: { id: approval.negotiationRequestId }, include: { case: { include: { patientProfile: true } } } });
      if (!request || request.status !== "SENDING" || !request.approvedAt || request.approvedById !== approval.patientProfileId || request.caseId !== approval.caseId || request.providerId !== approval.providerId || request.case.patientProfileId !== approval.patientProfileId || !request.case.isFictional || !request.case.patientProfile.isFictional || !request.case.patientProfile.consentGivenAt || request.case.patientProfile.consentWithdrawnAt || request.recipientEmail !== message.toEmail || request.subject !== message.subject || request.approvedBody !== message.body || request.approvedContentHash !== approval.approvedContentHash || quoteRequestContentHash(message.toEmail, message.subject, message.body) !== approval.approvedContentHash) {
        throw new EmailServiceError("FAILED", "The mock transport rejected an unapproved or changed negotiation message.");
      }
      return { providerMessageId: `sim_${randomUUID()}`, simulated: true };
    }
    const request = await this.client.quoteRequest.findUnique({ where: { id: approval.quoteRequestId }, include: { case: { include: { patientProfile: true } } } });
    if (!request || request.status !== "APPROVED" || !request.approvedAt || request.approvedById !== approval.patientProfileId || request.caseId !== approval.caseId || request.providerId !== approval.providerId || request.case.patientProfileId !== approval.patientProfileId || !request.case.isFictional || !request.case.patientProfile.isFictional || !request.case.patientProfile.consentGivenAt || request.case.patientProfile.consentWithdrawnAt || !request.isSimulation || request.recipientEmail !== message.toEmail || request.subject !== message.subject || request.body !== message.body || request.approvedContentHash !== approval.approvedContentHash || quoteRequestContentHash(message.toEmail, message.subject, message.body) !== approval.approvedContentHash) {
      throw new EmailServiceError("FAILED", "The mock transport rejected an unapproved or changed email message.");
    }
    return { providerMessageId: `sim_${randomUUID()}`, simulated: true };
  }

  async getDeliveryStatus(providerMessageId: string) {
    const message = await this.client.emailMessage.findUnique({ where: { externalMessageId: providerMessageId } });
    if (message?.isSimulation) return "SIMULATED";
    return message?.deliveryStatus ?? null;
  }

  async getMessage(providerMessageId: string): Promise<ReceivedEmail> {
    const message = await this.client.emailMessage.findUnique({ where: { externalMessageId: providerMessageId } });
    if (!message || !message.isSimulation || message.direction !== "INBOUND") throw new EmailServiceError("FAILED", "Synthetic message was not found.");
    const rawAttachments = message.attachmentMetadataJson ? JSON.parse(message.attachmentMetadataJson) as Array<Record<string, unknown>> : [];
    const attachments = rawAttachments.map((item) => ({
      id: String(item.id ?? "attachment"), filename: typeof item.filename === "string" ? item.filename : null,
      size: typeof item.size === "number" ? item.size : 0, content_type: String(item.content_type ?? item.contentType ?? "application/octet-stream"),
      content_id: typeof item.content_id === "string" ? item.content_id : typeof item.contentId === "string" ? item.contentId : null,
      content_disposition: typeof item.content_disposition === "string" ? item.content_disposition : typeof item.disposition === "string" ? item.disposition : null,
    }));
    return { providerMessageId, from: message.fromAddress ?? "", to: (message.recipientAddress ?? "").split(",").map((value) => value.trim()).filter(Boolean), subject: message.subject, text: message.body, html: null, receivedAt: message.receivedAt ?? message.createdAt, headers: null, attachments, receivedFor: [] };
  }

  async getThreadMessages(threadId: string) {
    return this.client.emailMessage.findMany({ where: { threadId, isSimulation: true }, include: { provider: true }, orderBy: { createdAt: "asc" } });
  }
}

type ReceivingClient = Pick<Resend["emails"], "receiving">;

export class ResendEmailTransport implements EmailTransport {
  private readonly outbound: ResendEmailService;
  private readonly resend: Resend;

  constructor(apiKey: string, private readonly client: DatabaseClient = getDatabaseClient(), injectedResend?: Resend) {
    if (!apiKey.trim()) throw new EmailServiceError("CONFIG_REQUIRED", "RESEND_API_KEY is required for Resend transport.");
    this.resend = injectedResend ?? new Resend(apiKey);
    this.outbound = new ResendEmailService(apiKey, this.resend);
  }

  async sendEmail(message: OutboundEmail) {
    const result = await this.outbound.send(message);
    return { ...result, simulated: false };
  }

  async getDeliveryStatus(providerMessageId: string) {
    const message = await this.client.emailMessage.findUnique({ where: { externalMessageId: providerMessageId } });
    return message?.deliveryStatus ?? null;
  }

  async getMessage(providerMessageId: string): Promise<ReceivedEmail> {
    const receiving: ReceivingClient = this.resend.emails;
    const { data, error } = await receiving.receiving.get(providerMessageId, { html_format: "cid" });
    if (error || !data) throw new EmailServiceError("FAILED", "Could not retrieve the received email from Resend. Check configuration and retry.");
    return {
      providerMessageId: data.id, from: data.from, to: data.to, subject: data.subject,
      text: data.text, html: data.html, receivedAt: new Date(data.created_at), headers: data.headers,
      attachments: data.attachments.map((attachment) => ({ ...attachment })),
      receivedFor: data.received_for ?? [],
    };
  }

  async getThreadMessages(threadId: string) {
    return this.client.emailMessage.findMany({ where: { threadId, isSimulation: false }, include: { provider: true }, orderBy: { createdAt: "asc" } });
  }
}

export function createEmailTransport(client?: DatabaseClient): EmailTransport {
  const mode = process.env.EMAIL_TRANSPORT?.trim().toLowerCase() || "mock";
  if (mode === "mock") return new MockEmailTransport(client);
  if (mode === "resend") {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) throw new EmailServiceError("CONFIG_REQUIRED", "RESEND_API_KEY is required for EMAIL_TRANSPORT=resend. Mock mode is not used as a fallback.");
    return new ResendEmailTransport(apiKey, client);
  }
  throw new EmailServiceError("CONFIG_REQUIRED", `Unsupported EMAIL_TRANSPORT: ${mode}.`);
}
