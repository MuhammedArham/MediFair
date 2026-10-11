import { createTestDatabaseClient } from "./test-client";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDemoData, resetDemoData, DEMO_CASE_ID, DEMO_PATIENT_ID } from "../../../prisma/demo-data";
import { fictionalCataractExample } from "../onboarding";
import { getEditableOnboardingCase, saveOnboardingCase } from "./onboarding";
import { addManualPractice, listCandidatePractices, saveSelectedPractices, updateManualPractice } from "./provider-selection";
import { approveSelectedQuoteDraft, rejectSelectedQuoteDraft, saveSelectedQuoteDraft } from "./quote-drafts";
import { type DatabaseClient } from "./client";
import { approveQuoteRequest, createQuote, createQuoteRequestDraft, listAuditEvents, recordEmailEvent, recordEmailMessage, updateNegotiation } from "./repository";
import { cents, patientInput } from "./validation";
import { ingestInboundEmail } from "./inbound-email";
import { mockQuoteFixtures } from "../ai/mock-quote-fixtures";

let directory: string;
let db: DatabaseClient;

beforeAll(async () => {
  process.env.DEMO_MODE = "true";
  directory = await mkdtemp(join(tmpdir(), "medifair-db-test-"));
  const file = join(directory, "test.db");
  const raw = new Database(file);
  try {
    for (const migration of ["20261011014245_init", "20261011015035_persistence", "20261011020119_onboarding", "20261011021809_provider_selection", "20261011023806_outbound_sends", "20261011061336_mock_inbound_email", "20261011061900_correct_simulated_delivery_state", "20261011063249_email_sender_recipient", "20261011063500_backfill_demo_inbox_metadata", "20261011064730_quote_extraction", "20261011070140_quote_comparison", "20261011071437_document_analysis", "20261011071857_document_review_note", "20261011072307_bill_negotiation_link", "20261011073215_cost_review_engine", "20261011074850_negotiation_workflow", "20261011110217_negotiation_recipient_verification"]) {
      const sql = await readFile(join(process.cwd(), "prisma", "migrations", migration, "migration.sql"), "utf8");
      raw.exec(sql);
    }
  } finally {
    raw.close();
  }
  db = createTestDatabaseClient(`file:${file}`);
});

afterAll(async () => {
  await db?.$disconnect();
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe("synthetic SQLite persistence", () => {
  it("runs simulated inbound replies through the shared extraction and evidence persistence path", async () => {
    await db.emailMessage.deleteMany({ where: { externalMessageId: "integration-fixture-inbound-001" } });
    await seedDemoData(db);
    process.env.AI_PROVIDER = "mock";
    process.env.EMAIL_TRANSPORT = "mock";
    const fixture = mockQuoteFixtures.find((item) => item.id === "complete-clear")!;
    const result = await ingestInboundEmail({
      providerMessageId: "integration-fixture-inbound-001", from: "quotes@harbour-eye.example", to: ["replies@mock.invalid"], receivedFor: [],
      subject: "Synthetic quote response", text: fixture.body, html: null, receivedAt: new Date("2026-10-12T03:00:00Z"),
      headers: { "x-medifair-thread-id": "demo-thread-harbour" }, attachments: [],
    }, { eventId: "integration-fixture-event-001", simulated: true, client: db });
    expect(result.status).toBe("MATCHED");
    expect(result.extractionStatus).toBe("COMPLETE");
    const saved = await db.quoteExtraction.findUniqueOrThrow({ where: { emailMessageId: result.emailMessageId! }, include: { evidence: true, quote: { include: { lineItems: true } }, emailMessage: true } });
    expect(saved.providerMode).toBe("MOCK_AI");
    expect(saved.emailMessage.body).toContain(fixture.body);
    expect(saved.evidence.length).toBeGreaterThan(0);
    expect(saved.quote?.lineItems.some((line) => line.billedAmountCents === 210000)).toBe(true);
    expect(saved.quote?.lineItems.find((line) => line.category === "MEDICARE_BENEFIT")).toBeUndefined();
    const duplicate = await ingestInboundEmail({
      providerMessageId: "integration-fixture-inbound-001", from: "quotes@harbour-eye.example", to: ["replies@mock.invalid"], receivedFor: [],
      subject: "Synthetic quote response", text: fixture.body, html: null, receivedAt: new Date("2026-10-12T03:00:00Z"),
      headers: { "x-medifair-thread-id": "demo-thread-harbour" }, attachments: [],
    }, { eventId: "integration-fixture-event-001", simulated: true, client: db });
    expect(duplicate.status).toBe("DUPLICATE");
    expect(await db.quoteExtraction.count({ where: { emailMessageId: result.emailMessageId! } })).toBe(1);
  }, 15_000);

  it("seeds three fictional quotes and preserves unknown costs as null", async () => {
    const result = await seedDemoData(db);
    expect(result).toMatchObject({ providerCount: 3, quoteCount: 3, incompleteQuoteCount: 1 });
    const quote = await db.quote.findUniqueOrThrow({ where: { id: "demo-quote-city" }, include: { lineItems: true } });
    expect(quote.isFictional).toBe(true);
    expect(quote.completeness).toBe("INCOMPLETE");
    expect(quote.lineItems.find((item) => item.category === "ANAESTHETIST")?.billedAmountCents).toBeNull();
    expect(quote.lineItems.find((item) => item.category === "INSURER_BENEFIT")?.knownBenefitCents).toBeNull();
    expect(quote.lineItems.every((item) => item.patientResponsibilityCents === null || item.category === "EXCESS")).toBe(true);
    const caseRecord = await db.case.findUniqueOrThrow({ where: { id: DEMO_CASE_ID }, include: { sourceReference: true } });
    expect(caseRecord.mbsItemNumber).toBe("42702");
    expect(caseRecord.mbsItemStatus).toBe("ILLUSTRATIVE");
    expect(caseRecord.sourceReference?.isOfficial).toBe(true);
    expect(caseRecord.sourceReference?.url).toContain("q=42702");
    expect(await db.caseProviderSelection.count({ where: { caseId: DEMO_CASE_ID } })).toBe(3);
  });

  it("rejects unsupported amounts and non-fictional profile input", () => {
    expect(cents.safeParse(null).success).toBe(true);
    expect(cents.safeParse(-1).success).toBe(false);
    expect(patientInput.safeParse({ displayName: "Real patient", isFictional: false, consentGivenAt: new Date(), consentScope: "demo" }).success).toBe(false);
  });

  it("versions edited approvals and records separate rejection decisions without sending", async () => {
    const providerId = "demo-provider-north";
    const first = await saveSelectedQuoteDraft(DEMO_CASE_ID, providerId, { subject: "Synthetic cost enquiry", body: "Please provide a written itemised quote for the synthetic case, including separate doctor and facility fees, if possible." }, db);
    expect(first.requestVersion).toBe(2);
    const approved = await approveSelectedQuoteDraft(DEMO_CASE_ID, providerId, first.id, db);
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedContentHash).toHaveLength(64);
    const revised = await saveSelectedQuoteDraft(DEMO_CASE_ID, providerId, { subject: first.subject, body: `${first.body} Please confirm quote expiry.` }, db);
    expect(revised.requestVersion).toBe(3);
    expect(revised.status).toBe("DRAFT");
    await expect(approveSelectedQuoteDraft(DEMO_CASE_ID, providerId, first.id, db)).rejects.toThrow("current exact draft");
    const rejected = await rejectSelectedQuoteDraft(DEMO_CASE_ID, providerId, revised.id, db);
    expect(rejected.status).toBe("REJECTED");
    const events = await listAuditEvents(DEMO_CASE_ID, db);
    expect(events.some((event) => event.action === "REQUEST_DRAFTED" && event.quoteRequestId === revised.id)).toBe(true);
    expect(events.some((event) => event.action === "REQUEST_REJECTED" && event.quoteRequestId === revised.id)).toBe(true);
    expect(await db.emailMessage.count({ where: { quoteRequestId: revised.id } })).toBe(0);
  });

  it("enforces exact approval before recording simulated outbound email", async () => {
    const draft = await createQuoteRequestDraft({
      caseId: DEMO_CASE_ID, providerId: "demo-provider-harbour", requestVersion: 2,
      recipientEmail: "quotes@harbour-eye.example", subject: "Synthetic follow-up", body: "Please clarify the fictional fee.", isSimulation: true,
    }, db);
    const message = {
      caseId: DEMO_CASE_ID, providerId: draft.providerId, quoteRequestId: draft.id,
      direction: "OUTBOUND", subject: draft.subject, body: draft.body, externalMessageId: "test-outbound-2",
      threadId: "test-thread-2", deliveryStatus: "DRAFT", sentAt: null, receivedAt: null, isSimulation: true,
    };
    await expect(recordEmailMessage(message, db)).rejects.toThrow("exact approved request");
    const approved = await approveQuoteRequest(draft.id, DEMO_PATIENT_ID, db);
    expect(approved.approvedContentHash).toHaveLength(64);
    await expect(recordEmailMessage({ ...message, body: "Changed after approval" }, db)).rejects.toThrow("exact approved request");
    const recorded = await recordEmailMessage(message, db);
    expect(recorded.externalMessageId).toBe("test-outbound-2");
    await expect(recordEmailMessage({ ...message, id: "duplicate-external" }, db)).rejects.toThrow();
    expect((await listAuditEvents(DEMO_CASE_ID, db)).some((event) => event.action === "REQUEST_APPROVED" && event.quoteRequestId === draft.id)).toBe(true);
  });

  it("deduplicates email events and resets only demo data", async () => {
    const input = { emailMessageId: "demo-email-in-harbour", providerEventId: "test-event-id", type: "RECEIVED", occurredAt: new Date("2026-10-08T13:00:00Z") };
    const first = await recordEmailEvent(input, db);
    expect((await recordEmailEvent(input, db)).id).toBe(first.id);
    await expect(recordEmailEvent({ ...input, type: "FAILED" }, db)).rejects.toThrow("collision");
    await seedDemoData(db);
    expect(await db.quote.count()).toBe(3);
    await resetDemoData(db);
    expect(await db.case.count()).toBe(0);
    expect(await db.emailMessage.count()).toBe(0);
    expect(await db.provider.count()).toBe(3); // Shared synthetic catalogue is preserved.
    await seedDemoData(db);
    expect(await db.quote.count()).toBe(3);
  });

  it("links a later revision to its original quote without inventing a gap", async () => {
    const revision = await createQuote({
      caseId: DEMO_CASE_ID, providerId: "demo-provider-city", sourceEmailId: null, sourceDocumentId: null,
      revisionOfId: "demo-quote-city", revisionNumber: 2,
      procedureName: "One-eye cataract procedure (fictional revision)", issueDate: new Date("2026-10-12T00:00:00Z"),
      expiryDate: null, completeness: "INCOMPLETE", confirmationStatus: "UNVERIFIED", isFictional: true,
      notes: "Fictional proposed revision; coverage still unknown.",
      lineItems: [{ category: "SURGEON", description: "Revised fictional surgeon fee", payer: "UNKNOWN", billedAmountCents: 220000,
        knownBenefitCents: null, patientResponsibilityCents: null, sourceEmailId: null, sourceDocumentId: null, sourceLocator: null, isFictional: true }],
    }, db);
    expect(revision.revisionOfId).toBe("demo-quote-city");
    expect(revision.lineItems[0].patientResponsibilityCents).toBeNull();
    const negotiation = await updateNegotiation("demo-negotiation-city", { revisedQuoteId: revision.id, status: "COUNTEROFFERED" }, db);
    expect(negotiation.revisedQuoteId).toBe(revision.id);
    await expect(createQuote({ caseId: DEMO_CASE_ID, providerId: "demo-provider-city", sourceEmailId: null, sourceDocumentId: null,
      revisionOfId: "demo-quote-city", revisionNumber: 2, procedureName: "Duplicate revision", issueDate: new Date("2026-10-12T00:00:00Z"),
      expiryDate: null, completeness: "INCOMPLETE", confirmationStatus: "UNVERIFIED", isFictional: true, notes: null,
      lineItems: [{ category: "SURGEON", description: "Fictional fee", payer: "UNKNOWN", billedAmountCents: null, knownBenefitCents: null,
        patientResponsibilityCents: null, sourceEmailId: null, sourceDocumentId: null, sourceLocator: null, isFictional: true }],
    }, db)).rejects.toThrow();
  });

  it("creates and edits a fictional onboarding draft with explicit consent", async () => {
    const values = { ...fictionalCataractExample, consent: true, demoAcknowledged: true };
    const id = await saveOnboardingCase(values, undefined, db);
    const saved = await db.case.findUniqueOrThrow({ where: { id }, include: { patientProfile: true, insuranceProfile: true, preference: true, auditEvents: true } });
    expect(saved.status).toBe("DRAFT");
    expect(saved.mbsItemStatus).toBe("CLINICIAN_CONFIRMED");
    expect(saved.sourceReferenceId).toBeNull();
    expect(saved.patientProfile.consentGivenAt).toBeInstanceOf(Date);
    expect(saved.insuranceProfile?.coverageVerificationStatus).toBe("UNVERIFIED");
    expect(saved.insuranceProfile?.knownExcessCents).toBe(50000);
    expect(saved.preference?.budgetCents).toBeNull();
    expect(saved.auditEvents.map((event) => event.action)).toContain("CONSENT_GRANTED");
    expect((await getEditableOnboardingCase(id, db))?.procedureName).toBe(values.procedureName);

    const edited = { ...values, procedureName: "Revised fictional cataract enquiry", budgetDollars: "1200.50", coverageVerification: "CONFIRMED" as const };
    expect(await saveOnboardingCase(edited, id, db)).toBe(id);
    const after = await db.case.findUniqueOrThrow({ where: { id }, include: { insuranceProfile: true, preference: true, auditEvents: true } });
    expect(after.procedureName).toBe(edited.procedureName);
    expect(after.preference?.budgetCents).toBe(120050);
    expect(after.insuranceProfile?.coverageVerificationStatus).toBe("PATIENT_REPORTED_CONFIRMED");
    expect(after.auditEvents.map((event) => event.action)).toContain("CASE_UPDATED");
    await expect(saveOnboardingCase(edited, DEMO_CASE_ID, db)).rejects.toThrow("untouched fictional draft");
  });

  it("saves and edits a case shortlist while isolating user-supplied contacts", async () => {
    const manual = {
      practiceName: "User supplied test practice", email: "quotes@synthetic-medifair.au",
      websiteUrl: "https://synthetic-medifair.au", suburb: "Sydney", state: "NSW", postcode: "2000",
      contactSource: "Checked directly with the practice for a test case", contactSourceUrl: "",
      reportedHospitalName: "", verifiedContact: true,
    };
    const provider = await addManualPractice(DEMO_CASE_ID, manual, db);
    expect(provider.sourceType).toBe("VERIFIED_EXTERNAL");
    expect(provider.isFictional).toBe(false);
    expect(provider.verifiedByUserAt).toBeInstanceOf(Date);
    expect((await listCandidatePractices(DEMO_CASE_ID, db)).providers).toHaveLength(4);
    await expect(saveSelectedPractices(DEMO_CASE_ID, ["demo-provider-harbour", "demo-provider-north", "demo-provider-city", provider.id], db)).rejects.toThrow();
    expect(await saveSelectedPractices(DEMO_CASE_ID, ["demo-provider-harbour", provider.id], db)).toHaveLength(2);
    expect((await listCandidatePractices(DEMO_CASE_ID, db)).selectedIds.sort()).toEqual(["demo-provider-harbour", provider.id].sort());

    await expect(updateManualPractice(DEMO_CASE_ID, provider.id, { ...manual, email: "bad" }, db)).rejects.toThrow();
    const updated = await updateManualPractice(DEMO_CASE_ID, provider.id, { ...manual, email: "quotes+updated@synthetic-medifair.au" }, db);
    expect(updated.email).toBe("quotes+updated@synthetic-medifair.au");
    expect((await listCandidatePractices(DEMO_CASE_ID, db)).selectedIds).toContain(provider.id);

    const otherCaseId = await saveOnboardingCase({ ...fictionalCataractExample, consent: true, demoAcknowledged: true }, undefined, db);
    await expect(saveSelectedPractices(otherCaseId, [provider.id], db)).rejects.toThrow("cannot be selected");
    await expect(updateManualPractice(otherCaseId, provider.id, manual, db)).rejects.toThrow("for this case");
    expect((await listCandidatePractices(otherCaseId, db)).providers.every((item) => item.sourceType === "DEMO")).toBe(true);

    const owned = await addManualPractice(otherCaseId, { ...manual, email: "another@synthetic-medifair.au", practiceName: "Another user-supplied test practice" }, db);
    await saveSelectedPractices(otherCaseId, [owned.id], db);
    await saveOnboardingCase({ ...fictionalCataractExample, procedureName: "Fictional knee procedure", medicalSpecialty: "Orthopaedics", consent: true, demoAcknowledged: true }, otherCaseId, db);
    expect((await listCandidatePractices(otherCaseId, db)).selectedIds).toHaveLength(0);
    await expect(saveSelectedPractices(otherCaseId, [owned.id], db)).rejects.toThrow("cannot be selected");
    await updateManualPractice(otherCaseId, owned.id, { ...manual, email: "another@synthetic-medifair.au", practiceName: "Another user-supplied test practice" }, db);
    expect(await saveSelectedPractices(otherCaseId, [owned.id], db)).toEqual([owned.id]);
  });
  it("resets the sample without deleting another case or its shared practice selection", async () => {
    const other = await saveOnboardingCase({ ...fictionalCataractExample, consent: true, demoAcknowledged: true }, undefined, db);
    await saveSelectedPractices(other, ["demo-provider-north"], db);
    const draft = await createQuoteRequestDraft({ caseId: other, providerId: "demo-provider-north", requestVersion: 1, recipientEmail: "quotes@northside-eye.example", subject: "Fictional preserved request", body: "Please preserve this unrelated fictional case request.", isSimulation: true }, db);
    await seedDemoData(db);
    expect(await db.case.findUnique({ where: { id: other } })).not.toBeNull();
    expect(await db.quoteRequest.findUnique({ where: { id: draft.id } })).not.toBeNull();
    expect(await db.caseProviderSelection.count({ where: { caseId: other, providerId: "demo-provider-north" } })).toBe(1);
    expect(await db.quote.count({ where: { caseId: DEMO_CASE_ID } })).toBe(3);
  });

});
