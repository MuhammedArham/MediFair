import { afterEach, describe, expect, it, vi } from "vitest";
import { mockQuoteFixtures } from "./mock-quote-fixtures";
import { MockAIProvider, OpenAIProvider, type OpenAIResponsesParser } from "./quote-extraction-provider";
import { quoteExtractionSchema } from "./quote-extraction-schema";
import { arithmeticMismatch } from "../db/quote-extraction";

describe("structured quote extraction providers", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it("validates every synthetic fixture against the shared Zod schema", () => {
    expect(mockQuoteFixtures).toHaveLength(14);
    for (const fixture of mockQuoteFixtures) expect(quoteExtractionSchema.parse(fixture.extraction), fixture.id).toBeDefined();
  });

  it("uses only known fixture markers and returns manual review for arbitrary messages", async () => {
    const mock = new MockAIProvider();
    const known = await mock.extractQuote({ subject: "synthetic", body: mockQuoteFixtures.find((item) => item.id === "complete-clear")!.body });
    expect(known.providerMode).toBe("MOCK_AI");
    expect(known.status).toBe("COMPLETE");
    expect(known.extraction?.totalFeesCents).toBe(484000);
    const unknown = await mock.extractQuote({ subject: "quote?", body: "We charge roughly the usual amount, please call." });
    expect(unknown).toMatchObject({ status: "UNSUPPORTED", extraction: null });
    const edited = await mock.extractQuote({ subject: "edited fixture", body: mockQuoteFixtures.find((item) => item.id === "complete-clear")!.body.replace("Surgeon $2,100", "Surgeon $9,999") });
    expect(edited.status).toBe("UNSUPPORTED");
  });

  it("keeps unknown benefits and amounts null, including for prompt injection", async () => {
    const fixture = mockQuoteFixtures.find((item) => item.id === "prompt-injection")!;
    const result = await new MockAIProvider().extractQuote({ subject: "synthetic", body: fixture.body });
    expect(result.extraction?.benefits).toEqual({ medicareCents: null, privateInsurerCents: null });
    expect(result.extraction?.insurance.expectedPatientOutOfPocketCents).toBeNull();
    expect(result.extraction?.humanReviewFlags.join(" ")).toMatch(/untrusted instructions/i);
  });

  it("detects arithmetic inconsistency only when a complete declared set is available", () => {
    const inconsistent = mockQuoteFixtures.find((item) => item.id === "inconsistent")!.extraction;
    const partial = mockQuoteFixtures.find((item) => item.id === "partial")!.extraction;
    expect(arithmeticMismatch(inconsistent)).toBe(true);
    expect(arithmeticMismatch(partial)).toBe(false);
  });

  it("uses the OpenAI Responses structured-output parser with validated output", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const parse = vi.fn<OpenAIResponsesParser>().mockResolvedValue({ output_parsed: mockQuoteFixtures.find((item) => item.id === "complete-clear")!.extraction });
    const provider = new OpenAIProvider({ apiKey: "unit-test-key", model: "unit-test-model", parse });
    const result = await provider.extractQuote({ subject: "Synthetic quote", body: mockQuoteFixtures.find((item) => item.id === "complete-clear")!.body, isFictional: true });
    expect(result.providerMode).toBe("OPENAI");
    expect(result.status).toBe("COMPLETE");
    expect(parse).toHaveBeenCalledOnce();
    expect(parse.mock.calls[0]?.[0]).toMatchObject({ model: "unit-test-model" });
    expect(parse.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends only the checked-in synthetic fixture to OpenAI while demo mode is on", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const parse = vi.fn<OpenAIResponsesParser>().mockResolvedValue({ output_parsed: mockQuoteFixtures.find((item) => item.id === "complete-clear")!.extraction });
    const provider = new OpenAIProvider({ apiKey: "unit-test-key", model: "unit-test-model", parse });
    await provider.extractQuote({ subject: "Patient Alex DOB 1/1/90", body: `${mockQuoteFixtures.find((item) => item.id === "complete-clear")!.body}\nReal patient diagnosis: confidential`, providerName: "Real clinic", isFictional: true });
    const request = JSON.stringify(parse.mock.calls[0]?.[0]);
    expect(request).toContain("Fictional specialist practice");
    expect(request).not.toContain("confidential");
    expect(request).not.toContain("DOB");
  });

  it("retries malformed output and reports failure without falling back", async () => {
    vi.stubEnv("DEMO_MODE", "false");
    const parse = vi.fn<OpenAIResponsesParser>().mockResolvedValue({ output_parsed: { not: "the schema" } });
    const provider = new OpenAIProvider({ apiKey: "unit-test-key", model: "unit-test-model", retries: 1, parse });
    await expect(provider.extractQuote({ subject: "Synthetic quote", body: "fictional", isFictional: true })).rejects.toThrow(/failed after retry/i);
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("retries provider failures and aborts timed out SDK calls", async () => {
    vi.stubEnv("DEMO_MODE", "false");
    const apiFailure = vi.fn<OpenAIResponsesParser>().mockRejectedValue(new Error("synthetic API failure"));
    const failingProvider = new OpenAIProvider({ apiKey: "unit-test-key", model: "unit-test-model", retries: 1, parse: apiFailure });
    await expect(failingProvider.extractQuote({ subject: "Synthetic", body: "fictional", isFictional: true })).rejects.toThrow(/failed after retry/);
    expect(apiFailure).toHaveBeenCalledTimes(2);

    const timedOut = vi.fn<OpenAIResponsesParser>((_input, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new Error("request aborted")), { once: true });
    }));
    const timeoutProvider = new OpenAIProvider({ apiKey: "unit-test-key", model: "unit-test-model", timeoutMs: 5, retries: 0, parse: timedOut });
    await expect(timeoutProvider.extractQuote({ subject: "Synthetic", body: "fictional", isFictional: true })).rejects.toThrow(/timed out/);
    expect(timedOut).toHaveBeenCalledOnce();
  });

  it("requires explicit credentials and model in OpenAI mode", () => {
    expect(() => new OpenAIProvider({ apiKey: "", model: "" })).toThrow(/OPENAI_API_KEY/);
  });

  it("rejects non-fictional source data in demo mode before calling OpenAI", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const parse = vi.fn<OpenAIResponsesParser>();
    const provider = new OpenAIProvider({ apiKey: "unit-test-key", model: "unit-test-model", parse });
    await expect(provider.extractQuote({ subject: "patient email", body: "sensitive", isFictional: false })).rejects.toThrow(/fictional/i);
    expect(parse).not.toHaveBeenCalled();
  });
});
