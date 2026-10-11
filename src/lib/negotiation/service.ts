import { createHash } from "node:crypto";
import { z } from "zod";
import type { DatabaseClient } from "../db/client";
import { getDatabaseClient } from "../db/client";
import { quoteRequestContentHash } from "../db/repository";
import { createEmailTransport } from "../email/email-transport";
import { createEmailService, EmailServiceError, readEmailConfiguration, type EmailService } from "../email/email-service";
import { generateReviewRequest, loadReviewInput } from "../opportunities/service";
import { draftNegotiationRequest, requestTypeSchema, type RequestType } from "./templates";

const id = z.string().trim().min(1).max(100);
const editSchema = z.strictObject({ subject: z.string().trim().min(8).max(180), body: z.string().trim().min(30).max(8000) });
const typeByCategory: Record<string, RequestType> = {
  GAP_COVER_ENQUIRY: "GAP_COVER", SPECIALIST_FEE_NEGOTIATION: "LOWER_SPECIALIST_FEE", FINANCIAL_HARDSHIP: "FINANCIAL_HARDSHIP",
  MISSING_ITEMISATION: "ITEMISED_PRICING", QUOTE_VS_INVOICE: "BILLING_DISCREPANCY", POSSIBLE_BILLING_ERROR: "POSSIBLE_BILLING_ERROR",
  INSURANCE_COVERAGE_REVIEW: "INSURER_BENEFITS_REVIEW",
};

export const negotiationStates = ["DRAFT", "AWAITING_APPROVAL", "SIMULATED_SENT", "SENT", "AWAITING_RESPONSE", "NEEDS_CLARIFICATION", "COUNTEROFFERED", "ACCEPTED", "REJECTED", "CLOSED"] as const;
type State = typeof negotiationStates[number];
const allowed: Record<State, State[]> = {
  DRAFT: ["AWAITING_APPROVAL", "CLOSED"], AWAITING_APPROVAL: ["DRAFT", "SIMULATED_SENT", "SENT", "CLOSED"],
  SIMULATED_SENT: ["AWAITING_RESPONSE", "NEEDS_CLARIFICATION", "COUNTEROFFERED", "ACCEPTED", "REJECTED", "CLOSED"],
  SENT: ["AWAITING_RESPONSE", "NEEDS_CLARIFICATION", "COUNTEROFFERED", "ACCEPTED", "REJECTED", "CLOSED"],
  AWAITING_RESPONSE: ["NEEDS_CLARIFICATION", "COUNTEROFFERED", "ACCEPTED", "REJECTED", "CLOSED"],
  NEEDS_CLARIFICATION: ["DRAFT", "AWAITING_APPROVAL", "CLOSED"], COUNTEROFFERED: ["DRAFT", "AWAITING_APPROVAL", "ACCEPTED", "REJECTED", "CLOSED"],
  ACCEPTED: ["CLOSED"], REJECTED: ["DRAFT", "AWAITING_APPROVAL", "NEEDS_CLARIFICATION", "COUNTEROFFERED", "ACCEPTED", "CLOSED"], CLOSED: [],
};
export function assertNegotiationTransition(from: State, to: State) {
  if (!allowed[from]?.includes(to)) throw new Error(`Invalid negotiation transition: ${from} → ${to}.`);
}
function assertMockDemo() {
  if (process.env.DEMO_MODE === "false") throw new Error("This demo workflow requires fictional case data and local access controls.");
}
function replyIdentifier(caseId: string, providerId: string, requestId: string) {
  return createHash("sha256").update(`negotiation:${caseId}:${providerId}:${requestId}`).digest("hex").slice(0, 28);
}
function replyAddress(inbound: string, identifier: string) {
  const [local, domain] = inbound.split("@");
  if (!local || !domain) throw new EmailServiceError("CONFIG_REQUIRED", "A valid inbound address is required.");
  return `${local}+mf-${identifier}@${domain}`;
}

export async function startOpportunityNegotiation(raw: { caseId: unknown; stableKey: unknown; requestType?: unknown; recipientEmail?: unknown; recipientVerified?: unknown; providerId?: unknown }, client: DatabaseClient = getDatabaseClient()) {
  assertMockDemo();
  const caseId = id.parse(raw.caseId);
  const stableKey = z.string().length(64).parse(raw.stableKey);
  const opportunity = await generateReviewRequest(caseId, stableKey, client);
  const type = raw.requestType ? requestTypeSchema.parse(raw.requestType) : typeByCategory[opportunity.category];
  if (!type) throw new Error("Choose a supported cost question.");
  const caseRecord = await client.case.findUniqueOrThrow({ where: { id: caseId, isFictional: true }, include: { patientProfile: true, insuranceProfile: true, preference: true } });
  if (!caseRecord.patientProfile.isFictional || !caseRecord.patientProfile.consentGivenAt || caseRecord.patientProfile.consentWithdrawnAt) throw new Error("A consenting fictional patient case is required.");
  const providerId = opportunity.providerId ?? id.parse(raw.providerId);
  const provider = await client.provider.findUniqueOrThrow({ where: { id: providerId } });
  const selected = await client.caseProviderSelection.findUnique({ where: { caseId_providerId: { caseId, providerId } } });
  const verifiedExternal = provider.sourceType === "VERIFIED_EXTERNAL" && provider.ownerCaseId === caseId && provider.verificationStatus === "USER_VERIFIED" && Boolean(provider.verifiedByUserAt);
  if (!selected || (!provider.isFictional && !verifiedExternal)) throw new Error("Select a fictional practice or a user-verified contact associated with this case.");
  const recipientEmail = type === "INSURER_BENEFITS_REVIEW" ? z.email().parse(raw.recipientEmail) : z.email().parse(provider.email);
  if (type === "INSURER_BENEFITS_REVIEW" && raw.recipientVerified !== true) throw new Error("Confirm that you supplied and checked the fictional insurer contact address.");
  if (type === "INSURER_BENEFITS_REVIEW" && (process.env.EMAIL_TRANSPORT?.trim().toLowerCase() || "mock") === "mock" && !recipientEmail.toLowerCase().endsWith(".example")) throw new Error("Mock insurer contact must be an explicitly supplied fictional .example address.");
  const quote = opportunity.quoteId ? await client.quote.findUnique({ where: { id: opportunity.quoteId, caseId, isFictional: true }, include: { extractions: { orderBy: { createdAt: "desc" }, take: 1 } } }) : await client.quote.findFirst({ where: { caseId, providerId, isFictional: true }, orderBy: { revisionNumber: "desc" }, include: { extractions: { orderBy: { createdAt: "desc" }, take: 1 } } });
  if (!quote || quote.providerId !== providerId) throw new Error("A provider quote is required to start this request.");
  const extraction = quote.extractions[0]?.reviewedResultJson ?? quote.extractions[0]?.resultJson;
  let originalGapCents: number | null = null;
  try { const value = extraction ? JSON.parse(extraction)?.insurance?.expectedPatientOutOfPocketCents : null; if (typeof value === "number" && Number.isInteger(value) && value >= 0) originalGapCents = value; } catch { /* Unknown remains null. */ }
  const preference = await client.caseReviewPreference.findUnique({ where: { caseId } });
  const evidence = JSON.parse(opportunity.evidenceJson) as Array<{ excerpt?: string }>;
  const missing = JSON.parse(opportunity.missingInformationJson) as string[];
  const draft = draftNegotiationRequest({ type, providerName: type === "INSURER_BENEFITS_REVIEW" ? caseRecord.insuranceProfile?.insurerName ?? "insurer" : provider.practiceName,
    procedureName: caseRecord.procedureName, mbsItemNumber: caseRecord.mbsItemNumber, insurerName: caseRecord.insuranceProfile?.insurerName ?? null,
    patientName: caseRecord.patientProfile.displayName, originalGapCents, evidence: evidence.map((item) => item.excerpt ?? "").filter(Boolean), missing,
    sourceUrl: opportunity.officialSourceUrl, preferredLocation: caseRecord.preference?.preferredLocation ?? null,
    hardshipDisclosed: Boolean(preference?.financialHardshipDisclosedAt), specialistFeeRequested: Boolean(preference?.specialistFeeRequestAt),
  });
  const supportingDocumentIds = opportunity.documentId ? [opportunity.documentId] : [];
  return client.$transaction(async (tx) => {
    const negotiation = await tx.negotiation.create({ data: { caseId, providerId, originalQuoteId: quote.id, originalRequest: draft.body, status: "AWAITING_APPROVAL", isSimulation: true, reviewOpportunityId: opportunity.id, requestType: type } });
    await tx.negotiationRequest.create({ data: { negotiationId: negotiation.id, caseId, providerId, version: 1, recipientEmail, recipientVerifiedAt: type === "INSURER_BENEFITS_REVIEW" ? new Date() : provider.verifiedByUserAt, subject: draft.subject, draftBody: draft.body, reason: draft.reason, originalPatientGapCents: originalGapCents, supportingDocumentsJson: JSON.stringify(supportingDocumentIds), informationDisclosedJson: JSON.stringify(draft.informationDisclosed) } });
    await tx.auditEvent.create({ data: { caseId, negotiationId: negotiation.id, patientProfileId: caseRecord.patientProfileId, action: "NEGOTIATION_UPDATED", actor: "PATIENT", detailsJson: JSON.stringify({ from: null, to: "AWAITING_APPROVAL", type, simulated: true, opportunityId: opportunity.id }) } });
    return negotiation;
  });
}

export async function editNegotiationDraft(negotiationId: string, raw: unknown, client: DatabaseClient = getDatabaseClient()) {
  assertMockDemo();
  const input = editSchema.parse(raw);
  const negotiation = await client.negotiation.findUniqueOrThrow({ where: { id: id.parse(negotiationId) }, include: { requests: { orderBy: { version: "desc" }, take: 1 }, case: { include: { patientProfile: true } } } });
  if (!negotiation.isSimulation || negotiation.status === "CLOSED" || !negotiation.case.patientProfile.consentGivenAt || negotiation.case.patientProfile.consentWithdrawnAt) throw new Error("This negotiation is not editable.");
  const latest = negotiation.requests[0];
  if (!latest) throw new Error("No request draft exists.");
  if (/\r|\n/.test(input.subject) || input.subject.toLowerCase().includes(negotiation.case.patientProfile.displayName.toLowerCase())) throw new Error("Keep patient details and line breaks out of the subject.");
  return client.$transaction(async (tx) => {
    const request = latest.status === "DRAFT" || latest.status === "APPROVED"
      ? await tx.negotiationRequest.update({ where: { id: latest.id }, data: { subject: input.subject, draftBody: input.body, approvedBody: null, approvedAt: null, approvedById: null, approvedContentHash: null, status: "DRAFT" } })
      : await tx.negotiationRequest.create({ data: { negotiationId, caseId: negotiation.caseId, providerId: negotiation.providerId, version: latest.version + 1, recipientEmail: latest.recipientEmail, recipientVerifiedAt: latest.recipientVerifiedAt, subject: input.subject, draftBody: input.body, reason: latest.reason, originalPatientGapCents: latest.originalPatientGapCents, supportingDocumentsJson: latest.supportingDocumentsJson, informationDisclosedJson: latest.informationDisclosedJson } });
    if (negotiation.status !== "DRAFT") {
      assertNegotiationTransition(negotiation.status as State, "DRAFT");
      await tx.negotiation.update({ where: { id: negotiationId }, data: { status: "DRAFT" } });
    }
    await tx.auditEvent.create({ data: { caseId: negotiation.caseId, negotiationId, patientProfileId: negotiation.case.patientProfileId, action: "REQUEST_EDITED", actor: "PATIENT", detailsJson: JSON.stringify({ requestId: request.id, version: request.version, from: negotiation.status, to: "DRAFT" }) } });
    return request;
  });
}

export async function decideNegotiationRequest(negotiationId: string, decision: "APPROVE" | "REJECT" | "REVIEW", client: DatabaseClient = getDatabaseClient()) {
  assertMockDemo();
  const negotiation = await client.negotiation.findUniqueOrThrow({ where: { id: id.parse(negotiationId) }, include: { requests: { orderBy: { version: "desc" }, take: 1 }, case: { include: { patientProfile: true } } } });
  const request = negotiation.requests[0];
  if (!request || !negotiation.isSimulation || !negotiation.case.patientProfile.consentGivenAt || negotiation.case.patientProfile.consentWithdrawnAt) throw new Error("No approvable fictional request exists.");
  if (!["DRAFT", "AWAITING_APPROVAL"].includes(negotiation.status) || request.status !== "DRAFT") throw new Error("This request cannot be approved or rejected in its current state.");
  if (decision === "REVIEW") {
    if (negotiation.status === "DRAFT") assertNegotiationTransition("DRAFT", "AWAITING_APPROVAL");
    await client.negotiation.update({ where: { id: negotiationId }, data: { status: "AWAITING_APPROVAL" } });
    return request;
  }
  return client.$transaction(async (tx) => {
    const approved = decision === "APPROVE";
    const updated = await tx.negotiationRequest.update({ where: { id: request.id }, data: approved ? { status: "APPROVED", approvedBody: request.draftBody, approvedContentHash: quoteRequestContentHash(request.recipientEmail, request.subject, request.draftBody), approvedAt: new Date(), approvedById: negotiation.case.patientProfileId } : { status: "REJECTED", approvedBody: null, approvedContentHash: null, approvedAt: null, approvedById: null } });
    if (!approved) { assertNegotiationTransition(negotiation.status as State, "CLOSED"); await tx.negotiation.update({ where: { id: negotiationId }, data: { status: "CLOSED" } }); }
    else await tx.negotiation.update({ where: { id: negotiationId }, data: { status: "AWAITING_APPROVAL" } });
    await tx.auditEvent.create({ data: { caseId: negotiation.caseId, negotiationId, patientProfileId: negotiation.case.patientProfileId, action: approved ? "REQUEST_APPROVED" : "REQUEST_REJECTED", actor: "PATIENT", detailsJson: JSON.stringify({ requestId: request.id, recipient: request.recipientEmail, contentHash: updated.approvedContentHash, version: request.version, from: negotiation.status, to: approved ? "AWAITING_APPROVAL" : "CLOSED" }) } });
    return updated;
  });
}

export async function sendNegotiationRequest(negotiationIdInput: string, confirmed: boolean, options: { client?: DatabaseClient; service?: EmailService } = {}) {
  if (!confirmed) throw new Error("A separate explicit send action is required.");
  assertMockDemo();
  const client = options.client ?? getDatabaseClient();
  const negotiationId = id.parse(negotiationIdInput);
  const mode = process.env.EMAIL_TRANSPORT?.trim().toLowerCase() || "mock";
  const simulated = mode === "mock" && !options.service;
  if (!simulated && mode !== "resend" && !options.service) throw new EmailServiceError("CONFIG_REQUIRED", "Configure a supported email transport.");
  const config = simulated ? null : readEmailConfiguration();
  if (!simulated && !config?.configuration) return { status: "CONFIG_REQUIRED" as const, message: `Configuration required: ${config?.missing.join(", ")}. Nothing was sent.` };
  const service = options.service ?? (simulated ? null : createEmailService(config!.configuration!));
  const claim = await client.$transaction(async (tx) => {
    const negotiation = await tx.negotiation.findUniqueOrThrow({ where: { id: negotiationId }, include: { requests: { orderBy: { version: "desc" }, take: 1 }, case: { include: { patientProfile: true } }, provider: true } });
    const request = negotiation.requests[0];
    if (!request) throw new Error("No negotiation request exists.");
    if (["SIMULATED", "SENT", "SENDING", "UNCERTAIN"].includes(request.status)) return { request, negotiation, claimed: false };
    if (request.status !== "APPROVED" || !request.approvedAt || !request.approvedBody || !request.approvedContentHash || request.approvedById !== negotiation.case.patientProfileId || negotiation.status !== "AWAITING_APPROVAL") throw new Error("Approve the exact recipient, subject and body before sending.");
    if (!negotiation.case.isFictional || !negotiation.case.patientProfile.isFictional || !negotiation.case.patientProfile.consentGivenAt || negotiation.case.patientProfile.consentWithdrawnAt || quoteRequestContentHash(request.recipientEmail, request.subject, request.approvedBody) !== request.approvedContentHash || request.draftBody !== request.approvedBody) throw new Error("Consent or approved message content changed. Review a new draft.");
    if (!simulated) {
      const verifiedContact = negotiation.requestType === "INSURER_BENEFITS_REVIEW" ? Boolean(request.recipientVerifiedAt) : negotiation.provider.sourceType === "VERIFIED_EXTERNAL" && negotiation.provider.ownerCaseId === negotiation.caseId && negotiation.provider.verificationStatus === "USER_VERIFIED" && Boolean(negotiation.provider.verifiedByUserAt) && request.recipientEmail === negotiation.provider.email;
      if (request.recipientEmail.toLowerCase().endsWith(".example") || !verifiedContact || !config!.configuration!.allowedRecipients.has(request.recipientEmail.toLowerCase())) throw new EmailServiceError("RECIPIENT_BLOCKED", "Real demo sending requires a user-supplied allowlisted contact, never a fictional fixture address.");
    }
    const identifier = replyIdentifier(negotiation.caseId, negotiation.providerId, request.id);
    const updated = await tx.negotiationRequest.update({ where: { id: request.id, status: "APPROVED" }, data: { status: "SENDING", replyIdentifier: identifier, idempotencyKey: `negotiation/${request.id}` } });
    await tx.auditEvent.create({ data: { caseId: negotiation.caseId, negotiationId, patientProfileId: negotiation.case.patientProfileId, action: "SEND_CLAIMED", actor: "PATIENT", detailsJson: JSON.stringify({ requestId: request.id, simulated }) } });
    return { request: updated, negotiation, claimed: true };
  });
  if (!claim.claimed) return { status: claim.request.status, message: "This request was already submitted or needs reconciliation." };
  const fromEmail = simulated ? "medifair-demo@mock.invalid" : config!.configuration!.fromEmail;
  const inbound = simulated ? "replies@mock.invalid" : config!.configuration!.inboundAddress;
  const message = { fromEmail, toEmail: claim.request.recipientEmail, replyToEmail: replyAddress(inbound, claim.request.replyIdentifier!), subject: claim.request.subject, body: claim.request.approvedBody!, idempotencyKey: claim.request.idempotencyKey!, approval: { negotiationRequestId: claim.request.id, caseId: claim.negotiation.caseId, providerId: claim.negotiation.providerId, patientProfileId: claim.negotiation.case.patientProfileId, approvedContentHash: claim.request.approvedContentHash! } };
  try {
    if (service) await service.verifySendingDomain(fromEmail);
    const sent = service ? { ...(await service.send(message)), simulated: false } : await createEmailTransport(client).sendEmail(message);
    await client.$transaction(async (tx) => {
      const sentAt = new Date();
      await tx.negotiationRequest.update({ where: { id: claim.request.id, status: "SENDING" }, data: { status: sent.simulated ? "SIMULATED" : "SENT", providerMessageId: sent.providerMessageId, sentAt } });
      const email = await tx.emailMessage.create({ data: { caseId: claim.negotiation.caseId, providerId: claim.negotiation.providerId, negotiationId, direction: "OUTBOUND", fromAddress: fromEmail, recipientAddress: claim.request.recipientEmail, subject: claim.request.subject, body: claim.request.approvedBody!, externalMessageId: sent.providerMessageId, threadId: claim.request.replyIdentifier, deliveryStatus: sent.simulated ? "SIMULATED" : "SENT", sentAt, isSimulation: sent.simulated } });
      const intermediate = sent.simulated ? "SIMULATED_SENT" : "SENT";
      assertNegotiationTransition(claim.negotiation.status as State, intermediate);
      await tx.negotiation.update({ where: { id: negotiationId }, data: { status: intermediate } });
      await tx.auditEvent.create({ data: { caseId: claim.negotiation.caseId, negotiationId, emailMessageId: email.id, action: sent.simulated ? "MESSAGE_SIMULATED" : "MESSAGE_SENT", actor: "SYSTEM", detailsJson: JSON.stringify({ from: claim.negotiation.status, to: intermediate, requestId: claim.request.id, providerMessageId: sent.providerMessageId, simulated: sent.simulated }) } });
    });
    return { status: sent.simulated ? "SIMULATED" as const : "SENT" as const, message: sent.simulated ? "Added to the simulated outbox; no external delivery occurred." : "Submitted to Resend; delivery is not guaranteed." };
  } catch (error) {
    const failure = error instanceof EmailServiceError ? error : new EmailServiceError("UNCERTAIN", "Send outcome is uncertain; reconcile before retrying.");
    await client.negotiationRequest.update({ where: { id: claim.request.id, status: "SENDING" }, data: { status: failure.kind === "UNCERTAIN" ? "UNCERTAIN" : "FAILED", sendError: failure.message } }).catch(() => undefined);
    await client.auditEvent.create({ data: { caseId: claim.negotiation.caseId, negotiationId, action: "SEND_FAILED", actor: "SYSTEM", detailsJson: JSON.stringify({ requestId: claim.request.id, kind: failure.kind }) } });
    return { status: failure.kind, message: failure.message };
  }
}

export async function closeNegotiation(negotiationId: string, client: DatabaseClient = getDatabaseClient()) {
  assertMockDemo();
  const current = await client.negotiation.findUniqueOrThrow({ where: { id: id.parse(negotiationId), isSimulation: true }, include: { case: { include: { patientProfile: true } } } });
  if (!current.case.isFictional || !current.case.patientProfile.isFictional) throw new Error("Only a fictional negotiation can be closed here.");
  if (current.status === "CLOSED") return current;
  assertNegotiationTransition(current.status as State, "CLOSED");
  return client.$transaction(async (tx) => {
    const closed = await tx.negotiation.update({ where: { id: current.id }, data: { status: "CLOSED" } });
    if (current.billOpportunityId) await tx.billReviewOpportunity.update({ where: { id: current.billOpportunityId }, data: { status: "DISMISSED" } });
    await tx.auditEvent.create({ data: { caseId: current.caseId, negotiationId: current.id, patientProfileId: current.case.patientProfileId, action: "NEGOTIATION_UPDATED", actor: "PATIENT", detailsJson: JSON.stringify({ from: current.status, to: "CLOSED", simulated: true }) } });
    return closed;
  });
}

export async function loadNegotiationDashboard(caseId: string, client: DatabaseClient = getDatabaseClient()) {
  assertMockDemo();
  const record = await client.case.findUnique({ where: { id: id.parse(caseId), isFictional: true } });
  if (!record) return null;
  const [negotiations, messages, events, review] = await Promise.all([
    client.negotiation.findMany({ where: { caseId, isSimulation: true }, include: { provider: true, originalQuote: { include: { extractions: true } }, revisedQuote: { include: { extractions: true } }, reviewOpportunity: true, requests: { orderBy: { version: "desc" } }, responses: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "desc" } }),
    client.emailMessage.findMany({ where: { caseId, negotiationId: { not: null } }, orderBy: { createdAt: "asc" } }),
    client.auditEvent.findMany({ where: { caseId, negotiationId: { not: null } }, orderBy: { occurredAt: "asc" } }),
    loadReviewInput(caseId, client),
  ]);
  return { record, negotiations, messages, events, review };
}
