import { createTestDatabaseClient } from "../db/test-client";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDemoData } from "../../../prisma/demo-data";
import { type DatabaseClient } from "../db/client";
import { seedSyntheticDocuments } from "../documents/service";
import { generateReviewRequest, loadReviewPage, recordCaseComplaint, resolveCaseComplaint, saveReviewPreferences, saveReviewRequest, updateReviewOpportunityStatus } from "./service";

const migrations = ["20261011014245_init", "20261011015035_persistence", "20261011020119_onboarding", "20261011021809_provider_selection", "20261011023806_outbound_sends", "20261011061336_mock_inbound_email", "20261011061900_correct_simulated_delivery_state", "20261011063249_email_sender_recipient", "20261011063500_backfill_demo_inbox_metadata", "20261011064730_quote_extraction", "20261011070140_quote_comparison", "20261011071437_document_analysis", "20261011071857_document_review_note", "20261011072307_bill_negotiation_link", "20261011073215_cost_review_engine", "20261011074850_negotiation_workflow", "20261011110217_negotiation_recipient_verification"];
let directory: string; let db: DatabaseClient;
beforeAll(async () => { process.env.DEMO_MODE = "true"; process.env.AI_PROVIDER = "mock"; directory = await mkdtemp(join(tmpdir(), "medifair-review-test-")); process.env.DOCUMENT_STORAGE_DIR = join(directory, "private"); const file = join(directory, "test.db"); const raw = new Database(file); try { for (const migration of migrations) raw.exec(await readFile(join(process.cwd(), "prisma", "migrations", migration, "migration.sql"), "utf8")); } finally { raw.close(); } db = createTestDatabaseClient(`file:${file}`); await seedDemoData(db); });
afterAll(async () => { await db?.$disconnect(); if (directory) await rm(directory, { recursive: true, force: true }); delete process.env.DOCUMENT_STORAGE_DIR; });

describe("case-linked review opportunities", () => {
  it("loads deterministic quote rules without credentials and saves an unsent editable request", async () => {
    const page = await loadReviewPage("demo-case", db);
    expect(page.opportunities.some((item) => item.category === "MISSING_ITEMISATION")).toBe(true);
    const finding = page.opportunities.find((item) => item.category === "MISSING_ITEMISATION")!;
    const saved = await generateReviewRequest("demo-case", finding.stableKey, db);
    expect(saved.officialSourceUrl).toMatch(/^https:\/\//);
    expect(saved.requestDraftBody).toContain("DEMO DRAFT — NOT SENT");
    expect(saved.status).toBe("PROPOSED");
    expect(await db.emailMessage.count({ where: { caseId: "demo-case", subject: { contains: "Request for written clarification" } } })).toBe(0);
    await saveReviewRequest("demo-case", finding.stableKey, "Please provide a fictional written breakdown of the omitted anaesthetist costs. This is an unsent draft.", db);
    expect((await loadReviewPage("demo-case", db)).opportunities.find((item) => item.stableKey === finding.stableKey)?.draftBody).toContain("fictional written breakdown");
    await updateReviewOpportunityStatus("demo-case", finding.stableKey, "RESOLVED", db);
    expect((await loadReviewPage("demo-case", db)).opportunities.find((item) => item.stableKey === finding.stableKey)?.status).toBe("RESOLVED");
    expect((await db.reviewOpportunity.findUniqueOrThrow({ where: { stableKey: finding.stableKey } })).requestDraftBody).toContain("fictional written breakdown");
  });
  it("requires explicit preference selection for hardship and fee enquiries", async () => {
    expect((await loadReviewPage("demo-case", db)).opportunities.some((item) => item.category === "FINANCIAL_HARDSHIP")).toBe(false);
    await saveReviewPreferences("demo-case", { financialHardshipDisclosed: true, specialistFeeRequest: true }, db);
    const page = await loadReviewPage("demo-case", db);
    expect(page.opportunities.some((item) => item.category === "FINANCIAL_HARDSHIP")).toBe(true);
    expect(page.opportunities.filter((item) => item.category === "SPECIALIST_FEE_NEGOTIATION")).toHaveLength(3);
    await saveReviewPreferences("demo-case", { financialHardshipDisclosed: false, specialistFeeRequest: false }, db);
    expect((await loadReviewPage("demo-case", db)).opportunities.some((item) => item.category === "FINANCIAL_HARDSHIP")).toBe(false);
  });
  it("uses source documents for invoice opportunities and resolves documented complaints", async () => {
    await seedSyntheticDocuments("demo-case", db);
    const page = await loadReviewPage("demo-case", db);
    const invoice = page.opportunities.find((item) => item.category === "QUOTE_VS_INVOICE")!;
    expect(invoice.potentialImpactCents).toBe(70000);
    expect(invoice.evidence.some((item) => item.sourceType === "DOCUMENT" && item.page === 1)).toBe(true);
    const complaint = await recordCaseComplaint("demo-case", { party: "INSURER", providerId: null, summary: "Fictional insurer benefit complaint has not been answered in writing." }, db);
    expect((await loadReviewPage("demo-case", db)).opportunities.some((item) => item.complaintId === complaint.id)).toBe(true);
    await resolveCaseComplaint("demo-case", complaint.id, db);
    expect((await loadReviewPage("demo-case", db)).opportunities.some((item) => item.complaintId === complaint.id)).toBe(false);
  });
  it("rejects stale opportunity IDs and incorrect practice links", async () => {
    await expect(generateReviewRequest("demo-case", "a".repeat(64), db)).rejects.toThrow("no longer current");
    await expect(recordCaseComplaint("demo-case", { party: "PROVIDER", providerId: "unselected", summary: "Fictional complaint about a practice that is not selected." }, db)).rejects.toThrow("selected for this case");
  });
});
