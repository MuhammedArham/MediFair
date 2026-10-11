import { z } from "zod";
import { editableDraftSchema } from "../quote-request-template";
import { getDatabaseClient, type DatabaseClient } from "./client";
import { quoteRequestContentHash } from "./repository";

const idSchema = z.string().trim().min(1).max(100);

function assertDemoMode() {
  if (process.env.DEMO_MODE === "false") throw new Error("Quote drafting is available only in demo mode.");
}

async function eligibleSelection(caseId: string, providerId: string, client: Pick<DatabaseClient, "caseProviderSelection">) {
  const selection = await client.caseProviderSelection.findUniqueOrThrow({
    where: { caseId_providerId: { caseId, providerId } },
    include: { case: { include: { patientProfile: true } }, provider: true },
  });
  const { case: caseRecord, provider } = selection;
  if (!caseRecord.isFictional || !caseRecord.patientProfile.isFictional || !caseRecord.patientProfile.consentGivenAt || caseRecord.patientProfile.consentWithdrawnAt || caseRecord.status === "CLOSED") throw new Error("An open consenting fictional case is required.");
  if (!provider.email || (provider.sourceType === "DEMO" ? !provider.isFictional : provider.sourceType !== "VERIFIED_EXTERNAL" || provider.ownerCaseId !== caseId || provider.verificationStatus !== "USER_VERIFIED" || !provider.verifiedByUserAt)) throw new Error("The selected practice needs a verified recipient.");
  return selection;
}

export async function listCurrentQuoteDrafts(caseId: string, client: DatabaseClient = getDatabaseClient()) {
  const id = idSchema.parse(caseId);
  const selected = await client.caseProviderSelection.findMany({ where: { caseId: id }, include: { provider: true }, orderBy: { selectedAt: "asc" } });
  const requests = await client.quoteRequest.findMany({ where: { caseId: id, providerId: { in: selected.map((item) => item.providerId) } }, orderBy: { requestVersion: "desc" } });
  return selected.map((item) => {
    const latest = requests.find((request) => request.providerId === item.providerId);
    return { provider: item.provider, request: latest && ["DRAFT", "APPROVED", "REJECTED", "SENT", "SIMULATED", "REPLIED", "FAILED"].includes(latest.status) ? latest : null, latestVersion: latest?.requestVersion ?? 0 };
  });
}

export async function saveSelectedQuoteDraft(caseId: string, providerId: string, rawDraft: unknown, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  const id = idSchema.parse(caseId);
  const practiceId = idSchema.parse(providerId);
  const draft = editableDraftSchema.parse(rawDraft);
  return client.$transaction(async (tx) => {
    const selection = await eligibleSelection(id, practiceId, tx);
    const recipientEmail = selection.provider.email!;
    const latest = await tx.quoteRequest.findFirst({ where: { caseId: id, providerId: practiceId }, orderBy: { requestVersion: "desc" } });
    if (latest && latest.recipientEmail === recipientEmail && latest.subject === draft.subject && latest.body === draft.body && ["DRAFT", "APPROVED"].includes(latest.status)) return latest;
    const eventAt = new Date();
    if (latest?.status === "DRAFT") {
      const updated = await tx.quoteRequest.update({ where: { id: latest.id }, data: { ...draft, recipientEmail } });
      await tx.auditEvent.create({ data: { caseId: id, patientProfileId: selection.case.patientProfileId, quoteRequestId: updated.id, action: "REQUEST_EDITED", actor: "PATIENT", occurredAt: eventAt, detailsJson: JSON.stringify({ version: updated.requestVersion, contentHash: quoteRequestContentHash(recipientEmail, draft.subject, draft.body) }) } });
      return updated;
    }
    const created = await tx.quoteRequest.create({ data: { caseId: id, providerId: practiceId, requestVersion: (latest?.requestVersion ?? 0) + 1, recipientEmail, ...draft, status: "DRAFT", isSimulation: true } });
    await tx.auditEvent.create({ data: { caseId: id, patientProfileId: selection.case.patientProfileId, quoteRequestId: created.id, action: "REQUEST_DRAFTED", actor: "PATIENT", occurredAt: eventAt, detailsJson: JSON.stringify({ version: created.requestVersion, contentHash: quoteRequestContentHash(recipientEmail, draft.subject, draft.body) }) } });
    return created;
  });
}

export async function approveSelectedQuoteDraft(caseId: string, providerId: string, requestId: string, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  const id = idSchema.parse(caseId), practiceId = idSchema.parse(providerId), draftId = idSchema.parse(requestId);
  return client.$transaction(async (tx) => {
    const selection = await eligibleSelection(id, practiceId, tx);
    const request = await tx.quoteRequest.findUniqueOrThrow({ where: { id: draftId } });
    const latest = await tx.quoteRequest.findFirst({ where: { caseId: id, providerId: practiceId }, orderBy: { requestVersion: "desc" } });
    if (request.caseId !== id || request.providerId !== practiceId || request.id !== latest?.id || request.status !== "DRAFT" || request.recipientEmail !== selection.provider.email || !request.isSimulation) throw new Error("Only the current exact draft may be approved.");
    const approvedAt = new Date();
    const approvedContentHash = quoteRequestContentHash(request.recipientEmail, request.subject, request.body);
    const approved = await tx.quoteRequest.update({ where: { id: request.id }, data: { status: "APPROVED", approvedAt, approvedById: selection.case.patientProfileId, approvedContentHash } });
    await tx.auditEvent.create({ data: { caseId: id, patientProfileId: selection.case.patientProfileId, quoteRequestId: request.id, action: "REQUEST_APPROVED", actor: "PATIENT", occurredAt: approvedAt, detailsJson: JSON.stringify({ version: request.requestVersion, recipientEmail: request.recipientEmail, approvedContentHash, noEmailSent: true }) } });
    return approved;
  });
}

export async function rejectSelectedQuoteDraft(caseId: string, providerId: string, requestId: string, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  const id = idSchema.parse(caseId), practiceId = idSchema.parse(providerId), draftId = idSchema.parse(requestId);
  return client.$transaction(async (tx) => {
    const selection = await eligibleSelection(id, practiceId, tx);
    const request = await tx.quoteRequest.findUniqueOrThrow({ where: { id: draftId } });
    const latest = await tx.quoteRequest.findFirst({ where: { caseId: id, providerId: practiceId }, orderBy: { requestVersion: "desc" } });
    if (request.caseId !== id || request.providerId !== practiceId || request.id !== latest?.id || !["DRAFT", "APPROVED"].includes(request.status)) throw new Error("Only a current draft or unsent approval can be rejected.");
    const rejectedAt = new Date();
    const rejected = await tx.quoteRequest.update({ where: { id: request.id }, data: { status: "REJECTED" } });
    await tx.auditEvent.create({ data: { caseId: id, patientProfileId: selection.case.patientProfileId, quoteRequestId: request.id, action: "REQUEST_REJECTED", actor: "PATIENT", occurredAt: rejectedAt, detailsJson: JSON.stringify({ version: request.requestVersion, recipientEmail: request.recipientEmail, noEmailSent: true }) } });
    return rejected;
  });
}
