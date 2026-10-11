import { afterEach, describe, expect, it, vi } from "vitest";
import { writePrivatePdf } from "./pdf-storage";

afterEach(() => vi.unstubAllEnvs());
describe("private document storage selection", () => {
  it("rejects local disk storage in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DOCUMENT_STORAGE", "local");
    await expect(writePrivatePdf(new Uint8Array([1]))).rejects.toThrow(/private Blob storage/);
  });
  it("fails closed when a private Blob token is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DOCUMENT_STORAGE", "vercel-blob");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    await expect(writePrivatePdf(new Uint8Array([1]))).rejects.toThrow(/not configured/);
  });
});
