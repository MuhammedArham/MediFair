import { getDatabaseClient, type DatabaseClient } from "./client";
import { centsToDollars, dollarsToCents, emptyOnboardingValues, onboardingSchema, type OnboardingValues } from "../onboarding";

const consentScope = "Fictional demo case storage, draft email preparation and analysis of synthetic replies only. Each outbound message requires separate approval.";
const optional = (value: string) => value.trim() || null;

export async function saveOnboardingCase(input: unknown, editId?: string, client: DatabaseClient = getDatabaseClient()) {
  if (process.env.DEMO_MODE === "false") throw new Error("Onboarding is disabled outside demo mode.");
  const values = onboardingSchema.parse(input);
  const now = new Date();
  const insurance = {
    insurerName: optional(values.insurerName),
    policyType: values.insurerName ? "HOSPITAL" as const : "UNKNOWN" as const,
    hospitalCoverTier: optional(values.hospitalCoverTier),
    policyDetails: optional(values.policyDetails),
    knownExcessCents: dollarsToCents(values.excessDollars),
    knownCopaymentCents: dollarsToCents(values.copaymentDollars),
    coverageVerificationStatus: values.coverageVerification === "CONFIRMED" ? "PATIENT_REPORTED_CONFIRMED" as const : "UNVERIFIED" as const,
    coverageVerifiedAt: null,
  };
  const caseData = {
    title: `Fictional ${values.procedureName} enquiry`, procedureName: values.procedureName,
    medicalSpecialty: values.medicalSpecialty, laterality: "UNSPECIFIED" as const,
    referralStatus: values.referralStatus, medicareEligibility: values.medicareEligibility,
    mbsItemNumber: optional(values.mbsItemNumber),
    mbsItemStatus: values.mbsItemNumber ? values.mbsClinicianConfirmed ? "CLINICIAN_CONFIRMED" as const : "ILLUSTRATIVE" as const : "UNKNOWN" as const,
    suburb: values.suburb, state: values.state, postcode: values.postcode,
  };
  const preference = {
    preferredLocation: values.preferredLocation,
    travelDistanceKm: values.travelDistanceKm === "" ? null : Number(values.travelDistanceKm),
    budgetCents: dollarsToCents(values.budgetDollars),
    preferredProviderName: optional(values.preferredProviderName),
    preferredHospitalName: optional(values.preferredHospitalName),
    accessibilityNotes: optional(values.accessibilityNotes),
    languagePreference: optional(values.languagePreference),
  };

  return client.$transaction(async (tx) => {
    if (editId) {
      const existing = await tx.case.findUniqueOrThrow({ where: { id: editId }, include: { quoteRequests: true, quotes: true } });
      if (!existing.isFictional || existing.status !== "DRAFT" || existing.quoteRequests.length || existing.quotes.length || !existing.insuranceProfileId) {
        throw new Error("Only an untouched fictional draft case can be edited.");
      }
      await tx.insuranceProfile.update({ where: { id: existing.insuranceProfileId, isFictional: true }, data: insurance });
      if (existing.procedureName !== values.procedureName || existing.medicalSpecialty !== values.medicalSpecialty) {
        await tx.caseProviderSelection.deleteMany({ where: { caseId: editId } });
      }
      await tx.case.update({ where: { id: editId }, data: caseData });
      await tx.casePreference.upsert({ where: { caseId: editId }, create: { caseId: editId, ...preference }, update: preference });
      await tx.auditEvent.create({ data: { caseId: editId, patientProfileId: existing.patientProfileId, action: "CASE_UPDATED", actor: "PATIENT", occurredAt: now, detailsJson: JSON.stringify({ synthetic: true, consentReaffirmed: true }) } });
      return editId;
    }

    const patient = await tx.patientProfile.create({ data: {
      displayName: "Fictional demo participant", email: null, isFictional: true,
      consentGivenAt: now, consentScope,
    } });
    const policy = await tx.insuranceProfile.create({ data: {
      patientProfileId: patient.id, policyLabel: "Onboarding private cover details", membershipStatus: "UNKNOWN",
      isFictional: true, ...insurance,
    } });
    const caseRecord = await tx.case.create({ data: {
      patientProfileId: patient.id, insuranceProfileId: policy.id, sourceReferenceId: null,
      clinicianConfirmedAt: null, status: "DRAFT", isFictional: true, ...caseData,
    } });
    await tx.casePreference.create({ data: { caseId: caseRecord.id, ...preference } });
    await tx.auditEvent.createMany({ data: [
      { caseId: caseRecord.id, patientProfileId: patient.id, action: "CONSENT_GRANTED", actor: "PATIENT", occurredAt: now, detailsJson: JSON.stringify({ synthetic: true, scope: consentScope }) },
      { caseId: caseRecord.id, patientProfileId: patient.id, action: "CASE_CREATED", actor: "PATIENT", occurredAt: now, detailsJson: JSON.stringify({ synthetic: true }) },
    ] });
    return caseRecord.id;
  });
}

export async function getEditableOnboardingCase(id: string, client: DatabaseClient = getDatabaseClient()): Promise<OnboardingValues | null> {
  const existing = await client.case.findUnique({ where: { id }, include: { insuranceProfile: true, preference: true, quoteRequests: true, quotes: true } });
  if (!existing?.isFictional || existing.status !== "DRAFT" || existing.quoteRequests.length || existing.quotes.length) return null;
  const insurance = existing.insuranceProfile;
  const preference = existing.preference;
  return {
    ...emptyOnboardingValues,
    procedureName: existing.procedureName, medicalSpecialty: existing.medicalSpecialty ?? "",
    mbsItemNumber: existing.mbsItemNumber ?? "", mbsClinicianConfirmed: existing.mbsItemStatus === "CLINICIAN_CONFIRMED",
    suburb: existing.suburb, state: existing.state as OnboardingValues["state"], postcode: existing.postcode,
    referralStatus: existing.referralStatus, medicareEligibility: existing.medicareEligibility,
    insurerName: insurance?.insurerName ?? "", hospitalCoverTier: insurance?.hospitalCoverTier ?? "",
    policyDetails: insurance?.policyDetails ?? "", excessDollars: centsToDollars(insurance?.knownExcessCents ?? null),
    copaymentDollars: centsToDollars(insurance?.knownCopaymentCents ?? null),
    coverageVerification: insurance?.coverageVerificationStatus === "PATIENT_REPORTED_CONFIRMED" ? "CONFIRMED" : "NOT_CONFIRMED",
    preferredLocation: preference?.preferredLocation ?? existing.suburb,
    travelDistanceKm: preference?.travelDistanceKm?.toString() ?? "", budgetDollars: centsToDollars(preference?.budgetCents ?? null),
    preferredProviderName: preference?.preferredProviderName ?? "", preferredHospitalName: preference?.preferredHospitalName ?? "",
    accessibilityNotes: preference?.accessibilityNotes ?? "", languagePreference: preference?.languagePreference ?? "",
  };
}
