import { z } from "zod";
import { getDatabaseClient, type DatabaseClient } from "./client";
import { manualPracticeSchema, selectedPracticeIdsSchema } from "../provider-selection";

const caseIdSchema = z.string().trim().min(1).max(100);
const providerIdSchema = z.string().trim().min(1).max(100);
const supportsDemoEyePractices = (specialty: string | null) => specialty?.trim().toLowerCase() === "ophthalmology";

function assertDemoMode() {
  if (process.env.DEMO_MODE === "false") throw new Error("Practice selection is disabled outside demo mode.");
}

async function fictionalCase(caseId: string, client: DatabaseClient) {
  const record = await client.case.findUniqueOrThrow({ where: { id: caseId }, include: { patientProfile: true } });
  if (!record.isFictional || !record.patientProfile.isFictional || !record.patientProfile.consentGivenAt || record.patientProfile.consentWithdrawnAt || record.status === "CLOSED") {
    throw new Error("A consenting fictional open case is required.");
  }
  return record;
}

export async function listCandidatePractices(caseId: string, client: DatabaseClient = getDatabaseClient()) {
  const id = caseIdSchema.parse(caseId);
  const record = await fictionalCase(id, client);
  const demoSpecialty = supportsDemoEyePractices(record.medicalSpecialty) ? "Ophthalmology" : "__none__";
  const providers = await client.provider.findMany({
    where: { OR: [
      { sourceType: "DEMO", isFictional: true, medicalSpecialty: demoSpecialty },
      { sourceType: "VERIFIED_EXTERNAL", ownerCaseId: id, verificationStatus: "USER_VERIFIED" },
    ] },
    include: { hospitals: { include: { hospital: true } } },
    orderBy: { practiceName: "asc" },
  });
  const selected = await client.caseProviderSelection.findMany({ where: { caseId: id }, orderBy: { selectedAt: "asc" } });
  return { providers, selectedIds: selected.map((item) => item.providerId) };
}

export async function saveSelectedPractices(caseId: string, rawIds: unknown, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  const id = caseIdSchema.parse(caseId);
  const providerIds = selectedPracticeIdsSchema.parse(rawIds);
  return client.$transaction(async (tx) => {
    const record = await tx.case.findUniqueOrThrow({ where: { id }, include: { patientProfile: true } });
    if (!record.isFictional || !record.patientProfile.isFictional || !record.patientProfile.consentGivenAt || record.patientProfile.consentWithdrawnAt || record.status === "CLOSED") {
      throw new Error("A consenting fictional open case is required.");
    }
    const providers = await tx.provider.findMany({ where: { id: { in: providerIds } } });
    if (providers.length !== providerIds.length || providers.some((provider) =>
      provider.sourceType === "DEMO"
        ? !provider.isFictional || provider.medicalSpecialty !== "Ophthalmology" || !supportsDemoEyePractices(record.medicalSpecialty)
        : provider.sourceType !== "VERIFIED_EXTERNAL" || provider.ownerCaseId !== id || provider.medicalSpecialty !== record.medicalSpecialty || provider.verificationStatus !== "USER_VERIFIED" || !provider.verifiedByUserAt || !provider.email
    )) throw new Error("One or more practices cannot be selected for this case.");

    await tx.caseProviderSelection.deleteMany({ where: { caseId: id } });
    if (providerIds.length) await tx.caseProviderSelection.createMany({ data: providerIds.map((providerId) => ({ caseId: id, providerId })) });
    await tx.auditEvent.create({ data: { caseId: id, patientProfileId: record.patientProfileId, action: "PRACTICES_SELECTED", actor: "PATIENT", detailsJson: JSON.stringify({ providerIds }) } });
    return providerIds;
  });
}

export async function addManualPractice(caseId: string, raw: unknown, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  const id = caseIdSchema.parse(caseId);
  const input = manualPracticeSchema.parse(raw);
  const record = await fictionalCase(id, client);
  const now = new Date();
  return client.$transaction(async (tx) => {
    const provider = await tx.provider.create({ data: {
      practiceName: input.practiceName, medicalSpecialty: record.medicalSpecialty,
      sourceType: "VERIFIED_EXTERNAL", ownerCaseId: id, websiteUrl: input.websiteUrl || null,
      email: input.email, phone: null, suburb: input.suburb, state: input.state, postcode: input.postcode,
      contactSource: input.contactSource, contactSourceUrl: input.contactSourceUrl || null,
      reportedHospitalName: input.reportedHospitalName || null,
      verificationStatus: "USER_VERIFIED", verifiedByUserAt: now, verifiedAt: null, isFictional: false,
    } });
    await tx.auditEvent.create({ data: { caseId: id, patientProfileId: record.patientProfileId, action: "PRACTICE_ADDED", actor: "PATIENT", detailsJson: JSON.stringify({ providerId: provider.id, sourceType: provider.sourceType }) } });
    return provider;
  });
}

export async function updateManualPractice(caseId: string, providerId: string, raw: unknown, client: DatabaseClient = getDatabaseClient()) {
  assertDemoMode();
  const id = caseIdSchema.parse(caseId);
  const providerKey = providerIdSchema.parse(providerId);
  const input = manualPracticeSchema.parse(raw);
  const record = await fictionalCase(id, client);
  return client.$transaction(async (tx) => {
    const existing = await tx.provider.findUniqueOrThrow({ where: { id: providerKey } });
    if (existing.sourceType !== "VERIFIED_EXTERNAL" || existing.ownerCaseId !== id || existing.isFictional) {
      throw new Error("Only a user-supplied practice for this case can be edited.");
    }
    const provider = await tx.provider.update({ where: { id: providerKey }, data: {
      practiceName: input.practiceName, medicalSpecialty: record.medicalSpecialty, email: input.email, websiteUrl: input.websiteUrl || null,
      suburb: input.suburb, state: input.state, postcode: input.postcode,
      contactSource: input.contactSource, contactSourceUrl: input.contactSourceUrl || null,
      reportedHospitalName: input.reportedHospitalName || null,
      verificationStatus: "USER_VERIFIED", verifiedByUserAt: new Date(),
    } });
    await tx.auditEvent.create({ data: { caseId: id, patientProfileId: record.patientProfileId, action: "PRACTICE_UPDATED", actor: "PATIENT", detailsJson: JSON.stringify({ providerId: provider.id }) } });
    return provider;
  });
}
