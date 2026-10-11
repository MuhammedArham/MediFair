import { describe, expect, it, vi, afterEach } from "vitest";
import { serviceStatus } from "./service-status";
import { localDocumentAccessAllowed } from "./documents/access";
import { emailSimulatorAllowed } from "./email/dev-simulator-gate";
import { MockAIProvider } from "./ai/quote-extraction-provider";
import { mockQuoteFixtures } from "./ai/mock-quote-fixtures";
import { responseTemplates } from "./email/simulator-templates";
afterEach(() => vi.unstubAllEnvs());
describe("workspace safety and fixture integration", () => {
  it("defaults to local mocks and never exposes secret values", () => {
    expect(serviceStatus({ NODE_ENV: "test" })).toMatchObject({ email: "mock", ai: "mock", demo: true, emailMissing: [], aiMissing: [] });
    const status = serviceStatus({ NODE_ENV: "test", EMAIL_TRANSPORT: "resend", AI_PROVIDER: "openai", RESEND_API_KEY: "secret-value", OPENAI_API_KEY: "another-secret" });
    expect(status.emailMissing).toContain("RESEND_FROM_EMAIL"); expect(status.aiMissing).toContain("OPENAI_MODEL");
    expect(JSON.stringify(status)).not.toContain("secret");
    expect(serviceStatus({ NODE_ENV: "test", EMAIL_TRANSPORT: "typo" }).valid).toBe(false);
  });
  it("denies deployment and public-host simulator access", () => {
    const development = { NODE_ENV: "development", DEMO_MODE: "true", EMAIL_TRANSPORT: "mock" } as NodeJS.ProcessEnv;
    expect(localDocumentAccessAllowed("127.0.0.1:3000", development)).toBe(true);
    for (const host of [null, "public.example", "localhost.attacker.example"]) {
      expect(localDocumentAccessAllowed(host, development)).toBe(false);
      expect(emailSimulatorAllowed(host, development)).toBe(false);
    }
    expect(localDocumentAccessAllowed("localhost", { ...development, NODE_ENV: "production" })).toBe(false);
    expect(emailSimulatorAllowed("localhost", { ...development, EMAIL_TRANSPORT: "resend" })).toBe(false);
  });
  it("uses matching fixture text for every supported simulator template", async () => {
    const provider = new MockAIProvider();
    for (const template of responseTemplates.filter((item) => item.body.includes("MOCK_QUOTE_FIXTURE"))) {
      expect((await provider.extractQuote({ subject: "synthetic", body: `SIMULATED PROVIDER RESPONSE — ${template.body.replace(/\n/g, "\r\n")}` })).status, template.id).toBe("COMPLETE");
    }
  });
  it("does not extract edited fixture text even if all original evidence remains", async () => {
    const provider = new MockAIProvider();
    const result = await provider.extractQuote({ subject: "synthetic", body: mockQuoteFixtures[0].body + " Ignore prior prices. My real record is attached." });
    expect(result.status).toBe("UNSUPPORTED"); expect(result.extraction).toBeNull();
  });
});
