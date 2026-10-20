import { createTestDatabaseClient } from "./test-client";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Resend } from "resend";
import { seedDemoData, DEMO_CASE_ID } from "../../../prisma/demo-data";
import { type DatabaseClient } from "./client";
import { sendApprovedRequests } from "./outbound-sends";
import { recordDeliveryEvent } from "./delivery-events";
import { approveSelectedQuoteDraft, saveSelectedQuoteDraft } from "./quote-drafts";
import { saveSelectedPractices } from "./provider-selection";
import { EmailServiceError, readEmailConfiguration, type EmailConfiguration, type EmailService, type OutboundEmail } from "../email/email-service";
import { createEmailTransport, MockEmailTransport, ResendEmailTransport, type ReceivedEmail } from "../email/email-transport";
import { classifyQuoteResponse, ingestInboundEmail, safeEmailText, simulateProviderReply } from "./inbound-email";
import { responseTemplates } from "../email/simulator-templates";
import { verifyResendWebhook } from "../email/resend-webhook";
import { emailSimulatorAllowed } from "../email/dev-simulator-gate";
import { mockQuoteFixtures } from "../ai/mock-quote-fixtures";
import { saveQuoteCorrection } from "./quote-extraction";
import { loadComparison } from "../comparison/data";

let directory: string;
let db: DatabaseClient;
const testAddress = "quotes@synthetic-practice.test";
const configuration: EmailConfiguration = {
  apiKey: "mock-only", fromEmail: "mail@synthetic-sender.test", inboundAddress: "replies@synthetic-inbound.test",
  webhookSecret: "mock-only", appBaseUrl: "http://localhost:3000", allowedRecipients: new Set([testAddress]),
};

class MockEmailService implements EmailService {
  calls: OutboundEmail[] = [];
  domainChecks = 0;
  error: EmailServiceError | null = null;
  domainError: EmailServiceError | null = null;
  async verifySendingDomain() { this.domainChecks += 1; if (this.domainError) throw this.domainError; }
  async send(message: OutboundEmail) {
    this.calls.push(message);
    if (this.error) throw this.error;
    return { providerMessageId: "mock-message-1" };
  }
}

beforeAll(async () => {
  process.env.DEMO_MODE = "true";
  process.env.EMAIL_TRANSPORT = "mock";
  directory = await mkdtemp(join(tmpdir(), "medifair-outbound-test-"));
  const file = join(directory, "test.db");
  const raw = new Database(file);
  try {
    for (const migration of ["20261011014245_init", "20261011015035_persistence", "20261011020119_onboarding", "20261011021809_provider_selection", "20261011023806_outbound_sends", "20261011061336_mock_inbound_email", "20261011061900_correct_simulated_delivery_state", "20261011063249_email_sender_recipient", "20261011063500_backfill_demo_inbox_metadata", "20261011064730_quote_extraction", "20261011070140_quote_comparison", "20261011071437_document_analysis", "20261011071857_document_review_note", "20261011072307_bill_negotiation_link", "20261011073215_cost_review_engine", "20261011074850_negotiation_workflow", "20261011110217_negotiation_recipient_verification"]) {
      raw.exec(await readFile(join(process.cwd(), "prisma", "migrations", migration, "migration.sql"), "utf8"));
    }
  } finally { raw.close(); }
  db = createTestDatabaseClient(`file:${file}`);
});

beforeEach(async () => { process.env.AI_PROVIDER = "mock"; await seedDemoData(db); });

afterAll(async () => { await db?.$disconnect(); if (directory) await rm(directory, { recursive: true, force: true }); });

async function prepareApprovedTestPractice() {
  const provider = await db.provider.create({ data: {
    practiceName: "Synthetic transport test practice", medicalSpecialty: "Ophthalmology", sourceType: "VERIFIED_EXTERNAL",
    email: testAddress, suburb: "Sydney", state: "NSW", postcode: "2000", contactSource: "Mock transport test fixture",
    ownerCaseId: DEMO_CASE_ID, verifiedByUserAt: new Date(), verificationStatus: "USER_VERIFIED", isFictional: false,
  } });
  await saveSelectedPractices(DEMO_CASE_ID, [provider.id, "demo-provider-harbour", "demo-provider-city"], db);
  const draft = await saveSelectedQuoteDraft(DEMO_CASE_ID, provider.id, {
    subject: "Synthetic written cost estimate request",
    body: "Hello, I am a fictional patient. Please provide a written estimate for a synthetic cataract procedure, with separate doctor and hospital fees where possible.",
  }, db);
  await approveSelectedQuoteDraft(DEMO_CASE_ID, provider.id, draft.id, db);
  return { provider, draft };
}

async function approveFictionalPracticeRequest(providerId = "demo-provider-harbour") {
  const draft = await saveSelectedQuoteDraft(DEMO_CASE_ID, providerId, {
    subject: "Fictional approved quote request",
    body: "This synthetic request asks for a fictional written cataract estimate. No real patient details are included.",
  }, db);
  await approveSelectedQuoteDraft(DEMO_CASE_ID, providerId, draft.id, db);
  return draft;
}

describe("outbound quote requests with a mocked transport", () => {
  it("requires configuration and never calls the transport without it", async () => {
    const { provider } = await prepareApprovedTestPractice();
    const mock = new MockEmailService();
    const original = { ...process.env };
    try {
      for (const key of ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "RESEND_INBOUND_ADDRESS", "RESEND_WEBHOOK_SECRET", "APP_BASE_URL", "DEMO_ALLOWED_RECIPIENTS"]) delete process.env[key];
      expect(readEmailConfiguration().configuration).toBeNull();
      const result = await sendApprovedRequests(DEMO_CASE_ID, true, { client: db, service: mock });
      expect(result.find((item) => item.providerId === provider.id)?.status).toBe("CONFIG_REQUIRED");
      expect(mock.calls).toHaveLength(0);
      expect(await db.outboundSend.count()).toBe(0);
    } finally { process.env = original; }
  });

  it("sends only the exact approved, allowlisted message once and stores the Resend ID", async () => {
    const { provider, draft } = await prepareApprovedTestPractice();
    const mock = new MockEmailService();
    const result = await sendApprovedRequests(DEMO_CASE_ID, true, { client: db, service: mock, configuration });
    expect(result).toHaveLength(3);
    expect(result.find((item) => item.providerId === provider.id)?.status).toBe("SENT");
    expect(result.filter((item) => item.status === "NOT_APPROVED")).toHaveLength(2);
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0].toEmail).toBe(testAddress);
    expect(mock.calls[0].subject).toBe(draft.subject);
    expect(mock.calls[0].body).toBe(draft.body);
    expect(mock.calls[0].replyToEmail).toMatch(/^replies\+mf-[a-f0-9]{28}@synthetic-inbound\.test$/);
    expect(mock.calls[0].idempotencyKey).toBe(`quote-request/${draft.id}`);
    expect(mock.calls[0].replyToEmail).not.toContain("Alex");
    const attempt = await db.outboundSend.findUniqueOrThrow({ where: { quoteRequestId: draft.id } });
    expect(attempt).toMatchObject({ status: "SENT", providerMessageId: "mock-message-1", approvedContentHash: expect.any(String) });
    expect((await db.emailMessage.findUniqueOrThrow({ where: { externalMessageId: "mock-message-1" } })).body).toBe(draft.body);
    await sendApprovedRequests(DEMO_CASE_ID, true, { client: db, service: mock, configuration });
    expect(mock.calls).toHaveLength(1);
  });

  it("blocks unapproved, non-allowlisted and duplicate sends", async () => {
    const { provider } = await prepareApprovedTestPractice();
    const mock = new MockEmailService();
    await expect(sendApprovedRequests(DEMO_CASE_ID, false, { client: db, service: mock, configuration })).rejects.toThrow("explicit send confirmation");
    const blocked = await sendApprovedRequests(DEMO_CASE_ID, true, { client: db, service: mock, configuration: { ...configuration, allowedRecipients: new Set() } });
    expect(blocked.find((item) => item.providerId === provider.id)?.status).toBe("RECIPIENT_BLOCKED");
    expect(mock.calls).toHaveLength(0);
    expect(await db.outboundSend.count()).toBe(0);
  });

  it("records a provider rate limit without marking the request sent", async () => {
    const { provider, draft } = await prepareApprovedTestPractice();
    const mock = new MockEmailService();
    mock.error = new EmailServiceError("RATE_LIMITED", "Mock rate limit");
    const result = await sendApprovedRequests(DEMO_CASE_ID, true, { client: db, service: mock, configuration });
    expect(result.find((item) => item.providerId === provider.id)?.status).toBe("RATE_LIMITED");
    expect((await db.outboundSend.findUniqueOrThrow({ where: { quoteRequestId: draft.id } })).status).toBe("RATE_LIMITED");
    expect((await db.quoteRequest.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("APPROVED");
    expect(await db.emailMessage.count({ where: { quoteRequestId: draft.id, direction: "OUTBOUND" } })).toBe(0);
    await sendApprovedRequests(DEMO_CASE_ID, true, { client: db, service: mock, configuration });
    expect(mock.calls).toHaveLength(1);
  });

  it("reports an unverified domain before creating a send claim", async () => {
    const { provider } = await prepareApprovedTestPractice();
    const mock = new MockEmailService();
    mock.domainError = new EmailServiceError("DOMAIN_ERROR", "Mock domain unverified");
    const result = await sendApprovedRequests(DEMO_CASE_ID, true, { client: db, service: mock, configuration });
    expect(result.find((item) => item.providerId === provider.id)?.status).toBe("DOMAIN_ERROR");
    expect(mock.calls).toHaveLength(0);
    expect(await db.outboundSend.count()).toBe(0);
  });

  it("records a verified delivery-failure event only once", async () => {
    const { draft } = await prepareApprovedTestPractice();
    const mock = new MockEmailService();
    await sendApprovedRequests(DEMO_CASE_ID, true, { client: db, service: mock, configuration });
    const event = { type: "email.bounced", created_at: "2026-10-11T02:00:00.000Z", data: { email_id: "mock-message-1" } };
    expect(await recordDeliveryEvent(event, "mock-svix-1", db)).toMatchObject({ recorded: true, status: "BOUNCED" });
    expect(await recordDeliveryEvent(event, "mock-svix-1", db)).toMatchObject({ recorded: false, reason: "duplicate" });
    expect((await db.quoteRequest.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("FAILED");
    expect((await db.emailMessage.findUniqueOrThrow({ where: { externalMessageId: "mock-message-1" } })).deliveryStatus).toBe("BOUNCED");
    expect(await db.emailEvent.count({ where: { providerEventId: "mock-svix-1" } })).toBe(1);
  });

  it("stores mock sends as SIMULATED without claiming delivery", async () => {
    const draft = await approveFictionalPracticeRequest();
    const outcomes = await sendApprovedRequests(DEMO_CASE_ID, true, { client: db });
    expect(outcomes.find((item) => item.providerId === "demo-provider-harbour")?.status).toBe("SIMULATED");
    const attempt = await db.outboundSend.findUniqueOrThrow({ where: { quoteRequestId: draft.id } });
    expect(attempt).toMatchObject({ status: "SIMULATED", providerMessageId: expect.stringMatching(/^sim_/) });
    const message = await db.emailMessage.findUniqueOrThrow({ where: { externalMessageId: attempt.providerMessageId! } });
    expect(message).toMatchObject({ isSimulation: true, deliveryStatus: "SIMULATED", direction: "OUTBOUND", body: draft.body, fromAddress: "medifair-demo@mock.invalid", recipientAddress: "quotes@harbour-eye.example" });
  });

  it("ingests synthetic replies through thread matching and quote response processing", async () => {
    const result = await simulateProviderReply({ caseId: DEMO_CASE_ID, providerId: "demo-provider-harbour", templateId: "complete", body: "Complete quote: surgeon, anaesthetist, and hospital fees are itemised." }, db);
    expect(result).toMatchObject({ status: "MATCHED", providerId: "demo-provider-harbour", responseStatus: "COMPLETE_QUOTE" });
    const message = await db.emailMessage.findUniqueOrThrow({ where: { id: result.emailMessageId! } });
    expect(message).toMatchObject({ direction: "INBOUND", isSimulation: true, deliveryStatus: "RECEIVED", matchStatus: "MATCHED", threadId: "demo-thread-harbour" });
    expect(await db.quoteRequest.findUniqueOrThrow({ where: { id: message.quoteRequestId! } })).toMatchObject({ status: "REPLIED", quoteResponseStatus: "COMPLETE_QUOTE" });
    const quote = await db.quote.findFirstOrThrow({ where: { sourceEmailId: message.id }, include: { lineItems: true } });
    expect(quote).toMatchObject({ completeness: "UNKNOWN", confirmationStatus: "PROVIDER_STATED", isFictional: true, lineItems: [] });
    expect(quote.notes).toContain("No fee amounts");
  });

  it("deduplicates repeated inbound messages by provider message ID", async () => {
    const provider = await db.provider.findUniqueOrThrow({ where: { id: "demo-provider-harbour" } });
    const message: ReceivedEmail = {
      providerMessageId: "resend-inbound-duplicate-test", from: `Demo <${provider.email}>`, to: [], receivedFor: [],
      subject: "Re: Synthetic quote request", text: "A quote with surgeon, anaesthetist and hospital fees.", html: null,
      receivedAt: new Date("2026-10-11T00:00:00Z"), headers: { "x-medifair-thread-id": "demo-thread-harbour" }, attachments: [{ id: "attachment-1", filename: "quote.pdf", size: 2400, content_type: "application/pdf", content_id: null, content_disposition: "attachment" }],
    };
    expect(await ingestInboundEmail(message, { eventId: "event-duplicate-test", client: db, simulated: true })).toMatchObject({ status: "MATCHED" });
    expect(await ingestInboundEmail(message, { eventId: "event-duplicate-test-replay", client: db, simulated: true })).toMatchObject({ status: "DUPLICATE" });
    expect(await db.emailMessage.count({ where: { externalMessageId: message.providerMessageId } })).toBe(1);
    expect(await db.document.findMany({ where: { emailMessage: { externalMessageId: message.providerMessageId } } })).toMatchObject([{ fileName: "quote.pdf", mimeType: "application/pdf", byteSize: 2400, isFictional: true }]);
  });

  it("matches replies by opaque recipient token and rejects an incorrect provider address", async () => {
    const { provider } = await prepareApprovedTestPractice();
    await sendApprovedRequests(DEMO_CASE_ID, true, { client: db, service: new MockEmailService(), configuration });
    const attempt = await db.outboundSend.findFirstOrThrow({ where: { providerId: provider.id } });
    const result = await ingestInboundEmail({
      providerMessageId: "wrong-provider-test", from: "other@unrelated.example", to: [attempt.replyToEmail], receivedFor: [],
      subject: "A completely different subject", text: "A quote reply", html: null, receivedAt: new Date(), headers: null, attachments: [],
    }, { eventId: "wrong-provider-event", client: db });
    expect(result.status).toBe("PROVIDER_MISMATCH");
    expect(await db.emailMessage.findUniqueOrThrow({ where: { externalMessageId: "wrong-provider-test" } })).toMatchObject({ caseId: null, providerId: null, matchStatus: "PROVIDER_MISMATCH" });
  });

  it("extracts and reviews synthetic case data received through real transport, retaining actual email provenance", async () => {
    const { provider, draft } = await prepareApprovedTestPractice();
    await sendApprovedRequests(DEMO_CASE_ID, true, { client: db, service: new MockEmailService(), configuration });
    const attempt = await db.outboundSend.findUniqueOrThrow({ where: { quoteRequestId: draft.id } });
    // An edit to the catalogue must not change the sender approved for this thread.
    await db.provider.update({ where: { id: provider.id }, data: { email: "changed@controlled.test" } });
    const fixture = mockQuoteFixtures.find((item) => item.id === "complete-clear")!;
    const reply = { providerMessageId: "real-transport-synthetic-reply", from: testAddress, to: [attempt.replyToEmail], receivedFor: [], subject: "Synthetic quote", text: fixture.body, html: null, receivedAt: new Date(), headers: null, attachments: [] };
    const result = await ingestInboundEmail(reply, { eventId: "real-transport-event", client: db });
    expect(result).toMatchObject({ status: "MATCHED", extractionStatus: "COMPLETE" });
    const message = await db.emailMessage.findUniqueOrThrow({ where: { id: result.emailMessageId! } });
    expect(message).toMatchObject({ isSimulation: false, deliveryStatus: "RECEIVED", providerId: provider.id });
    const quote = await db.quote.findFirstOrThrow({ where: { sourceEmailId: message.id }, include: { lineItems: true } });
    expect(quote.isFictional).toBe(true);
    expect(quote.lineItems.length).toBeGreaterThan(0);
    expect(quote.lineItems.every((item) => item.isFictional)).toBe(true);
    expect((await loadComparison(DEMO_CASE_ID, db))?.groups.some((group) => group.current.quote.id === quote.id)).toBe(true);
    await expect(saveQuoteCorrection(message.id, fixture.extraction, db)).resolves.toMatchObject({ reviewedAt: expect.any(Date) });
    expect(await ingestInboundEmail(reply, { eventId: "real-transport-duplicate", client: db, simulated: false })).toMatchObject({ status: "DUPLICATE" });
    const changedSender = await ingestInboundEmail({ ...reply, providerMessageId: "changed-sender-reply", from: "changed@controlled.test" }, { eventId: "changed-sender-event", client: db });
    expect(changedSender.status).toBe("PROVIDER_MISMATCH");
  });

  it("does not process real-transport replies after patient consent is withdrawn", async () => {
    const { draft } = await prepareApprovedTestPractice();
    await sendApprovedRequests(DEMO_CASE_ID, true, { client: db, service: new MockEmailService(), configuration });
    const attempt = await db.outboundSend.findUniqueOrThrow({ where: { quoteRequestId: draft.id } });
    const patientCase = await db.case.findUniqueOrThrow({ where: { id: DEMO_CASE_ID } });
    await db.patientProfile.update({ where: { id: patientCase.patientProfileId }, data: { consentWithdrawnAt: new Date() } });
    expect(await ingestInboundEmail({ providerMessageId: "withdrawn-consent-reply", from: testAddress, to: [attempt.replyToEmail], receivedFor: [], subject: "Synthetic reply", text: mockQuoteFixtures[0].body, html: null, receivedAt: new Date(), headers: null, attachments: [] }, { eventId: "withdrawn-consent-event", client: db })).toMatchObject({ status: "PROVIDER_MISMATCH" });
    expect(await db.quoteExtraction.count({ where: { emailMessage: { externalMessageId: "withdrawn-consent-reply" } } })).toBe(0);
  });

  it("does not associate messages by matching subject alone", async () => {
    const result = await ingestInboundEmail({
      providerMessageId: "subject-only-test", from: "quotes@harbour-eye.example", to: [], receivedFor: [],
      subject: "Re: Fictional demo: written cataract cost estimate request", text: "A quote response", html: null,
      receivedAt: new Date(), headers: null, attachments: [],
    }, { eventId: "subject-only-event", client: db });
    expect(result.status).toBe("UNMATCHED");
  });

  it("rejects invalid inbound payloads and strips executable HTML content", async () => {
    await expect(ingestInboundEmail({ type: "bad" }, { eventId: "bad-event", client: db })).rejects.toThrow();
    expect(safeEmailText({ text: null, html: "<script>alert(1)</script><p>Fee &amp; quote</p>" })).toBe("Fee & quote");
  });

  it("classifies the eight synthetic reply templates without extracting unsupported costs", () => {
    expect(responseTemplates.filter((template) => !template.id.startsWith("baseline-")).map((template) => classifyQuoteResponse(template.body))).toEqual([
      "COMPLETE_QUOTE", "INCOMPLETE_QUOTE", "CONSULTATION_REQUIRED", "NO_GAP_STATED",
      "DISCOUNT_REFUSED", "REDUCED_QUOTE", "MORE_INFORMATION_REQUIRED", "AMBIGUOUS",
    ]);
  });

  it("keeps mock mode credential-free and does not fall back when real credentials are missing", async () => {
    expect(() => new MockEmailTransport(db)).not.toThrow();
    await expect(new MockEmailTransport(db).sendEmail({ fromEmail: "a@mock.invalid", toEmail: "b@mock.invalid", replyToEmail: "r@mock.invalid", subject: "Unapproved", body: "Body", idempotencyKey: "no-approval" })).rejects.toThrow("requires recorded approval");
    expect(() => new ResendEmailTransport("", db)).toThrow("RESEND_API_KEY is required");
    const originalMode = process.env.EMAIL_TRANSPORT;
    const originalKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    process.env.EMAIL_TRANSPORT = "resend";
    expect(() => createEmailTransport(db)).toThrow("Mock mode is not used as a fallback");
    process.env.EMAIL_TRANSPORT = originalMode;
    if (originalKey) process.env.RESEND_API_KEY = originalKey;
  });

  it("gates the development simulator to loopback mock development only", () => {
    expect(emailSimulatorAllowed("localhost:3000", { NODE_ENV: "development", EMAIL_TRANSPORT: "mock" })).toBe(true);
    expect(emailSimulatorAllowed("example.com", { NODE_ENV: "development", EMAIL_TRANSPORT: "mock" })).toBe(false);
    expect(emailSimulatorAllowed("localhost:3000", { NODE_ENV: "production", EMAIL_TRANSPORT: "mock" })).toBe(false);
    expect(emailSimulatorAllowed("localhost:3000", { NODE_ENV: "development", EMAIL_TRANSPORT: "resend" })).toBe(false);
  });

  it("calls the Resend SDK through a mocked adapter for outbound and inbound operations", async () => {
    const received = { object: "email", id: "inbound-mock-sdk", from: "practice@example.test", to: ["replies+mf-abcd@example.test"], created_at: "2026-10-11T00:00:00.000Z", subject: "reply", bcc: [], cc: [], reply_to: [], received_for: [], html: null, text: "Hello", headers: {}, message_id: "<message@example.test>", attachments: [] };
    const sdk = {
      emails: { send: vi.fn(async () => ({ data: { id: "resend-sdk-message" }, error: null })), receiving: { get: vi.fn(async () => ({ data: received, error: null })) } },
    } as unknown as Resend;
    const transport = new ResendEmailTransport("mock-api-key", db, sdk);
    const sent = await transport.sendEmail({ fromEmail: "mail@example.test", toEmail: "practice@example.test", replyToEmail: "replies@example.test", subject: "Subject", body: "Body", idempotencyKey: "idempotent-test" });
    expect(sent).toEqual({ providerMessageId: "resend-sdk-message", simulated: false });
    expect(sdk.emails.send).toHaveBeenCalledOnce();
    expect(await transport.getMessage("inbound-mock-sdk")).toMatchObject({ providerMessageId: "inbound-mock-sdk", text: "Hello", from: "practice@example.test" });
    expect(sdk.emails.receiving.get).toHaveBeenCalledWith("inbound-mock-sdk", { html_format: "cid" });
  });

  it("passes the exact raw body and signature headers to Resend webhook verification", () => {
    const verify = vi.fn((args: { payload: string; headers: { id: string; timestamp: string; signature: string }; webhookSecret: string }) => args.payload === "{\"type\":\"email.received\"}" ? { type: "email.received" } : (() => { throw new Error("invalid signature"); })());
    const sdk = { webhooks: { verify } } as unknown as Resend;
    expect(verifyResendWebhook("{\"type\":\"email.received\"}", { id: "evt", timestamp: "123", signature: "sig" }, "whsec_test", sdk)).toEqual({ type: "email.received" });
    expect(verify).toHaveBeenCalledWith({ payload: "{\"type\":\"email.received\"}", headers: { id: "evt", timestamp: "123", signature: "sig" }, webhookSecret: "whsec_test" });
    expect(() => verifyResendWebhook("tampered", { id: "evt", timestamp: "123", signature: "sig" }, "whsec_test", sdk)).toThrow("invalid signature");
  });
  it("allows a newly approved clarification version but blocks duplicate sends", async () => {
    vi.stubEnv("EMAIL_TRANSPORT", "mock");
    const { provider, draft } = await prepareApprovedTestPractice();
    expect((await sendApprovedRequests(DEMO_CASE_ID, true, { client: db })).find((item) => item.providerId === provider.id)?.status).toBe("SIMULATED");
    const followup = await saveSelectedQuoteDraft(DEMO_CASE_ID, provider.id, { subject: "Fictional clarification", body: "Please clarify the missing anaesthetist fee in a revised synthetic written quote." }, db);
    expect(followup.requestVersion).toBe(draft.requestVersion + 1);
    await approveSelectedQuoteDraft(DEMO_CASE_ID, provider.id, followup.id, db);
    expect((await sendApprovedRequests(DEMO_CASE_ID, true, { client: db })).find((item) => item.providerId === provider.id)?.status).toBe("SIMULATED");
    await sendApprovedRequests(DEMO_CASE_ID, true, { client: db });
    expect(await db.emailMessage.count({ where: { quoteRequestId: followup.id, direction: "OUTBOUND" } })).toBe(1);
  });
  it("rejects an unknown transport even with otherwise valid configuration", async () => {
    await prepareApprovedTestPractice();
    vi.stubEnv("EMAIL_TRANSPORT", "unexpected");
    await expect(sendApprovedRequests(DEMO_CASE_ID, true, { client: db, configuration })).rejects.toThrow("Unsupported EMAIL_TRANSPORT");
    expect(await db.outboundSend.count()).toBe(0);
  });

});
