import { createTestDatabaseClient } from "../db/test-client";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Resend } from "resend";
import type OpenAI from "openai";
import { seedDemoData } from "../../../prisma/demo-data";
import { type DatabaseClient } from "../db/client";
import { ingestInboundEmail, simulateNegotiationReply } from "../db/inbound-email";
import { loadComparison } from "../comparison/data";
import { loadReviewPage, saveReviewPreferences } from "../opportunities/service";
import { assertNegotiationTransition, closeNegotiation, decideNegotiationRequest, editNegotiationDraft, sendNegotiationRequest, startOpportunityNegotiation } from "./service";
import { negotiationResponseTemplates, OpenAINegotiationResponseProvider } from "./response-provider";
import { processNegotiationReply, revisedQuoteIsComparable } from "./processing";
import { mockQuoteFixtures } from "../ai/mock-quote-fixtures";
import { draftNegotiationRequest } from "./templates";
import { ResendEmailService } from "../email/email-service";

let directory: string;
let db: DatabaseClient;
beforeAll(async () => {
  process.env.DEMO_MODE = "true"; process.env.EMAIL_TRANSPORT = "mock"; process.env.AI_PROVIDER = "mock";
  directory = await mkdtemp(join(tmpdir(), "medifair-negotiation-"));
  const file = join(directory, "test.db");
  const raw = new Database(file);
  try { for (const migration of (await readdir(join(process.cwd(), "prisma", "migrations"))).filter((name) => /^\d/.test(name)).sort()) raw.exec(await readFile(join(process.cwd(), "prisma", "migrations", migration, "migration.sql"), "utf8")); }
  finally { raw.close(); }
  db = createTestDatabaseClient(`file:${file}`);
});
beforeEach(async () => { await seedDemoData(db); });
afterAll(async () => { await db?.$disconnect(); if (directory) await rm(directory, { recursive: true, force: true }); });

async function startB() {
  const page = await loadReviewPage("demo-case", db);
  const finding = page.opportunities.find((item) => item.category === "GAP_COVER_ENQUIRY" && item.providerId === "demo-provider-north");
  expect(finding).toBeTruthy();
  return startOpportunityNegotiation({ caseId: "demo-case", stableKey: finding!.stableKey }, db);
}
async function sendB() {
  const negotiation = await startB();
  await decideNegotiationRequest(negotiation.id, "APPROVE", db);
  const sent = await sendNegotiationRequest(negotiation.id, true, { client: db });
  expect(sent.status).toBe("SIMULATED");
  return negotiation;
}
const template = (id: string) => negotiationResponseTemplates.find((item) => item.id === id)!;

describe("negotiation workflow", () => {
  it("interprets a synthetic response received by real email without mislabelling its delivery", async () => {
    const negotiation = await sendB();
    const message = await db.emailMessage.create({ data: {
      caseId: "demo-case", providerId: negotiation.providerId, negotiationId: negotiation.id,
      direction: "INBOUND", subject: "Synthetic response", body: template("refuses").body,
      isSimulation: false, matchStatus: "MATCHED", deliveryStatus: "RECEIVED", receivedAt: new Date(),
    } });
    const result = await processNegotiationReply(message.id, db);
    expect(result).toMatchObject({ providerMode: "MOCK_AI", interpretationStatus: "COMPLETE" });
    expect((await db.negotiation.findUniqueOrThrow({ where: { id: negotiation.id } })).status).toBe("REJECTED");
    expect((await db.emailMessage.findUniqueOrThrow({ where: { id: message.id } })).isSimulation).toBe(false);
  });
  it("defines explicit transitions for all requested states and rejects shortcuts", () => {
    const transitions = [
      ["DRAFT", "AWAITING_APPROVAL"], ["AWAITING_APPROVAL", "SIMULATED_SENT"], ["AWAITING_APPROVAL", "SENT"],
      ["SIMULATED_SENT", "AWAITING_RESPONSE"], ["SENT", "AWAITING_RESPONSE"], ["AWAITING_RESPONSE", "NEEDS_CLARIFICATION"],
      ["AWAITING_RESPONSE", "COUNTEROFFERED"], ["AWAITING_RESPONSE", "ACCEPTED"], ["AWAITING_RESPONSE", "REJECTED"], ["REJECTED", "CLOSED"],
    ] as const;
    for (const [from, to] of transitions) expect(() => assertNegotiationTransition(from, to)).not.toThrow();
    expect(() => assertNegotiationTransition("DRAFT", "ACCEPTED")).toThrow();
    expect(() => assertNegotiationTransition("CLOSED", "SENT")).toThrow();
  });

  it("requires exact approval, preserves draft and approved body, and prevents duplicate mock sends", async () => {
    const negotiation = await startB();
    await expect(sendNegotiationRequest(negotiation.id, true, { client: db })).rejects.toThrow("Approve");
    const original = await db.negotiationRequest.findFirstOrThrow({ where: { negotiationId: negotiation.id } });
    await editNegotiationDraft(negotiation.id, { subject: original.subject, body: `${original.draftBody}\nPlease respond in writing.` }, db);
    await decideNegotiationRequest(negotiation.id, "REVIEW", db);
    const approved = await decideNegotiationRequest(negotiation.id, "APPROVE", db);
    expect(approved.approvedBody).toContain("Please respond in writing.");
    expect(negotiation.originalRequest).not.toContain("Please respond in writing.");
    const first = await sendNegotiationRequest(negotiation.id, true, { client: db });
    const second = await sendNegotiationRequest(negotiation.id, true, { client: db });
    expect(first.status).toBe("SIMULATED"); expect(second.status).toBe("SIMULATED");
    const outbound = await db.emailMessage.findMany({ where: { negotiationId: negotiation.id, direction: "OUTBOUND" } });
    expect(outbound).toHaveLength(1);
    expect(outbound[0].deliveryStatus).toBe("SIMULATED");
    expect(outbound[0].body).toBe(approved.approvedBody);
    expect(await db.auditEvent.count({ where: { negotiationId: negotiation.id, action: "REQUEST_APPROVED" } })).toBe(1);
  });

  it("does not create two outbox records for concurrent send clicks", async () => {
    const negotiation = await startB();
    await decideNegotiationRequest(negotiation.id, "APPROVE", db);
    const attempts = await Promise.allSettled([sendNegotiationRequest(negotiation.id, true, { client: db }), sendNegotiationRequest(negotiation.id, true, { client: db })]);
    expect(attempts.some((item) => item.status === "fulfilled" && item.value.status === "SIMULATED")).toBe(true);
    expect(await db.emailMessage.count({ where: { negotiationId: negotiation.id, direction: "OUTBOUND" } })).toBe(1);
    expect(await db.negotiationRequest.count({ where: { negotiationId: negotiation.id, providerMessageId: { not: null } } })).toBe(1);
  });

  it("records patient rejection without a send", async () => {
    const negotiation = await startB();
    await decideNegotiationRequest(negotiation.id, "REJECT", db);
    expect((await db.negotiation.findUniqueOrThrow({ where: { id: negotiation.id } })).status).toBe("CLOSED");
    expect(await db.emailMessage.count({ where: { negotiationId: negotiation.id } })).toBe(0);
  });

  it("closes a negotiation while retaining its messages and audit trail", async () => {
    const negotiation = await sendB();
    await simulateNegotiationReply({ negotiationId: negotiation.id, templateId: "refuses", body: template("refuses").body }, db);
    await closeNegotiation(negotiation.id, db);
    expect((await db.negotiation.findUniqueOrThrow({ where: { id: negotiation.id } })).status).toBe("CLOSED");
    expect(await db.emailMessage.count({ where: { negotiationId: negotiation.id } })).toBe(2);
    expect(await db.auditEvent.count({ where: { negotiationId: negotiation.id } })).toBeGreaterThan(3);
  });

  it("matches a synthetic reply by token, rejects the wrong sender, and ignores duplicate deliveries", async () => {
    const negotiation = await sendB();
    const request = await db.negotiationRequest.findFirstOrThrow({ where: { negotiationId: negotiation.id } });
    const wrong = await ingestInboundEmail({ providerMessageId: "wrong-neg-sender", from: "someone@other.example", to: [`replies+mf-${request.replyIdentifier}@mock.invalid`], receivedFor: [], subject: "Re: cost request", text: template("refuses").body, html: null, receivedAt: new Date(), headers: null, attachments: [] }, { eventId: "wrong-neg-event", simulated: true, client: db });
    expect(wrong.status).toBe("PROVIDER_MISMATCH");
    const result = await simulateNegotiationReply({ negotiationId: negotiation.id, templateId: "refuses", body: template("refuses").body }, db);
    expect(result.status).toBe("MATCHED");
    const saved = await db.emailMessage.findUniqueOrThrow({ where: { id: result.emailMessageId } });
    const duplicate = await ingestInboundEmail({ providerMessageId: saved.externalMessageId, from: saved.fromAddress, to: [saved.recipientAddress], receivedFor: [], subject: saved.subject, text: saved.body, html: null, receivedAt: saved.receivedAt!, headers: null, attachments: [] }, { eventId: "another-webhook-delivery", simulated: true, client: db });
    expect(duplicate.status).toBe("DUPLICATE");
    expect(await db.negotiationResponse.count({ where: { negotiationId: negotiation.id } })).toBe(1);
  });

  it("versions the full Northside quote and recalculates a comparable $900 potential reduction", async () => {
    const before = await loadComparison("demo-case", db);
    expect(before?.groups.find((group) => group.current.quote.providerId === "demo-provider-north")?.current.result.quotedPatientCostCents).toBe(180000);
    const negotiation = await sendB();
    const result = await simulateNegotiationReply({ negotiationId: negotiation.id, templateId: "agrees-discount", body: template("agrees-discount").body }, db);
    expect(result.status).toBe("MATCHED");
    const after = await loadComparison("demo-case", db);
    const north = after?.groups.find((group) => group.current.quote.providerId === "demo-provider-north");
    expect(north?.versions).toHaveLength(2);
    expect(north?.current.result.quotedPatientCostCents).toBe(90000);
    expect(north?.current.result.rankable).toBe(true);
    expect(north?.versions[1].result.quotedPatientCostCents).toBe(180000);
    const saved = await db.negotiation.findUniqueOrThrow({ where: { id: negotiation.id } });
    expect(saved.status).toBe("ACCEPTED"); expect(saved.revisedQuoteId).toBe(north?.current.quote.id);
    expect(saved.agreedPatientAmountCents).toBe(90000);
    expect(180000 - north!.current.result.quotedPatientCostCents!).toBe(90000);
    expect(await db.auditEvent.count({ where: { negotiationId: negotiation.id, action: "NEGOTIATION_UPDATED" } })).toBeGreaterThan(1);
  });

  it.each([
    ["smaller-discount", "COUNTEROFFERED"], ["refuses", "REJECTED"], ["more-info", "NEEDS_CLARIFICATION"],
    ["gap-arrangement", "NEEDS_CLARIFICATION"], ["different-inclusions", "COUNTEROFFERED"], ["no-discount", "REJECTED"],
  ])("processes %s conservatively as %s without a revised comparable quote", async (fixtureId, expected) => {
    const negotiation = await sendB();
    await simulateNegotiationReply({ negotiationId: negotiation.id, templateId: fixtureId, body: template(fixtureId).body }, db);
    const saved = await db.negotiation.findUniqueOrThrow({ where: { id: negotiation.id } });
    expect(saved.status).toBe(expected); expect(saved.revisedQuoteId).toBeNull();
    expect((await loadComparison("demo-case", db))?.groups.find((group) => group.current.quote.providerId === "demo-provider-north")?.current.result.quotedPatientCostCents).toBe(180000);
  });

  it("versions an itemised update but keeps unknown benefits out of comparison ranking", async () => {
    const negotiation = await sendB();
    await simulateNegotiationReply({ negotiationId: negotiation.id, templateId: "itemised-update", body: template("itemised-update").body }, db);
    const saved = await db.negotiation.findUniqueOrThrow({ where: { id: negotiation.id } });
    expect(saved.status).toBe("NEEDS_CLARIFICATION"); expect(saved.revisedQuoteId).toBeNull();
    const group = (await loadComparison("demo-case", db))!.groups.find((item) => item.current.quote.providerId === "demo-provider-north")!;
    expect(group.versions).toHaveLength(2);
    expect(group.current.result.rankable).toBe(false);
    expect(group.current.result.quotedPatientCostCents).toBeNull();
    expect(group.versions[1].result.quotedPatientCostCents).toBe(180000);
  });

  it("keeps edited unknown replies for manual review and supports follow-up versions", async () => {
    const negotiation = await sendB();
    await simulateNegotiationReply({ negotiationId: negotiation.id, templateId: "agrees-discount", body: `${template("agrees-discount").body}\nMaybe we can help.` }, db);
    const saved = await db.negotiation.findUniqueOrThrow({ where: { id: negotiation.id }, include: { responses: true } });
    expect(saved.status).toBe("NEEDS_CLARIFICATION"); expect(saved.responses[0].interpretationStatus).toBe("UNSUPPORTED"); expect(saved.revisedQuoteId).toBeNull();
    const next = await editNegotiationDraft(negotiation.id, { subject: "Fictional follow-up on revised costs", body: "Please confirm the full written quote and all included charges in a new response. This is a fictional patient question." }, db);
    expect(next.version).toBe(2); expect(next.status).toBe("DRAFT");
    await simulateNegotiationReply({ negotiationId: negotiation.id, templateId: "refuses", body: template("refuses").body }, db);
    expect(await db.negotiationResponse.count({ where: { negotiationId: negotiation.id } })).toBe(2);
    expect((await db.negotiation.findUniqueOrThrow({ where: { id: negotiation.id } })).status).toBe("DRAFT");
  });

  it("lets Practice A refuse and leaves Practice C incomplete", async () => {
    await saveReviewPreferences("demo-case", { financialHardshipDisclosed: false, specialistFeeRequest: true }, db);
    const finding = (await loadReviewPage("demo-case", db)).opportunities.find((item) => item.category === "SPECIALIST_FEE_NEGOTIATION" && item.providerId === "demo-provider-harbour")!;
    const negotiation = await startOpportunityNegotiation({ caseId: "demo-case", stableKey: finding.stableKey }, db);
    await decideNegotiationRequest(negotiation.id, "APPROVE", db);
    await sendNegotiationRequest(negotiation.id, true, { client: db });
    await simulateNegotiationReply({ negotiationId: negotiation.id, templateId: "refuses", body: template("refuses").body }, db);
    expect((await db.negotiation.findUniqueOrThrow({ where: { id: negotiation.id } })).status).toBe("REJECTED");
    const groups = (await loadComparison("demo-case", db))!.groups;
    expect(groups.find((group) => group.current.quote.providerId === "demo-provider-harbour")?.current.result.quotedPatientCostCents).toBe(240000);
    expect(groups.find((group) => group.current.quote.providerId === "demo-provider-city")?.current.result.rankable).toBe(false);
  });

  it("never drafts unsupported hardship claims and preserves unknown amounts", () => {
    expect(() => draftNegotiationRequest({ type: "FINANCIAL_HARDSHIP", providerName: "Demo", procedureName: "Fictional service", mbsItemNumber: null, insurerName: null, patientName: "Fictional patient", originalGapCents: null, evidence: [], missing: [], sourceUrl: null, preferredLocation: null, hardshipDisclosed: false, specialistFeeRequested: false })).toThrow("explicitly disclose");
  });

  it("requires unchanged quoted scope and financial assumptions before comparing a reduction", () => {
    const original = mockQuoteFixtures.find((item) => item.id === "negotiated-north-900")!.extraction;
    const revised = structuredClone(original);
    const interpretation = structuredClone(template("agrees-discount").interpretation);
    expect(revisedQuoteIsComparable(original, revised, interpretation)).toBe(true);
    expect(revisedQuoteIsComparable(original, revised, { ...interpretation, sameFinancialAssumptionsExplicit: false })).toBe(false);
    expect(revisedQuoteIsComparable(original, { ...revised, includedComponents: revised.includedComponents.filter((value) => value !== "Device") }, interpretation)).toBe(false);
    expect(revisedQuoteIsComparable(original, { ...revised, benefits: { ...revised.benefits, privateInsurerCents: null } }, interpretation)).toBe(false);
  });

  it("validates OpenAI negotiation structured output through mocked SDK calls without credentials", async () => {
    const parse = vi.fn(async () => ({ output_parsed: template("refuses").interpretation }));
    const sdk = { responses: { parse } } as unknown as OpenAI;
    const provider = new OpenAINegotiationResponseProvider({ apiKey: "unit-test-only", model: "unit-test-model", client: sdk });
    const result = await provider.interpret(template("refuses").body, true);
    expect(result.providerMode).toBe("OPENAI"); expect(result.interpretation?.decision).toBe("REJECTED");
    expect(parse).toHaveBeenCalledOnce();
    await expect(provider.interpret("Unknown edited provider message", true)).rejects.toThrow("cannot be transmitted");
    expect(parse).toHaveBeenCalledOnce();
  });

  it("uses the real Resend adapter through mocked SDK calls only after approval", async () => {
    const negotiation = await startB();
    const keys = ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "RESEND_INBOUND_ADDRESS", "RESEND_WEBHOOK_SECRET", "APP_BASE_URL", "DEMO_ALLOWED_RECIPIENTS"] as const;
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    const sdk = { domains: { list: vi.fn(async () => ({ data: { data: [{ name: "synthetic.test", status: "verified", capabilities: { sending: "enabled" } }], has_more: false }, error: null })) }, emails: { send: vi.fn(async () => ({ data: { id: "mocked-resend-negotiation-id" }, error: null })) } } as unknown as Resend;
    try {
      process.env.RESEND_API_KEY = "re_test_only"; process.env.RESEND_FROM_EMAIL = "mail@synthetic.test"; process.env.RESEND_INBOUND_ADDRESS = "replies@synthetic.test";
      process.env.RESEND_WEBHOOK_SECRET = "whsec_test_only"; process.env.APP_BASE_URL = "http://localhost:3000"; process.env.DEMO_ALLOWED_RECIPIENTS = "recipient@synthetic.test";
      await db.provider.update({ where: { id: "demo-provider-north" }, data: { sourceType: "VERIFIED_EXTERNAL", ownerCaseId: "demo-case", verificationStatus: "USER_VERIFIED", verifiedByUserAt: new Date(), isFictional: false, email: "recipient@synthetic.test" } });
      await db.negotiationRequest.updateMany({ where: { negotiationId: negotiation.id }, data: { recipientEmail: "recipient@synthetic.test", recipientVerifiedAt: new Date() } });
      const service = new ResendEmailService("re_test_only", sdk);
      await expect(sendNegotiationRequest(negotiation.id, true, { client: db, service })).rejects.toThrow("Approve");
      expect(sdk.emails.send).not.toHaveBeenCalled();
      await decideNegotiationRequest(negotiation.id, "APPROVE", db);
      const sent = await sendNegotiationRequest(negotiation.id, true, { client: db, service });
      expect(sent.status).toBe("SENT");
      expect(sdk.domains.list).toHaveBeenCalledOnce();
      expect(sdk.emails.send).toHaveBeenCalledOnce();
      expect((await db.emailMessage.findFirstOrThrow({ where: { negotiationId: negotiation.id, direction: "OUTBOUND" } })).externalMessageId).toBe("mocked-resend-negotiation-id");
    } finally {
      for (const key of keys) { const value = previous[key]; if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
  });
});
