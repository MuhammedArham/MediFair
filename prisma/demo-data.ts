import { getDatabaseClient, type DatabaseClient } from "../src/lib/db/client";
import { quoteRequestContentHash } from "../src/lib/db/repository";
import { quoteExtractionSchema } from "../src/lib/ai/quote-extraction-schema";
import { deletePrivatePdf } from "../src/lib/documents/pdf-storage";
import {
  caseInput, costLineItemInput, documentInput, emailMessageInput, insuranceInput,
  patientInput, providerInput, quoteInput, quoteRequestInput, sourceReferenceInput,
} from "../src/lib/db/validation";

export const DEMO_CASE_ID = "demo-case";
export const DEMO_PATIENT_ID = "demo-patient-alex";
export const DEMO_INSURANCE_ID = "demo-insurance-cover";
const MBS_SOURCE_ID = "official-mbs-42702-20261011";
const IFC_SOURCE_ID = "official-ifc-20261011";
const providerIds = ["demo-provider-harbour", "demo-provider-north", "demo-provider-city"];
const hospitalIds = ["demo-hospital-harbour", "demo-hospital-central"];
const quoteIds = ["demo-quote-harbour", "demo-quote-north", "demo-quote-city"];

const at = (day: number, hour = 0) => new Date(`2026-10-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00Z`);
const money = (cents: number | null) => cents === null ? "not supplied" : `$${(cents / 100).toFixed(2)}`;

const practices = [
  { id: providerIds[0], practiceName: "Demo Harbour Eye Practice", websiteUrl: "https://harbour-eye.example", email: "quotes@harbour-eye.example", phone: "+61 2 5550 0101", suburb: "Sydney", state: "NSW", postcode: "2000", hospitalId: hospitalIds[0], quoteId: quoteIds[0], slug: "harbour", issueDay: 8, completeness: "COMPLETE", feeLines: [
    ["SURGEON", 297000], ["ANAESTHETIST", 75000], ["HOSPITAL", 90000], ["THEATRE", 45000], ["ACCOMMODATION", 25000], ["DEVICES", 50000], ["MEDICINES", 8000],
  ] },
  { id: providerIds[1], practiceName: "Demo Northside Ophthalmology", websiteUrl: "https://northside-eye.example", email: "quotes@northside-eye.example", phone: "+61 2 5550 0102", suburb: "North Sydney", state: "NSW", postcode: "2060", hospitalId: hospitalIds[1], quoteId: quoteIds[1], slug: "north", issueDay: 9, completeness: "COMPLETE", feeLines: [
    ["SURGEON", 210000], ["ANAESTHETIST", 90000], ["HOSPITAL", 100000], ["THEATRE", 50000], ["ACCOMMODATION", 30000], ["DEVICES", 40000], ["MEDICINES", 10000],
  ] },
  { id: providerIds[2], practiceName: "Demo City Cataract Rooms", websiteUrl: "https://city-cataract.example", email: "quotes@city-cataract.example", phone: "+61 2 5550 0103", suburb: "Sydney", state: "NSW", postcode: "2000", hospitalId: hospitalIds[1], quoteId: quoteIds[2], slug: "city", issueDay: 10, completeness: "INCOMPLETE", feeLines: [
    ["SURGEON", 195000], ["ANAESTHETIST", null], ["HOSPITAL", null], ["THEATRE", null], ["ACCOMMODATION", null], ["DEVICES", null], ["MEDICINES", null],
  ] },
] as const;

/** Removes the seeded demo case and its case-scoped records; other cases remain. */
export async function resetDemoData(client: DatabaseClient = getDatabaseClient()) {
  if (process.env.DEMO_MODE === "false") throw new Error("Demo reset is disabled outside demo mode.");
  const existing = await client.case.findUnique({ where: { id: DEMO_CASE_ID } });
  if (existing && !existing.isFictional) throw new Error("Refusing to reset a non-fictional case.");
  const storedFiles = await client.document.findMany({ where: { caseId: DEMO_CASE_ID, storageKey: { not: null } }, select: { storageKey: true } });
  await client.$transaction(async (tx) => {
    await tx.auditEvent.deleteMany({ where: { caseId: DEMO_CASE_ID } });
    await tx.negotiation.deleteMany({ where: { caseId: DEMO_CASE_ID } });
    await tx.reviewOpportunity.deleteMany({ where: { caseId: DEMO_CASE_ID } });
    await tx.opportunity.deleteMany({ where: { quoteId: { in: quoteIds } } });
    await tx.costLineItem.deleteMany({ where: { quoteId: { in: quoteIds } } });
    await tx.quote.deleteMany({ where: { caseId: DEMO_CASE_ID } });
    await tx.document.deleteMany({ where: { caseId: DEMO_CASE_ID } });
    await tx.emailEvent.deleteMany({ where: { emailMessage: { caseId: DEMO_CASE_ID } } });
    await tx.emailMessage.deleteMany({ where: { caseId: DEMO_CASE_ID } });
    await tx.outboundSend.deleteMany({ where: { caseId: DEMO_CASE_ID } });
    await tx.quoteRequest.deleteMany({ where: { caseId: DEMO_CASE_ID } });
    await tx.caseProviderSelection.deleteMany({ where: { caseId: DEMO_CASE_ID } });
    await tx.provider.deleteMany({ where: { ownerCaseId: DEMO_CASE_ID, sourceType: "VERIFIED_EXTERNAL" } });
    await tx.case.deleteMany({ where: { id: DEMO_CASE_ID } });
    // Shared practices, hospitals and official references may belong to other cases.
    // Preserve them; seeding upserts the canonical demo catalogue.
    await tx.insuranceProfile.deleteMany({ where: { id: DEMO_INSURANCE_ID, isFictional: true, cases: { none: {} } } });
    await tx.patientProfile.deleteMany({ where: { id: DEMO_PATIENT_ID, isFictional: true, cases: { none: {} }, insuranceProfiles: { none: {} } } });
  }, { timeout: 60_000 });
  for (const file of storedFiles) if (file.storageKey) await deletePrivatePdf(file.storageKey).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
}

/** Replaces the fictional demo records with a deterministic, reviewable baseline. */
export async function seedDemoData(client: DatabaseClient = getDatabaseClient()) {
  if (process.env.DEMO_MODE === "false") throw new Error("Demo seed is disabled outside demo mode.");
  await resetDemoData(client);
  await client.$transaction(async (tx) => {
    await tx.patientProfile.upsert({ where: { id: DEMO_PATIENT_ID }, update: {}, create: patientInput.parse({
      id: DEMO_PATIENT_ID, displayName: "Alex Morgan (fictional patient)", email: "alex.morgan@patient.example",
      isFictional: true, consentGivenAt: at(7, 9), consentScope: "Synthetic demo data only. Outbound test email requires exact-message approval and an allowlisted recipient. No real patient data or external AI processing.",
    }) });
    await tx.insuranceProfile.upsert({ where: { id: DEMO_INSURANCE_ID }, update: {}, create: { ...insuranceInput.parse({
      id: DEMO_INSURANCE_ID, patientProfileId: DEMO_PATIENT_ID, policyLabel: "Fictional hospital policy",
      insurerName: "DemoCover (fictional)", policyType: "HOSPITAL", membershipStatus: "ACTIVE",
      knownExcessCents: 50000, coverageVerificationStatus: "INSURER_CONFIRMED", isFictional: true,
    }), knownCopaymentCents: 0, coverageVerifiedAt: at(7) } });

    await tx.sourceReference.upsert({ where: { id: MBS_SOURCE_ID }, update: {}, create: sourceReferenceInput.parse({
      id: MBS_SOURCE_ID,
      url: "https://www9.health.gov.au/mbs/fullDisplay.cfm?criteria=cataract&q=42702&type=item",
      publisher: "Australian Government Department of Health, Disability and Ageing",
      title: "Medicare Benefits Schedule — Item 42702",
      publicationDate: null, effectiveDate: new Date("2025-03-01T00:00:00Z"),
      effectiveNote: "Description updated 1 March 2025; schedule fee updated 1 July 2026. No official fee or benefit is copied into fictional quotes.",
      retrievedAt: at(11), evidenceNotes: "Item 42702 describes lens extraction and insertion of an intraocular lens. This is an illustrative item only; patient eligibility and billing require clinician confirmation.",
      mbsItemNumber: "42702", isOfficial: true,
    }) });
    await tx.sourceReference.upsert({ where: { id: IFC_SOURCE_ID }, update: {}, create: sourceReferenceInput.parse({
      id: IFC_SOURCE_ID,
      url: "https://www.ombudsman.gov.au/publications-and-news-pages/publication-pages/brochures-and-factsheets/factsheets/private-health-insurance/informed-financial-consent",
      publisher: "Commonwealth Ombudsman", title: "Informed Financial Consent",
      publicationDate: null, effectiveDate: null, effectiveNote: "No single effective date stated on the page.",
      retrievedAt: at(11), evidenceNotes: "Patients can ask providers, the insurer and the hospital about likely out-of-pocket costs before treatment.",
      mbsItemNumber: null, isOfficial: true,
    }) });

    await tx.case.create({ data: caseInput.parse({
      id: DEMO_CASE_ID, patientProfileId: DEMO_PATIENT_ID, insuranceProfileId: DEMO_INSURANCE_ID,
      sourceReferenceId: MBS_SOURCE_ID, title: "Fictional one-eye cataract enquiry",
      procedureName: "Clinician-confirmed cataract procedure for one eye", medicalSpecialty: "Ophthalmology", laterality: "LEFT",
      clinicianConfirmedAt: at(6), mbsItemNumber: "42702", mbsItemStatus: "ILLUSTRATIVE",
      suburb: "Sydney", state: "NSW", postcode: "2000", status: "COMPARING", isFictional: true,
    }) });
    for (const hospital of [
      { id: hospitalIds[0], name: "Demo Harbour Day Hospital", suburb: "Sydney", state: "NSW", postcode: "2000", isFictional: true },
      { id: hospitalIds[1], name: "Demo Central Surgical Centre", suburb: "North Sydney", state: "NSW", postcode: "2060", isFictional: true },
    ]) await tx.hospital.upsert({ where: { id: hospital.id }, update: {}, create: hospital });

    for (const practice of practices) {
      await tx.provider.upsert({ where: { id: practice.id }, update: {}, create: providerInput.parse({
        id: practice.id, practiceName: practice.practiceName, medicalSpecialty: "Ophthalmology", sourceType: "DEMO", websiteUrl: practice.websiteUrl, email: practice.email, phone: practice.phone,
        suburb: practice.suburb, state: practice.state, postcode: practice.postcode,
        contactSource: "Fictional demo fixture; no real contact details", verificationStatus: "DEMO_ONLY", isFictional: true,
      }) });
      await tx.providerHospital.upsert({ where: { providerId_hospitalId: { providerId: practice.id, hospitalId: practice.hospitalId } }, update: {}, create: { providerId: practice.id, hospitalId: practice.hospitalId } });

      const requestId = `demo-request-${practice.slug}`;
      const subject = "Fictional demo: written cataract cost estimate request";
      const body = "This is a fictional demo request for a written estimate for a clinician-confirmed one-eye cataract procedure. Please itemise specialist, anaesthetist and facility fees, likely item numbers, benefits if known, and any gap or other costs. No real patient or practice is involved.";
      const recipientEmail = practice.email;
      const approvedAt = at(7, 10);
      const sentAt = at(7, 11);
      await tx.quoteRequest.create({ data: {
        ...quoteRequestInput.parse({ id: requestId, caseId: DEMO_CASE_ID, providerId: practice.id, requestVersion: 1, recipientEmail, subject, body, isSimulation: true }),
        status: "REPLIED", quoteResponseStatus: practice.completeness === "INCOMPLETE" ? "INCOMPLETE_QUOTE" : "COMPLETE_QUOTE", approvedAt, approvedById: DEMO_PATIENT_ID,
        approvedContentHash: quoteRequestContentHash(recipientEmail, subject, body), sentAt,
      } });
      const outboundId = `demo-email-out-${practice.slug}`;
      const inboundId = `demo-email-in-${practice.slug}`;
      const threadId = `demo-thread-${practice.slug}`;
      await tx.emailMessage.create({ data: emailMessageInput.parse({
        id: outboundId, caseId: DEMO_CASE_ID, providerId: practice.id, quoteRequestId: requestId,
        direction: "OUTBOUND", fromAddress: "medifair-demo@mock.invalid", recipientAddress: practice.email, subject, body, externalMessageId: `demo-out-${practice.slug}`,
        threadId, deliveryStatus: "SIMULATED", sentAt, receivedAt: null, isSimulation: true,
      }) });

      const feeSummary = practice.feeLines.map(([category, amount]) => `${category.toLowerCase()}: ${money(amount)}`).join("; ");
      const complete = practice.completeness === "COMPLETE";
      const total = complete ? practice.feeLines.reduce((sum, [, value]) => sum + (value ?? 0), 0) : null;
      const patientGap = total === null ? null : total - 100000 - 300000 + 50000;
      const responseBody = `FICTIONAL DEMO QUOTE — no real practice sent this email. Written estimate for a left-eye cataract procedure; proposed MBS item 42702 (illustrative; eligibility not established). ${practice.practiceName} normally uses ${practice.hospitalId === hospitalIds[0] ? "Demo Harbour Day Hospital" : "Demo Central Surgical Centre"}. Fees: ${feeSummary}. ${complete ? `Total provider fees: ${money(total)}. Fictional DemoCover and Medicare benefit amounts confirmed for this synthetic scenario only: Medicare ${money(100000)}; DemoCover ${money(300000)}. DemoCover excess ${money(50000)} and co-payment $0.00; expected patient out-of-pocket ${money(patientGap)}, including the excess. No additional fee categories are excluded from this synthetic estimate.` : "Anaesthetist and hospital/facility fees, benefits and final patient gap are not supplied; this quote is incomplete."} Valid until 31 October 2026.`;
      const receivedAt = at(practice.issueDay, 13);
      await tx.emailMessage.create({ data: emailMessageInput.parse({
        id: inboundId, caseId: DEMO_CASE_ID, providerId: practice.id, quoteRequestId: requestId,
        direction: "INBOUND", fromAddress: practice.email, recipientAddress: "replies@mock.invalid", subject: `Re: ${subject}`, body: responseBody,
        externalMessageId: `demo-in-${practice.slug}`, threadId, deliveryStatus: "RECEIVED",
        sentAt: null, receivedAt, isSimulation: true, matchStatus: "MATCHED",
      }) });
      await tx.emailEvent.createMany({ data: [
        { emailMessageId: outboundId, providerEventId: `demo-event-sent-${practice.slug}`, type: "SENT", occurredAt: sentAt },
        { emailMessageId: inboundId, providerEventId: `demo-event-received-${practice.slug}`, type: "RECEIVED", occurredAt: receivedAt },
      ] });
      const documentId = `demo-document-${practice.slug}`;
      await tx.document.create({ data: documentInput.parse({
        id: documentId, caseId: DEMO_CASE_ID, providerId: practice.id, emailMessageId: inboundId,
        kind: "QUOTE", sourceType: "DEMO", fileName: `fictional-${practice.slug}-quote.txt`,
        mimeType: "text/plain", byteSize: null, storageKey: null, sha256: null, isFictional: true,
      }) });

      const feeItems = practice.feeLines.map(([category, billedAmountCents], index) => costLineItemInput.parse({
        id: `demo-line-${practice.slug}-${index + 1}`, category, description: `${category.toLowerCase()} fee (fictional)`,
        payer: "UNKNOWN", billedAmountCents, knownBenefitCents: null, patientResponsibilityCents: null,
        sourceEmailId: inboundId, sourceDocumentId: documentId, sourceLocator: `Synthetic response fee list, item ${index + 1}`,
        isFictional: true,
      }));
      const extraItems = [
        costLineItemInput.parse({ id: `demo-line-${practice.slug}-excess`, category: "EXCESS", description: "Fictional DemoCover policy excess", payer: "PATIENT", billedAmountCents: 50000, knownBenefitCents: null, patientResponsibilityCents: 50000, sourceEmailId: inboundId, sourceDocumentId: documentId, sourceLocator: "Synthetic response, excess sentence", isFictional: true }),
        costLineItemInput.parse({ id: `demo-line-${practice.slug}-copayment`, category: "CO_PAYMENT", description: "Fictional co-payment", payer: "PATIENT", billedAmountCents: complete ? 0 : null, knownBenefitCents: null, patientResponsibilityCents: complete ? 0 : null, sourceEmailId: inboundId, sourceDocumentId: documentId, sourceLocator: "Synthetic response, co-payment sentence", isFictional: true }),
        costLineItemInput.parse({ id: `demo-line-${practice.slug}-medicare`, category: "MEDICARE_BENEFIT", description: "Fictional Medicare benefit for this scenario; not an MBS schedule fee", payer: "MEDICARE", billedAmountCents: null, knownBenefitCents: complete ? 100000 : null, patientResponsibilityCents: null, sourceEmailId: inboundId, sourceDocumentId: documentId, sourceLocator: "Synthetic response, benefit sentence", isFictional: true }),
        costLineItemInput.parse({ id: `demo-line-${practice.slug}-insurer`, category: "INSURER_BENEFIT", description: "Fictional DemoCover benefit for this scenario", payer: "INSURER", billedAmountCents: null, knownBenefitCents: complete ? 300000 : null, patientResponsibilityCents: null, sourceEmailId: inboundId, sourceDocumentId: documentId, sourceLocator: "Synthetic response, benefit sentence", isFictional: true }),
      ];
      const { lineItems, ...quote } = quoteInput.parse({
        id: practice.quoteId, caseId: DEMO_CASE_ID, providerId: practice.id,
        sourceEmailId: inboundId, sourceDocumentId: documentId, revisionOfId: null, revisionNumber: 1,
        procedureName: "Clinician-confirmed cataract procedure for one eye", issueDate: at(practice.issueDay), expiryDate: at(31),
        completeness: practice.completeness, confirmationStatus: "PROVIDER_STATED",
        isFictional: true, notes: complete ? "All amounts and insurance confirmation are fictional scenario fixtures, not actual cover or Medicare entitlement." : "Fictional quote is missing anaesthetist and facility fees.",
        lineItems: [...feeItems, ...extraItems],
      });
      await tx.quote.create({ data: { ...quote, scopeConfirmedAt: at(7), scopeEvidenceNote: "Fictional clinician-confirmed left-eye scope for comparison demo only." } });
      await tx.costLineItem.createMany({ data: lineItems.map((lineItem) => ({ ...lineItem, quoteId: practice.quoteId })) });
      const extracted = quoteExtractionSchema.parse({
        messageKind: complete ? "QUOTE" : "PARTIAL_QUOTE",
        provider: { identity: practice.practiceName, procedureOffered: true, facility: practice.hospitalId === hospitalIds[0] ? "Demo Harbour Day Hospital" : "Demo Central Surgical Centre", consultationRequired: null, validityDays: 31 - practice.issueDay },
        mbsItemNumbers: ["42702"],
        fees: practice.feeLines.map(([category, value]) => ({ category: category === "DEVICES" ? "DEVICE" : category === "MEDICINES" ? "MEDICINE" : category, description: `${category.toLowerCase()} fee (fictional)`, billedAmountCents: value, payer: "UNKNOWN", includedInTotal: value === null ? null : true, evidence: `${category.toLowerCase()}: ${money(value)}` })),
        benefits: { medicareCents: complete ? 100000 : null, privateInsurerCents: complete ? 300000 : null },
        insurance: { gapCoverStatus: practice.slug === "north" ? "NOT_STATED" : complete ? "KNOWN_GAP" : "NOT_STATED", excessCents: 50000, coPaymentCents: complete ? 0 : null, expectedPatientOutOfPocketCents: patientGap, coverageConfirmation: complete ? "INSURER_CONFIRMED" : "NOT_CONFIRMED" },
        totalFeesCents: total, feeNature: "ESTIMATE", includedComponents: complete ? ["Surgeon", "Anaesthetist", "Hospital", "Theatre", "Accommodation", "Device", "Medicines"] : ["Surgeon"],
        excludedComponents: [], missingFees: complete ? [] : ["Anaesthetist fee", "Hospital and facility charges", "Medicare benefit", "Insurer benefit", "Patient out-of-pocket amount"],
        conditions: ["Fictional scenario only", "MBS item 42702 is illustrative"], evidence: [{ fieldPath: "fees", excerpt: feeSummary }, ...(complete ? [{ fieldPath: "insurance.expectedPatientOutOfPocketCents", excerpt: `expected patient out-of-pocket ${money(patientGap)}, including the excess` }] : [])],
        confidence: complete ? "HIGH" : "MEDIUM", humanReviewFlags: [], arithmeticDeclaredFeeTotalCents: total,
      });
      await tx.quoteExtraction.create({ data: { emailMessageId: inboundId, quoteId: practice.quoteId, providerMode: "MOCK_AI", status: "COMPLETE", resultJson: JSON.stringify(extracted) } });
    }

    await tx.caseProviderSelection.createMany({ data: providerIds.map((providerId) => ({ caseId: DEMO_CASE_ID, providerId, selectedAt: at(7, 10) })) });

    await tx.opportunity.createMany({ data: [
      { id: "demo-opportunity-itemisation", quoteId: quoteIds[2], sourceReferenceId: IFC_SOURCE_ID, type: "ITEMISATION", title: "Ask for missing fee details", supportingEvidence: "Fictional City response omits anaesthetist and facility amounts. Ask for a written itemised estimate.", confidence: "HIGH", isFictional: true },
      { id: "demo-opportunity-gap", quoteId: quoteIds[1], sourceReferenceId: IFC_SOURCE_ID, type: "GAP_SCHEME", title: "Ask whether a reduced fee is possible", supportingEvidence: "Fictional Northside response has a larger confirmed synthetic patient gap; reductions are not guaranteed.", confidence: "MEDIUM", isFictional: true },
    ] });
    await tx.negotiation.create({ data: {
      id: "demo-negotiation-city", caseId: DEMO_CASE_ID, providerId: providerIds[2], originalQuoteId: quoteIds[2],
      revisedQuoteId: null, originalRequest: "Fictional draft: please clarify the fees and whether any gap arrangement applies. A revised quote may be considered after a response.",
      counteroffer: null, status: "DRAFT", agreedResult: null, agreedPatientAmountCents: null, isSimulation: true,
    } });
    await tx.negotiationRequest.create({ data: { negotiationId: "demo-negotiation-city", caseId: DEMO_CASE_ID, providerId: providerIds[2], version: 1,
      recipientEmail: practices[2].email, subject: "Fictional clarification of missing quote fees", draftBody: "Fictional draft: please clarify the anaesthetist and hospital fees and whether any gap arrangement applies. Please provide a complete written estimate before we rely on a patient amount.",
      reason: "Clarify missing itemised costs", originalPatientGapCents: null, informationDisclosedJson: JSON.stringify(["Fictional procedure", "Missing quoted fee categories"]), supportingDocumentsJson: "[]" } });
    await tx.auditEvent.createMany({ data: [
      { id: "demo-audit-consent", caseId: DEMO_CASE_ID, patientProfileId: DEMO_PATIENT_ID, action: "CONSENT_GRANTED", actor: "PATIENT", eventKey: "demo-consent-20261007", detailsJson: JSON.stringify({ synthetic: true, scope: "demo-only" }), occurredAt: at(7, 9) },
      { id: "demo-audit-case", caseId: DEMO_CASE_ID, patientProfileId: DEMO_PATIENT_ID, action: "CASE_CREATED", actor: "SYSTEM", eventKey: "demo-case-created", detailsJson: JSON.stringify({ synthetic: true }), occurredAt: at(7, 9) },
      ...practices.flatMap((practice) => [
        { id: `demo-audit-approval-${practice.slug}`, caseId: DEMO_CASE_ID, patientProfileId: DEMO_PATIENT_ID, quoteRequestId: `demo-request-${practice.slug}`, action: "REQUEST_APPROVED" as const, actor: "PATIENT" as const, eventKey: `demo-request-approved-${practice.slug}`, detailsJson: JSON.stringify({ synthetic: true, recipient: practice.email }), occurredAt: at(7, 10) },
        { id: `demo-audit-send-${practice.slug}`, caseId: DEMO_CASE_ID, emailMessageId: `demo-email-out-${practice.slug}`, action: "MESSAGE_SENT" as const, actor: "SYSTEM" as const, eventKey: `demo-message-sent-${practice.slug}`, detailsJson: JSON.stringify({ simulated: true }), occurredAt: at(7, 11) },
        { id: `demo-audit-quote-${practice.slug}`, caseId: DEMO_CASE_ID, action: "QUOTE_ADDED" as const, actor: "SYSTEM" as const, eventKey: `demo-quote-added-${practice.slug}`, detailsJson: JSON.stringify({ synthetic: true, quoteId: practice.quoteId }), occurredAt: at(practice.issueDay, 14) },
      ]),
    ] });
  }, { timeout: 60_000 });
  return { caseId: DEMO_CASE_ID, patientCount: 1, providerCount: 3, quoteCount: 3, incompleteQuoteCount: 1 };
}
