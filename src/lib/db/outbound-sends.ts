import { createHash } from "node:crypto";
import { z } from "zod";
import { getDatabaseClient, type DatabaseClient } from "./client";
import { quoteRequestContentHash } from "./repository";
import { createEmailService, EmailServiceError, readEmailConfiguration, type EmailConfiguration, type EmailService, type SendErrorKind } from "../email/email-service";
import { createEmailTransport } from "../email/email-transport";

const idSchema = z.string().trim().min(1).max(100);
export type SendOutcome = { providerId: string; practiceName: string; status: "SENT" | "SIMULATED" | "SENDING" | "NOT_APPROVED" | SendErrorKind; message: string; providerMessageId?: string };

export function replyIdentifier(caseId: string, providerId: string, requestId: string) {
  return createHash("sha256").update(`${caseId}:${providerId}:${requestId}`).digest("hex").slice(0, 28);
}

export function replyAddress(inboundAddress: string, identifier: string) {
  const [local, domain] = inboundAddress.split("@");
  return `${local.slice(0, 20)}+mf-${identifier}@${domain}`;
}

function statusMessage(status: string) {
  switch (status) {
    case "SIMULATED": return "Simulated locally; no external email delivery occurred.";
    case "SENT": return "Accepted by Resend. Delivery is not yet confirmed.";
    case "SENDING": return "A send is already in progress or needs reconciliation. No duplicate was submitted.";
    case "AUTH_ERROR": return "Resend authentication failed. Check the API key and permissions.";
    case "DOMAIN_ERROR": return "Sending domain verification is required in Resend.";
    case "RATE_LIMITED": return "Resend rate limit reached. No automatic retry was made.";
    case "RECIPIENT_BLOCKED": return "Recipient is not explicitly allowed for demo sending.";
    case "UNCERTAIN": return "Outcome is uncertain. Check the Resend dashboard before any further action.";
    default: return "Sending failed. Review Resend details before trying a new request.";
  }
}

function outcome(providerId: string, practiceName: string, status: SendOutcome["status"], providerMessageId?: string): SendOutcome {
  return { providerId, practiceName, status, message: statusMessage(status), ...(providerMessageId ? { providerMessageId } : {}) };
}

async function claimApprovedRequest(caseId: string, providerId: string, configuration: EmailConfiguration, client: DatabaseClient, simulated = false) {
  return client.$transaction(async (tx) => {
    const selection = await tx.caseProviderSelection.findUniqueOrThrow({ where: { caseId_providerId: { caseId, providerId } }, include: { case: { include: { patientProfile: true } }, provider: true } });
    const { case: record, provider } = selection;
    const request = await tx.quoteRequest.findFirst({ where: { caseId, providerId }, orderBy: { requestVersion: "desc" } });
    if (!record.isFictional || !record.patientProfile.isFictional || !record.patientProfile.consentGivenAt || record.patientProfile.consentWithdrawnAt || record.status === "CLOSED") throw new EmailServiceError("FAILED", "This case has no current consent for outbound test email.");
    if (!request || request.status !== "APPROVED" || !request.approvedAt || request.approvedById !== record.patientProfileId || !request.approvedContentHash || !request.isSimulation) return null;
    if (provider.email !== request.recipientEmail || !z.email().safeParse(request.recipientEmail).success || quoteRequestContentHash(request.recipientEmail, request.subject, request.body) !== request.approvedContentHash) throw new EmailServiceError("FAILED", "The approved content or practice address changed. Review a new draft.");
    if (!simulated) {
      if (provider.sourceType === "DEMO" || request.recipientEmail.toLowerCase().endsWith(".example")) throw new EmailServiceError("RECIPIENT_BLOCKED", "Fictional fixture addresses cannot receive live email.");
      if (provider.sourceType !== "VERIFIED_EXTERNAL" || provider.ownerCaseId !== caseId || provider.verificationStatus !== "USER_VERIFIED" || !provider.verifiedByUserAt) throw new EmailServiceError("FAILED", "The practice contact must be user verified for this case.");
      if (!configuration.allowedRecipients.has(request.recipientEmail.toLowerCase())) throw new EmailServiceError("RECIPIENT_BLOCKED", "Recipient is not in DEMO_ALLOWED_RECIPIENTS.");
    }
    const patientName = record.patientProfile.displayName.trim();
    if (/[\r\n]/.test(request.subject) || (patientName && request.subject.toLowerCase().includes(patientName.toLowerCase())) || (record.patientProfile.email && request.subject.toLowerCase().includes(record.patientProfile.email.toLowerCase()))) throw new EmailServiceError("FAILED", "Remove patient-identifying details and line breaks from the subject before sending.");
    const existing = await tx.outboundSend.findUnique({ where: { quoteRequestId: request.id } });
    if (existing) return { request, provider, attempt: existing, claimed: false, patientProfileId: record.patientProfileId };
    const prior = await tx.outboundSend.findFirst({ where: { caseId, providerId, status: { in: ["SENDING", "UNCERTAIN"] } } });
    if (prior) throw new EmailServiceError("FAILED", "A prior send for this practice exists or needs reconciliation. No second request was submitted.");
    if (/no live email/i.test(record.patientProfile.consentScope ?? "")) {
      const consentScope = `${record.patientProfile.consentScope}; Patient later explicitly confirmed live demo email sending, subject to separate approval and send confirmation.`;
      await tx.patientProfile.update({ where: { id: record.patientProfileId }, data: { consentScope } });
      await tx.auditEvent.create({ data: { caseId, patientProfileId: record.patientProfileId, quoteRequestId: request.id, action: "CONSENT_GRANTED", actor: "PATIENT", detailsJson: JSON.stringify({ scope: consentScope, explicitSendConfirmation: true }) } });
    }
    const identifier = replyIdentifier(caseId, providerId, request.id);
    const attempt = await tx.outboundSend.create({ data: {
      quoteRequestId: request.id, caseId, providerId,
      idempotencyKey: `quote-request/${request.id}`, replyIdentifier: identifier,
      fromEmail: configuration.fromEmail, replyToEmail: replyAddress(configuration.inboundAddress, identifier),
      recipientEmail: request.recipientEmail, subject: request.subject, body: request.body,
      approvedContentHash: request.approvedContentHash, status: "SENDING",
    } });
    await tx.auditEvent.create({ data: { caseId, patientProfileId: record.patientProfileId, quoteRequestId: request.id, action: "SEND_CLAIMED", actor: "PATIENT", detailsJson: JSON.stringify({ outboundSendId: attempt.id, idempotencyKey: attempt.idempotencyKey }) } });
    return { request, provider, attempt, claimed: true, patientProfileId: record.patientProfileId };
  });
}

async function markSendFailure(attemptId: string, error: EmailServiceError, client: DatabaseClient) {
  const status = error.kind === "CONFIG_REQUIRED" || error.kind === "RECIPIENT_BLOCKED" ? "FAILED" : error.kind;
  await client.$transaction(async (tx) => {
    const attempt = await tx.outboundSend.update({ where: { id: attemptId, status: "SENDING" }, data: { status, errorCode: error.kind, errorSummary: error.message } });
    await tx.auditEvent.create({ data: { caseId: attempt.caseId, quoteRequestId: attempt.quoteRequestId, action: "SEND_FAILED", actor: "SYSTEM", detailsJson: JSON.stringify({ outboundSendId: attempt.id, category: error.kind }) } });
  });
}

async function markAccepted(attemptId: string, providerMessageId: string, simulated: boolean, client: DatabaseClient) {
  return client.$transaction(async (tx) => {
    const attempt = await tx.outboundSend.findUniqueOrThrow({ where: { id: attemptId } });
    if (attempt.status !== "SENDING") throw new Error("Send state changed before acceptance was recorded.");
    const sentAt = new Date();
    await tx.outboundSend.update({ where: { id: attemptId }, data: { status: simulated ? "SIMULATED" : "SENT", providerMessageId, sentAt } });
    await tx.quoteRequest.update({ where: { id: attempt.quoteRequestId, status: "APPROVED" }, data: { status: simulated ? "SIMULATED" : "SENT", sentAt } });
    const message = await tx.emailMessage.create({ data: {
      caseId: attempt.caseId, providerId: attempt.providerId, quoteRequestId: attempt.quoteRequestId,
      direction: "OUTBOUND", fromAddress: attempt.fromEmail, recipientAddress: attempt.recipientEmail, subject: attempt.subject, body: attempt.body,
      externalMessageId: providerMessageId, threadId: attempt.replyIdentifier,
      deliveryStatus: simulated ? "SIMULATED" : "SENT", sentAt, isSimulation: simulated,
    } });
    await tx.auditEvent.create({ data: { caseId: attempt.caseId, quoteRequestId: attempt.quoteRequestId, emailMessageId: message.id, action: simulated ? "MESSAGE_SIMULATED" : "MESSAGE_SENT", actor: "SYSTEM", detailsJson: JSON.stringify({ providerMessageId, outboundSendId: attempt.id, simulated }) } });
    return message;
  });
}

export async function sendApprovedRequests(caseIdInput: string, confirmed: boolean, options: { client?: DatabaseClient; service?: EmailService; configuration?: EmailConfiguration } = {}): Promise<SendOutcome[]> {
  const caseId = idSchema.parse(caseIdInput);
  if (!confirmed) throw new Error("An explicit send confirmation is required.");
  if (process.env.DEMO_MODE === "false") throw new Error("Production sending requires authentication and privacy controls that are not enabled in this demo.");
  const client = options.client ?? getDatabaseClient();
  const selections = await client.caseProviderSelection.findMany({ where: { caseId }, include: { provider: true }, orderBy: { selectedAt: "asc" } });
  if (selections.length === 0) return [];
  const latest = await client.quoteRequest.findMany({ where: { caseId, providerId: { in: selections.map((item) => item.providerId) } }, orderBy: { requestVersion: "desc" } });
  const transportMode = (process.env.EMAIL_TRANSPORT?.trim().toLowerCase() || "mock");
  if (!["mock", "resend"].includes(transportMode)) throw new EmailServiceError("CONFIG_REQUIRED", "Unsupported EMAIL_TRANSPORT. No email was sent.");
  const simulatedByDefault = transportMode === "mock" && !options.service;
  const mockConfiguration: EmailConfiguration = { apiKey: "mock", fromEmail: "medifair-demo@mock.invalid", inboundAddress: "replies@mock.invalid", webhookSecret: "", appBaseUrl: "http://localhost:3000", allowedRecipients: new Set() };
  const { configuration, missing } = options.configuration ? { configuration: options.configuration, missing: [] } : simulatedByDefault ? { configuration: mockConfiguration, missing: [] } : readEmailConfiguration();
  if (!configuration) return selections.map(({ provider }) => latest.find((request) => request.providerId === provider.id)?.status === "APPROVED"
    ? { providerId: provider.id, practiceName: provider.practiceName, status: "CONFIG_REQUIRED" as const, message: `Configuration required: ${missing.join(", ")}. No email was sent.` }
    : { providerId: provider.id, practiceName: provider.practiceName, status: "NOT_APPROVED" as const, message: "Approve this exact draft before sending." });
  const service = options.service ?? (simulatedByDefault ? null : createEmailService(configuration));
  const transport = simulatedByDefault ? createEmailTransport(client) : null;
  const approved = selections.filter(({ provider }) => latest.find((request) => request.providerId === provider.id)?.status === "APPROVED");
  let domainError: EmailServiceError | null = null;
  if (approved.length && service) try { await service.verifySendingDomain(configuration.fromEmail); } catch (error) { domainError = error instanceof EmailServiceError ? error : new EmailServiceError("CONFIG_REQUIRED", "Could not confirm the sending domain in Resend. No email was sent."); }
  const results: SendOutcome[] = [];
  for (const { provider } of selections) {
    const current = latest.find((request) => request.providerId === provider.id);
    if (current?.status === "SENT" || current?.status === "SIMULATED") { results.push(outcome(provider.id, provider.practiceName, current.status)); continue; }
    if (current?.status !== "APPROVED") { results.push({ providerId: provider.id, practiceName: provider.practiceName, status: "NOT_APPROVED", message: "Approve this exact draft before sending." }); continue; }
    if (domainError) { results.push(outcome(provider.id, provider.practiceName, domainError.kind)); continue; }
    try {
      const claim = await claimApprovedRequest(caseId, provider.id, configuration, client, simulatedByDefault);
      if (!claim) { results.push({ providerId: provider.id, practiceName: provider.practiceName, status: "NOT_APPROVED", message: "The approval changed. Review the draft again." }); continue; }
      if (!claim.claimed) {
        results.push(outcome(provider.id, provider.practiceName, claim.attempt.status === "SENT" || claim.attempt.status === "SIMULATED" ? claim.attempt.status : claim.attempt.status as SendOutcome["status"], claim.attempt.providerMessageId ?? undefined));
        continue;
      }
      try {
        const message = {
          fromEmail: claim.attempt.fromEmail, toEmail: claim.attempt.recipientEmail,
          replyToEmail: claim.attempt.replyToEmail, subject: claim.attempt.subject,
          body: claim.attempt.body, idempotencyKey: claim.attempt.idempotencyKey,
          approval: { quoteRequestId: claim.request.id, caseId, providerId: provider.id, patientProfileId: claim.patientProfileId, approvedContentHash: claim.attempt.approvedContentHash },
        };
        const sent = service ? { ...(await service.send(message)), simulated: false } : await transport!.sendEmail(message);
        try {
          await markAccepted(claim.attempt.id, sent.providerMessageId, sent.simulated, client);
          results.push(outcome(provider.id, provider.practiceName, sent.simulated ? "SIMULATED" : "SENT", sent.providerMessageId));
        } catch {
          results.push(outcome(provider.id, provider.practiceName, "UNCERTAIN", sent.providerMessageId));
        }
      } catch (error) {
        const serviceError = error instanceof EmailServiceError ? error : new EmailServiceError("UNCERTAIN", "The provider outcome is unknown.");
        try { await markSendFailure(claim.attempt.id, serviceError, client); } catch { /* SENDING remains a safe duplicate block. */ }
        results.push(outcome(provider.id, provider.practiceName, serviceError.kind));
      }
    } catch (error) {
      const kind = error instanceof EmailServiceError ? error.kind : "UNCERTAIN";
      results.push(outcome(provider.id, provider.practiceName, kind));
    }
  }
  return results;
}
