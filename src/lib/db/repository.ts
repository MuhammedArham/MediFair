import { createHash } from "node:crypto";
import { z } from "zod";
import { getDatabaseClient, type DatabaseClient } from "./client";
import {
  caseInput, costLineItemInput, documentInput, emailEventInput, emailMessageInput,
  insuranceInput, negotiationInput, opportunityInput, patientInput, providerInput,
  quoteInput, quoteRequestInput, sourceReferenceInput,
} from "./validation";

const idInput = z.string().trim().min(1);
const casePatch = caseInput.pick({ status: true, suburb: true, state: true, postcode: true }).partial();
const providerPatch = providerInput.pick({ practiceName: true, email: true, phone: true, contactSource: true, verificationStatus: true }).partial();
const insurancePatch = insuranceInput.pick({ membershipStatus: true, knownExcessCents: true, coverageVerificationStatus: true }).partial();
const negotiationPatch = z.strictObject({
  counteroffer: z.string().trim().min(1).nullable().optional(),
  status: z.enum(["DRAFT", "APPROVED", "SENT", "AWAITING_RESPONSE", "COUNTEROFFERED", "AGREED", "CLOSED"]).optional(),
  revisedQuoteId: idInput.nullable().optional(),
  agreedResult: z.string().trim().min(1).nullable().optional(),
  agreedPatientAmountCents: z.number().int().min(0).max(2_147_483_647).nullable().optional(),
});

function assertDemoMode() {
  if (process.env.DEMO_MODE === "false") throw new Error("Live writes are disabled until production safety gates exist.");
}

function hasConsent(patient: { consentGivenAt: Date | null; consentWithdrawnAt: Date | null; isFictional: boolean }) {
  return patient.isFictional && patient.consentGivenAt !== null && patient.consentWithdrawnAt === null;
}

export function quoteRequestContentHash(recipientEmail: string, subject: string, body: string) {
  return createHash("sha256").update(JSON.stringify([recipientEmail.trim().toLowerCase(), subject, body])).digest("hex");
}

export async function createPatientProfile(input: unknown, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  return client.patientProfile.create({ data: patientInput.parse(input) });
}

export async function getPatientProfile(id: string, client: DatabaseClient = getDatabaseClient()) {
  return client.patientProfile.findUnique({ where: { id: idInput.parse(id) }, include: { insuranceProfiles: true } });
}

export async function withdrawPatientConsent(id: string, at: Date, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  const patientId = idInput.parse(id);
  const withdrawnAt = z.date().parse(at);
  return client.patientProfile.update({ where: { id: patientId, isFictional: true }, data: { consentWithdrawnAt: withdrawnAt } });
}

export async function createInsuranceProfile(input: unknown, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  const data = insuranceInput.parse(input);
  const patient = await client.patientProfile.findUniqueOrThrow({ where: { id: data.patientProfileId } });
  if (!hasConsent(patient)) throw new Error("A consenting fictional patient is required.");
  return client.insuranceProfile.create({ data });
}

export async function updateInsuranceProfile(id: string, patch: unknown, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  return client.insuranceProfile.update({ where: { id: idInput.parse(id), isFictional: true }, data: insurancePatch.parse(patch) });
}

export async function createCase(input: unknown, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  const data = caseInput.parse(input);
  const patient = await client.patientProfile.findUniqueOrThrow({ where: { id: data.patientProfileId } });
  if (!hasConsent(patient)) throw new Error("A consenting fictional patient is required.");
  if (data.insuranceProfileId) {
    const insurance = await client.insuranceProfile.findUniqueOrThrow({ where: { id: data.insuranceProfileId } });
    if (insurance.patientProfileId !== patient.id || !insurance.isFictional) throw new Error("Insurance profile does not belong to this fictional patient.");
  }
  return client.case.create({ data });
}

export async function getCase(id: string, client: DatabaseClient = getDatabaseClient()) {
  return client.case.findUnique({ where: { id: idInput.parse(id), isFictional: true }, include: {
    patientProfile: true, insuranceProfile: true, sourceReference: true, preference: true,
    selectedProviders: { include: { provider: true } },
    quotes: { include: { provider: true, lineItems: true }, orderBy: { revisionNumber: "asc" } },
    quoteRequests: { include: { provider: true } },
  } });
}

export async function listCases(client: DatabaseClient = getDatabaseClient()) {
  return client.case.findMany({ where: { isFictional: true }, orderBy: { createdAt: "desc" } });
}

export async function updateCase(id: string, patch: unknown, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  return client.case.update({ where: { id: idInput.parse(id), isFictional: true }, data: casePatch.parse(patch) });
}

// Related records prevent deletion; the reset script removes demo children first.
export async function deleteEmptyCase(id: string, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  return client.case.delete({ where: { id: idInput.parse(id), isFictional: true, status: "DRAFT" } });
}

export async function createProvider(input: unknown, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  return client.provider.create({ data: providerInput.parse(input) });
}

export async function listProviders(client: DatabaseClient = getDatabaseClient()) {
  return client.provider.findMany({ where: { isFictional: true }, include: { hospitals: { include: { hospital: true } } }, orderBy: { practiceName: "asc" } });
}

export async function updateProvider(id: string, patch: unknown, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  return client.provider.update({ where: { id: idInput.parse(id), isFictional: true }, data: providerPatch.parse(patch) });
}

export async function deleteUnusedProvider(id: string, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  return client.provider.delete({ where: { id: idInput.parse(id), isFictional: true } });
}

export async function createQuoteRequestDraft(input: unknown, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  const data = quoteRequestInput.parse(input);
  const [caseRecord, provider] = await Promise.all([
    client.case.findUniqueOrThrow({ where: { id: data.caseId }, include: { patientProfile: true } }),
    client.provider.findUniqueOrThrow({ where: { id: data.providerId } }),
  ]);
  if (!caseRecord.isFictional || !hasConsent(caseRecord.patientProfile) || !provider.isFictional || provider.email !== data.recipientEmail) {
    throw new Error("Request must use a consenting demo case and the selected fictional provider's address.");
  }
  return client.quoteRequest.create({ data });
}

export async function updateQuoteRequestDraft(id: string, patch: unknown, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  const data = z.strictObject({ recipientEmail: z.email().optional(), subject: z.string().trim().min(1).optional(), body: z.string().trim().min(1).optional() }).parse(patch);
  const request = await client.quoteRequest.findUniqueOrThrow({ where: { id: idInput.parse(id) }, include: { provider: true } });
  if (request.status !== "DRAFT") throw new Error("Approved or sent requests cannot be edited.");
  if (data.recipientEmail && data.recipientEmail !== request.provider.email) throw new Error("Recipient does not match provider contact.");
  return client.quoteRequest.update({ where: { id: request.id }, data });
}

export async function approveQuoteRequest(id: string, patientId: string, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  const requestId = idInput.parse(id);
  const approverId = idInput.parse(patientId);
  return client.$transaction(async (tx) => {
    const request = await tx.quoteRequest.findUniqueOrThrow({ where: { id: requestId }, include: { case: { include: { patientProfile: true } }, provider: true } });
    if (request.status !== "DRAFT" || request.case.patientProfileId !== approverId || !hasConsent(request.case.patientProfile)) throw new Error("Only the consenting patient can approve a draft.");
    if (request.provider.email !== request.recipientEmail || !request.provider.isFictional || !request.isSimulation) throw new Error("Demo recipient verification failed.");
    const approvedAt = new Date();
    const approvedContentHash = quoteRequestContentHash(request.recipientEmail, request.subject, request.body);
    const approved = await tx.quoteRequest.update({ where: { id: requestId }, data: { status: "APPROVED", approvedAt, approvedById: approverId, approvedContentHash } });
    await tx.auditEvent.create({ data: { caseId: request.caseId, patientProfileId: approverId, quoteRequestId: requestId, action: "REQUEST_APPROVED", actor: "PATIENT", occurredAt: approvedAt, detailsJson: JSON.stringify({ approvedContentHash, recipientEmail: request.recipientEmail }) } });
    return approved;
  });
}

export async function listQuoteRequests(caseId: string, client: DatabaseClient = getDatabaseClient()) {
  return client.quoteRequest.findMany({ where: { caseId: idInput.parse(caseId), isSimulation: true }, include: { provider: true }, orderBy: { createdAt: "asc" } });
}

export async function recordEmailMessage(input: unknown, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  const data = emailMessageInput.parse(input);
  if (!data.caseId) throw new Error("A case is required for this message operation.");
  const caseRecord = await client.case.findUniqueOrThrow({ where: { id: data.caseId } });
  if (!caseRecord.isFictional) throw new Error("Only synthetic case email can be recorded.");
  if (data.providerId) {
    const provider = await client.provider.findUniqueOrThrow({ where: { id: data.providerId } });
    if (!provider.isFictional) throw new Error("Email provider must be fictional.");
  }
  if (data.direction === "OUTBOUND") {
    if (!data.quoteRequestId) throw new Error("Outbound email requires an approved quote request.");
    const request = await client.quoteRequest.findUniqueOrThrow({ where: { id: data.quoteRequestId } });
    const hash = quoteRequestContentHash(request.recipientEmail, data.subject, data.body);
    if (request.caseId !== data.caseId || request.providerId !== data.providerId || !request.approvedAt || !["APPROVED", "SENT", "REPLIED"].includes(request.status) || request.approvedContentHash !== hash) {
      throw new Error("Outbound email does not match the exact approved request.");
    }
  }
  return client.emailMessage.create({ data });
}

export async function recordEmailEvent(input: unknown, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  const data = emailEventInput.parse(input);
  const existing = await client.emailEvent.findUnique({ where: { providerEventId: data.providerEventId } });
  if (existing) {
    if (existing.emailMessageId !== data.emailMessageId || existing.type !== data.type || existing.occurredAt.getTime() !== data.occurredAt.getTime()) throw new Error("Email event ID collision.");
    return existing;
  }
  const message = await client.emailMessage.findUniqueOrThrow({ where: { id: data.emailMessageId } });
  if (!message.isSimulation) throw new Error("Only synthetic email events are supported.");
  return client.emailEvent.create({ data });
}

export async function listEmailMessages(caseId: string, client: DatabaseClient = getDatabaseClient()) {
  return client.emailMessage.findMany({ where: { caseId: idInput.parse(caseId), isSimulation: true }, include: { provider: true, events: true, quoteRequest: true }, orderBy: { createdAt: "asc" } });
}

export async function createDocument(input: unknown, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  const data = documentInput.parse(input);
  const caseRecord = await client.case.findUniqueOrThrow({ where: { id: data.caseId } });
  if (!caseRecord.isFictional) throw new Error("Only synthetic document metadata is supported.");
  if (data.providerId) {
    const provider = await client.provider.findUniqueOrThrow({ where: { id: data.providerId } });
    if (!provider.isFictional) throw new Error("Document provider must be fictional.");
  }
  if (data.emailMessageId) {
    const email = await client.emailMessage.findUniqueOrThrow({ where: { id: data.emailMessageId } });
    if (email.caseId !== data.caseId || email.providerId !== data.providerId) throw new Error("Document source email mismatch.");
  }
  return client.document.create({ data });
}

export async function createQuote(input: unknown, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  const { lineItems, ...data } = quoteInput.parse(input);
  const [caseRecord, provider] = await Promise.all([
    client.case.findUniqueOrThrow({ where: { id: data.caseId } }),
    client.provider.findUniqueOrThrow({ where: { id: data.providerId } }),
  ]);
  if (!caseRecord.isFictional || !provider.isFictional) throw new Error("Only fictional demo quotes are supported.");
  if (data.revisionOfId) {
    const previous = await client.quote.findUniqueOrThrow({ where: { id: data.revisionOfId } });
    if (previous.caseId !== data.caseId || previous.providerId !== data.providerId || data.revisionNumber <= previous.revisionNumber) throw new Error("Revision must follow a quote from the same case and provider.");
  }
  if (data.sourceEmailId) {
    const email = await client.emailMessage.findUniqueOrThrow({ where: { id: data.sourceEmailId } });
    if (email.caseId !== data.caseId || email.providerId !== data.providerId) throw new Error("Quote source email mismatch.");
  }
  if (data.sourceDocumentId) {
    const document = await client.document.findUniqueOrThrow({ where: { id: data.sourceDocumentId } });
    if (document.caseId !== data.caseId || document.providerId !== data.providerId) throw new Error("Quote source document mismatch.");
  }
  for (const item of lineItems) {
    if (item.sourceEmailId && item.sourceEmailId !== data.sourceEmailId) throw new Error("Line item source email mismatch.");
    if (item.sourceDocumentId && item.sourceDocumentId !== data.sourceDocumentId) throw new Error("Line item source document mismatch.");
  }
  return client.$transaction(async (tx) => {
    const quote = await tx.quote.create({ data });
    await tx.costLineItem.createMany({ data: lineItems.map((item) => ({ ...item, quoteId: quote.id })) });
    await tx.auditEvent.create({ data: { caseId: data.caseId, action: data.revisionOfId ? "QUOTE_REVISED" : "QUOTE_ADDED", actor: "SYSTEM", detailsJson: JSON.stringify({ quoteId: quote.id, fictional: true }) } });
    return tx.quote.findUniqueOrThrow({ where: { id: quote.id }, include: { lineItems: true, provider: true } });
  });
}

export async function updateCostLineItem(id: string, patch: unknown, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  const data = costLineItemInput.pick({ billedAmountCents: true, knownBenefitCents: true, patientResponsibilityCents: true, sourceLocator: true }).partial().parse(patch);
  const item = await client.costLineItem.findUniqueOrThrow({ where: { id: idInput.parse(id) } });
  if (!item.isFictional) throw new Error("Only fictional line items can be changed.");
  return client.costLineItem.update({ where: { id: item.id }, data });
}

export async function listQuotes(caseId: string, client: DatabaseClient = getDatabaseClient()) {
  return client.quote.findMany({ where: { caseId: idInput.parse(caseId), isFictional: true }, include: { provider: true, lineItems: true }, orderBy: [{ providerId: "asc" }, { revisionNumber: "asc" }] });
}

export async function createOpportunity(input: unknown, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  const data = opportunityInput.parse(input);
  const quote = await client.quote.findUniqueOrThrow({ where: { id: data.quoteId } });
  if (!quote.isFictional) throw new Error("Only fictional quote opportunities are supported.");
  return client.opportunity.create({ data });
}

export async function createNegotiation(input: unknown, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  const data = negotiationInput.parse(input);
  const quote = await client.quote.findUniqueOrThrow({ where: { id: data.originalQuoteId } });
  if (!quote.isFictional || quote.caseId !== data.caseId || quote.providerId !== data.providerId) throw new Error("Original quote must belong to the case and provider.");
  return client.negotiation.create({ data });
}

export async function updateNegotiation(id: string, patch: unknown, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  const data = negotiationPatch.parse(patch);
  const negotiation = await client.negotiation.findUniqueOrThrow({ where: { id: idInput.parse(id) } });
  if (!negotiation.isSimulation) throw new Error("Only synthetic negotiations can be changed.");
  if (data.revisedQuoteId) {
    const revised = await client.quote.findUniqueOrThrow({ where: { id: data.revisedQuoteId } });
    if (!revised.isFictional || revised.caseId !== negotiation.caseId || revised.providerId !== negotiation.providerId || revised.revisionOfId !== negotiation.originalQuoteId) throw new Error("Revised quote does not match this negotiation.");
  }
  return client.$transaction(async (tx) => {
    const updated = await tx.negotiation.update({ where: { id: negotiation.id }, data });
    await tx.auditEvent.create({ data: { caseId: negotiation.caseId, negotiationId: negotiation.id, action: "NEGOTIATION_UPDATED", actor: "SYSTEM", detailsJson: JSON.stringify({ status: updated.status }) } });
    return updated;
  });
}

export async function createSourceReference(input: unknown, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  return client.sourceReference.create({ data: sourceReferenceInput.parse(input) });
}

export async function listSourceReferences(client: DatabaseClient = getDatabaseClient()) {
  return client.sourceReference.findMany({ where: { isOfficial: true }, orderBy: { retrievedAt: "desc" } });
}

export async function listAuditEvents(caseId: string, client: DatabaseClient = getDatabaseClient()) {
  return client.auditEvent.findMany({ where: { caseId: idInput.parse(caseId) }, orderBy: { occurredAt: "asc" } });
}
