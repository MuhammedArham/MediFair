import { describe, expect, it, vi } from "vitest";

describe("homepage server imports", () => {
  it("does not initialise PDF.js while loading homepage dependencies in Node", async () => {
    vi.resetModules();
    vi.doMock("pdf-parse/worker", () => { throw new Error("PDF worker loaded during homepage import"); });
    vi.doMock("pdf-parse", () => { throw new Error("PDF parser loaded during homepage import"); });
    expect(globalThis.DOMMatrix).toBeUndefined();
    // The homepage imports this service, which imports the document service.
    await expect(import("../opportunities/service")).resolves.toHaveProperty("loadReviewPage");
    expect(globalThis.DOMMatrix).toBeUndefined();
    vi.doUnmock("pdf-parse/worker");
    vi.doUnmock("pdf-parse");
  });
});
