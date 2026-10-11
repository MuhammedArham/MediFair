import { createTestDatabaseClient } from "../db/test-client";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedDemoData } from "../../../prisma/demo-data";
import { type DatabaseClient } from "../db/client";
import { ingestInboundEmail } from "../db/inbound-email";
import { saveQuoteCorrection } from "../db/quote-extraction";
import { mockQuoteFixtures } from "../ai/mock-quote-fixtures";
import { confirmQuoteEvidence, missingInformationDraft, saveMissingInformationDraft, startQuoteNegotiation } from "./follow-up";
import { loadComparison } from "./data";

let directory: string;
let db: DatabaseClient;
const migrations = ["20261011014245_init", "20261011015035_persistence", "20261011020119_onboarding", "20261011021809_provider_selection", "20261011023806_outbound_sends", "20261011061336_mock_inbound_email", "20261011061900_correct_simulated_delivery_state", "20261011063249_email_sender_recipient", "20261011063500_backfill_demo_inbox_metadata", "20261011064730_quote_extraction", "20261011070140_quote_comparison", "20261011071437_document_analysis", "20261011071857_document_review_note", "20261011072307_bill_negotiation_link", "20261011073215_cost_review_engine", "20261011074850_negotiation_workflow", "20261011110217_negotiation_recipient_verification"];

beforeAll(async () => {
  process.env.DEMO_MODE = "true";
  process.env.EMAIL_TRANSPORT = "mock";
  process.env.AI_PROVIDER = "mock";
  directory = await mkdtemp(join(tmpdir(), "medifair-comparison-"));
  const file = join(directory, "test.db");
  const raw = new Database(file);
  try { for (const migration of migrations) raw.exec(await readFile(join(process.cwd(), "prisma", "migrations", migration, "migration.sql"), "utf8")); }
  finally { raw.close(); }
  db = createTestDatabaseClient(`file:${file}`);
});
beforeEach(async () => { await seedDemoData(db); });
afterAll(async () => { await db?.$disconnect(); if (directory) await rm(directory, { recursive: true, force: true }); });

const incoming = (id: string, receivedAt: string) => ({
  providerMessageId: id, from: "quotes@harbour-eye.example", to: ["replies@mock.invalid"], receivedFor: [],
  subject: "Revised fictional written quote", text: mockQuoteFixtures.find((fixture) => fixture.id === "complete-clear")!.body,
  html: null, receivedAt: new Date(receivedAt), headers: { "x-medifair-thread-id": "demo-thread-harbour" }, attachments: [],
});

describe("comparison database workflow", () => {
  it("loads two complete mock quotes, excludes the missing-fee quote, and ranks only complete costs", async () => {
    const data = await loadComparison("demo-case", db);
    expect(data?.groups).toHaveLength(3);
    expect(data?.groups.map((group) => [group.current.quote.providerId, group.current.result.quotedPatientCostCents])).toEqual([
      ["demo-provider-city", null], ["demo-provider-harbour", 240000], ["demo-provider-north", 180000],
    ]);
  });
  it("preserves versions and uses source chronology when replies arrive out of order", async () => {
    await ingestInboundEmail(incoming("late-newer-001", "2026-10-15T10:00:00Z"), { eventId: "late-newer-event", simulated: true, client: db });
    await ingestInboundEmail(incoming("late-older-002", "2026-10-12T10:00:00Z"), { eventId: "late-older-event", simulated: true, client: db });
    const group = (await loadComparison("demo-case", db))!.groups.find((item) => item.current.quote.providerId === "demo-provider-harbour")!;
    expect(group.versions).toHaveLength(3);
    expect(group.current.quote.issueDate.toISOString()).toBe("2026-10-15T10:00:00.000Z");
    expect(group.current.quote.revisionNumber).toBe(2);
    expect(group.versions[1].quote.revisionNumber).toBe(3);
    expect(group.current.result.rankable).toBe(false); // Newer fixture does not state insurer benefits.
  });
  it("recalculates after a manual correction while preserving original extraction", async () => {
    await confirmQuoteEvidence("demo-quote-harbour", "FINANCIAL", "Checked synthetic email against fictional written estimate.", db);
    const before = await db.quoteExtraction.findUniqueOrThrow({ where: { emailMessageId: "demo-email-in-harbour" } });
    const corrected = JSON.parse(before.resultJson!);
    corrected.fees[0].billedAmountCents += 10000;
    corrected.totalFeesCents += 10000;
    corrected.arithmeticDeclaredFeeTotalCents += 10000;
    corrected.insurance.expectedPatientOutOfPocketCents += 10000;
    await saveQuoteCorrection("demo-email-in-harbour", corrected, db);
    const after = await db.quoteExtraction.findUniqueOrThrow({ where: { emailMessageId: "demo-email-in-harbour" } });
    expect(after.resultJson).toBe(before.resultJson);
    expect(after.reviewedResultJson).not.toBeNull();
    const current = (await loadComparison("demo-case", db))!.groups.find((item) => item.current.quote.providerId === "demo-provider-harbour")!.current;
    expect(current.result.quotedPatientCostCents).toBe(250000);
    expect(current.quote.financialEvidenceConfirmedAt).toBeNull();
  });
  it("does not compare a different procedure even when it has the same prices", async () => {
    await db.quote.update({ where: { id: "demo-quote-north" }, data: { procedureName: "Different procedure" } });
    const north = (await loadComparison("demo-case", db))!.groups.find((group) => group.current.quote.id === "demo-quote-north")!.current;
    expect(north.result.status).toBe("SCOPE_NOT_CONFIRMED");
    expect(north.result.rankable).toBe(false);
  });
  it("records human evidence separately from insurer verification and saves an unsent follow-up", async () => {
    await confirmQuoteEvidence("demo-quote-city", "FINANCIAL", "Checked the fictional source email on 11 October.", db);
    const city = await db.quote.findUniqueOrThrow({ where: { id: "demo-quote-city" } });
    expect(city.confirmationStatus).toBe("PATIENT_VERIFIED");
    expect((await loadComparison("demo-case", db))!.groups.find((group) => group.current.quote.id === city.id)!.current.result.rankable).toBe(false);
    const draft = missingInformationDraft("Demo City Cataract Rooms", city.procedureName, ["Anaesthetist fee"], []);
    const saved = await saveMissingInformationDraft(city.id, draft, db);
    expect(saved.status).toBe("DRAFT");
    expect(await db.emailMessage.count({ where: { quoteRequestId: saved.id } })).toBe(0);
    const negotiation = await startQuoteNegotiation(city.id, db);
    expect(negotiation.status).toBe("DRAFT");
    expect(negotiation.originalQuoteId).toBe(city.id);
  });
});
