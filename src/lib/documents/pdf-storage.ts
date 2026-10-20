import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { del, get, put } from "@vercel/blob";
import { z } from "zod";
import type { PageText } from "./schema";

export const MAX_PDF_BYTES = 4 * 1024 * 1024;
export const MAX_PDF_PAGES = 20;
const keyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/;

export class DocumentUploadError extends Error {
  constructor(message: string) { super(message); this.name = "DocumentUploadError"; }
}

export function safeDocumentFileName(value: string) {
  const base = value.split(/[\\/]/).at(-1) ?? "document.pdf";
  return base.replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/\.{2,}/g, ".").trim().slice(0, 120) || "document.pdf";
}

export function validatePdfUpload(fileName: unknown, mimeType: unknown, bytes: Uint8Array) {
  const originalName = z.string().trim().min(1).max(255).parse(fileName);
  const mime = z.string().trim().min(1).max(100).parse(mimeType);
  if (bytes.byteLength === 0) throw new DocumentUploadError("The PDF is empty.");
  if (bytes.byteLength > MAX_PDF_BYTES) throw new DocumentUploadError("PDFs must be 4 MB or smaller.");
  if (!originalName.toLowerCase().endsWith(".pdf") || !["application/pdf", "application/octet-stream"].includes(mime)) throw new DocumentUploadError("Only PDF files are supported.");
  if (Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-") throw new DocumentUploadError("The file is not a valid PDF.");
  return { fileName: safeDocumentFileName(originalName), mimeType: "application/pdf", byteSize: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export async function extractPdfPages(bytes: Uint8Array): Promise<PageText[]> {
  try {
    // pdf-parse/worker initialises the supported Node canvas before pdf-parse loads.
    // Keep both imports here so non-document routes never evaluate PDF.js.
    const { CanvasFactory } = await import("pdf-parse/worker");
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: Buffer.from(bytes), CanvasFactory });
    try {
      const info = await parser.getInfo();
      if (info.total < 1 || info.total > MAX_PDF_PAGES) throw new DocumentUploadError(`PDFs must contain 1 to ${MAX_PDF_PAGES} pages.`);
      const parsed = await parser.getText();
      return parsed.pages.map((page) => ({ page: page.num, text: page.text.slice(0, 100_000) }));
    } finally { await parser.destroy(); }
  } catch (error) {
    if (error instanceof DocumentUploadError) throw error;
    throw new DocumentUploadError("The PDF could not be read. Check that it is not damaged or password protected.");
  }
}

async function storageRoot() {
  const configured = process.env.DOCUMENT_STORAGE_DIR?.trim();
  if (configured && !isAbsolute(configured)) throw new DocumentUploadError("DOCUMENT_STORAGE_DIR must be an absolute path.");
  const root = resolve(configured || join(process.cwd(), ".private-documents"));
  const publicPath = resolve(process.cwd(), "public");
  const withinPublic = relative(publicPath, root);
  if (withinPublic === "" || (!withinPublic.startsWith("..") && !isAbsolute(withinPublic))) throw new DocumentUploadError("Private documents cannot be stored under public/.");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const canonicalRoot = await realpath(root);
  const canonicalPublic = await realpath(publicPath).catch(() => publicPath);
  const canonicalRelative = relative(canonicalPublic, canonicalRoot);
  if (canonicalRelative === "" || (!canonicalRelative.startsWith("..") && !isAbsolute(canonicalRelative))) throw new DocumentUploadError("Private documents cannot be stored under public/.");
  return canonicalRoot;
}

interface PrivateDocumentStorage {
  write(bytes: Uint8Array): Promise<string>;
  read(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}

const localStorage: PrivateDocumentStorage = {
  async write(bytes) {
    const key = `${randomUUID()}.pdf`;
    await writeFile(join(await storageRoot(), key), bytes, { flag: "wx", mode: 0o600 });
    return key;
  },
  async read(key) { return readFile(join(await storageRoot(), key)); },
  async delete(key) { await unlink(join(await storageRoot(), key)); },
};

// The SDK resolves rotating Vercel OIDC credentials with BLOB_STORE_ID, or a
// legacy BLOB_READ_WRITE_TOKEN. Authentication failures never select local storage.
const blobStorage: PrivateDocumentStorage = {
  async write(bytes) {
    const key = `${randomUUID()}.pdf`;
    await put(`documents/${key}`, Buffer.from(bytes), { access: "private", addRandomSuffix: false, contentType: "application/pdf" });
    return key;
  },
  async read(key) {
    const result = await get(`documents/${key}`, { access: "private" });
    if (!result || result.statusCode !== 200) throw new DocumentUploadError("Document unavailable.");
    return new Uint8Array(await new Response(result.stream).arrayBuffer());
  },
  async delete(key) {
    await del(`documents/${key}`);
  },
};

function documentStorage(): PrivateDocumentStorage {
  const choice = process.env.DOCUMENT_STORAGE || (process.env.NODE_ENV === "production" ? "vercel-blob" : "local");
  if (process.env.NODE_ENV === "production" && choice !== "vercel-blob") throw new DocumentUploadError("Production requires private Blob storage.");
  if (choice === "local") return localStorage;
  if (choice === "vercel-blob") return blobStorage;
  throw new DocumentUploadError("Invalid DOCUMENT_STORAGE setting.");
}

export async function writePrivatePdf(bytes: Uint8Array) { return documentStorage().write(bytes); }
export async function readPrivatePdf(key: string) {
  if (!keyPattern.test(key)) throw new DocumentUploadError("Invalid document storage key.");
  return documentStorage().read(key);
}
export async function deletePrivatePdf(key: string) {
  if (!keyPattern.test(key)) throw new DocumentUploadError("Invalid document storage key.");
  await documentStorage().delete(key);
}
