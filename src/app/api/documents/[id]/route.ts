import { workspaceAccessAllowed } from "@/lib/auth/workspace-access";
import { downloadStoredDocument } from "@/lib/documents/service";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!workspaceAccessAllowed(request.headers)) return new Response("Not found", { status: 404 });
  try {
    const { id } = await params;
    const { document, bytes } = await downloadStoredDocument(id);
    const safeName = document.fileName.replace(/[\r\n"\\]/g, "_");
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    } });
  } catch { return new Response("Document unavailable", { status: 404, headers: { "Cache-Control": "no-store" } }); }
}
