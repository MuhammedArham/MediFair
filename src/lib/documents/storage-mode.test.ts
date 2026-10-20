import { del, get, put } from "@vercel/blob";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deletePrivatePdf, readPrivatePdf, writePrivatePdf } from "./pdf-storage";

vi.mock("@vercel/blob", () => ({ put: vi.fn(), get: vi.fn(), del: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());
describe("private document storage selection", () => {
  it("rejects local disk storage in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DOCUMENT_STORAGE", "local");
    await expect(writePrivatePdf(new Uint8Array([1]))).rejects.toThrow(/private Blob storage/);
  });
  it("uses private Blob operations with OIDC and no static token", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DOCUMENT_STORAGE", "vercel-blob");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("BLOB_STORE_ID", "store_synthetic");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "synthetic-oidc-token");
    vi.mocked(put).mockResolvedValue({} as Awaited<ReturnType<typeof put>>);
    vi.mocked(get).mockResolvedValue({ statusCode: 200, stream: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); } }) } as Awaited<ReturnType<typeof get>>);
    vi.mocked(del).mockResolvedValue(undefined);

    const key = await writePrivatePdf(new Uint8Array([1, 2, 3]));
    expect(key).toMatch(/^[0-9a-f-]+\.pdf$/);
    expect(put).toHaveBeenCalledWith(`documents/${key}`, Buffer.from([1, 2, 3]), { access: "private", addRandomSuffix: false, contentType: "application/pdf" });
    expect(await readPrivatePdf(key)).toEqual(new Uint8Array([1, 2, 3]));
    expect(get).toHaveBeenCalledWith(`documents/${key}`, { access: "private" });
    await deletePrivatePdf(key);
    expect(del).toHaveBeenCalledWith(`documents/${key}`);
  });
  it("fails closed if the Blob SDK has no usable credentials", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DOCUMENT_STORAGE", "vercel-blob");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("BLOB_STORE_ID", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    vi.mocked(put).mockRejectedValueOnce(new Error("No blob credentials found."));
    await expect(writePrivatePdf(new Uint8Array([1]))).rejects.toThrow(/No blob credentials/);
  });
});
