import { createTestDatabaseClient } from "../db/test-client";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDemoData } from "../../../prisma/demo-data";
import { type DatabaseClient } from "../db/client";
import { compareBills } from "./compare";
import { mockDocumentFixtures } from "./mock-fixtures";
import { extractPdfPages, readPrivatePdf, validatePdfUpload } from "./pdf-storage";
import { MockDocumentProvider } from "./provider";
import { validateEvidence } from "./schema";
import { analyseSelectedDocuments, createBillReviewOpportunity, deleteStoredDocument, downloadStoredDocument, effectiveDocumentResult, saveDocumentCorrection, seedSyntheticDocuments, startBillNegotiation, uploadPdfDocument } from "./service";

const migrations = ["20261011014245_init", "20261011015035_persistence", "20261011020119_onboarding", "20261011021809_provider_selection", "20261011023806_outbound_sends", "20261011061336_mock_inbound_email", "20261011061900_correct_simulated_delivery_state", "20261011063249_email_sender_recipient", "20261011063500_backfill_demo_inbox_metadata", "20261011064730_quote_extraction", "20261011070140_quote_comparison", "20261011071437_document_analysis", "20261011071857_document_review_note", "20261011072307_bill_negotiation_link", "20261011073215_cost_review_engine", "20261011074850_negotiation_workflow", "20261011110217_negotiation_recipient_verification"];
let directory: string;
let db: DatabaseClient;
const fixtureFile = (id: string) => join(process.cwd(), "output", "pdf", mockDocumentFixtures.find((fixture) => fixture.id === id)!.fileName);
const upload = (bytes: Uint8Array, fileName = "synthetic-original-estimate.pdf") => uploadPdfDocument({ caseId: "demo-case", providerId: "demo-provider-harbour", documentType: "SPECIALIST_ESTIMATE", fileName, mimeType: "application/pdf", attestSynthetic: true, bytes }, db);

beforeAll(async () => {
  process.env.DEMO_MODE = "true";
  process.env.AI_PROVIDER = "mock";
  directory = await mkdtemp(join(tmpdir(), "medifair-documents-test-"));
  process.env.DOCUMENT_STORAGE_DIR = join(directory, "private");
  const file = join(directory, "test.db");
  const raw = new Database(file);
  try { for (const migration of migrations) raw.exec(await readFile(join(process.cwd(), "prisma", "migrations", migration, "migration.sql"), "utf8")); }
  finally { raw.close(); }
  db = createTestDatabaseClient(`file:${file}`);
  await seedDemoData(db);
});
afterAll(async () => { await db?.$disconnect(); if (directory) await rm(directory, { recursive: true, force: true }); delete process.env.DOCUMENT_STORAGE_DIR; });

describe("private synthetic PDF intake and bill review", () => {
  it("accepts the five valid fixture PDFs and maps all evidence to extracted pages", async () => {
    const records = await seedSyntheticDocuments("demo-case", db);
    expect(records).toHaveLength(5);
    expect(records.every((record) => record.analysis?.status === "COMPLETE" && record.analysis.providerMode === "MOCK_AI")).toBe(true);
    for (const record of records) {
      const pages = JSON.parse(record.analysis!.pageTextJson!);
      const result = effectiveDocumentResult(record.analysis)!;
      expect(validateEvidence(result, pages)).toEqual([]);
      const downloaded = await downloadStoredDocument(record.id, db);
      expect(downloaded.bytes.byteLength).toBeGreaterThan(100);
      expect(downloaded.document.fileName).toContain("synthetic");
    }
    expect(await seedSyntheticDocuments("demo-case", db)).toHaveLength(5);
    expect(await db.document.count({ where: { caseId: "demo-case", storageKey: { not: null } } })).toBe(5);
  });
  it("rejects empty, unsupported and damaged files before storage", async () => {
    expect(() => validatePdfUpload("empty.pdf", "application/pdf", new Uint8Array())).toThrow("empty");
    const bytes = await readFile(fixtureFile("original"));
    expect(() => validatePdfUpload("quote.png", "image/png", bytes)).toThrow("Only PDF");
    await expect(upload(Buffer.from("%PDF-1.4\nbroken"), "damaged.pdf")).rejects.toThrow("could not be read");
    expect(await db.document.count({ where: { fileName: "damaged.pdf" } })).toBe(0);
  });
  it("marks readable unfamiliar and unreadable PDFs for manual entry without fabricating amounts", async () => {
    const original = await readFile(fixtureFile("original"));
    const modified = Buffer.from(original.toString("latin1").replace("DOC-ORIGINAL", "DOC-ALTERED!"), "latin1");
    const unfamiliar = await upload(modified, "synthetic-modified-estimate.pdf");
    expect(unfamiliar.analysis?.status).toBe("MANUAL_REVIEW");
    expect(unfamiliar.analysis?.resultJson).toBeNull();
    const noText = await new MockDocumentProvider().interpret({ bytes: Buffer.from("%PDF-1.4"), pages: [{ page: 1, text: "" }], isFictional: true });
    expect(noText.status).toBe("MANUAL_REVIEW");
    expect(noText.result).toBeNull();
  });
  it("compares revised, invoice and insurer documents without double subtracting payments", async () => {
    const records = await seedSyntheticDocuments("demo-case", db);
    const pick = (name: string) => records.find((record) => record.fileName.includes(name))!.id;
    const selected = { previous: pick("original"), revised: pick("revised"), invoice: pick("final"), statement: pick("insurer") };
    const result = await analyseSelectedDocuments("demo-case", selected, db);
    expect(result.comparison.issues.some((issue) => issue.kind === "ADDED_CHARGE" && issue.deltaCents === 70000)).toBe(true);
    expect(result.comparison.issues.some((issue) => issue.kind === "MISSING_PAYMENT" && issue.deltaCents === 300000)).toBe(true);
    const opportunity = await createBillReviewOpportunity("demo-case", selected, result.comparison.issues.findIndex((issue) => issue.kind === "ADDED_CHARGE"), db);
    expect(opportunity.primaryDocumentId).toBe(selected.invoice);
    const negotiation = await startBillNegotiation(opportunity.id, db);
    expect(negotiation.status).toBe("DRAFT");
    expect(negotiation.originalRequest).toContain("Please clarify");
    expect(await startBillNegotiation(opportunity.id, db)).toMatchObject({ id: negotiation.id });
  });
  it("preserves source extraction when a patient corrects a value and flags unsupported evidence", async () => {
    const records = await seedSyntheticDocuments("demo-case", db);
    const original = records.find((record) => record.fileName.includes("original"))!;
    const before = original.analysis!.resultJson;
    const corrected = structuredClone(effectiveDocumentResult(original.analysis)!);
    corrected.lineItems[0].amountCents = 220000;
    const saved = await saveDocumentCorrection(original.id, corrected, "Checked the fictional PDF and manually changed this figure.", db);
    expect(saved.resultJson).toBe(before);
    expect(effectiveDocumentResult(saved)?.lineItems[0].amountCents).toBe(220000);
    corrected.lineItems[0].evidence = "This text was not in the source PDF";
    const flagged = await saveDocumentCorrection(original.id, corrected, "Human review needed for this fictional source line.", db);
    expect(flagged.status).toBe("MANUAL_REVIEW");
    expect(flagged.errorSummary).toContain("evidence needs review");
  });
  it("deletes the private file and metadata and retains an audit event", async () => {
    const bytes = await readFile(fixtureFile("inconsistent"));
    const record = await upload(bytes, "synthetic-delete-check.pdf");
    const key = record.storageKey!;
    await deleteStoredDocument(record.id, db);
    expect(await db.document.findUnique({ where: { id: record.id } })).toBeNull();
    await expect(readPrivatePdf(key)).rejects.toThrow();
    expect(await db.auditEvent.count({ where: { action: "DOCUMENT_DELETED" } })).toBeGreaterThan(0);
  });
  it("reports missing amounts, arithmetic and potential duplicates deterministically", async () => {
    const fixture = mockDocumentFixtures.find((item) => item.id === "inconsistent")!;
    const result = { ...fixture.result, lineItems: [...fixture.result.lineItems, { ...fixture.result.lineItems[0] }] };
    const issues = compareBills({ previous: null, revised: null, invoice: { id: "test", label: "Synthetic", result }, statement: null }).issues;
    expect(issues.some((issue) => issue.kind === "ARITHMETIC")).toBe(true);
    expect(issues.some((issue) => issue.kind === "POTENTIAL_DUPLICATE")).toBe(true);
    const pages = await extractPdfPages(await readFile(fixtureFile("inconsistent")));
    expect(pages[0].text).toContain("Total provider fees: $3,000.00");
  });
});
