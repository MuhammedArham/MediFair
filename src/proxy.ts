import { NextResponse, type NextRequest } from "next/server";
import { workspaceAccessAllowed } from "./lib/auth/workspace-access";

export function proxy(request: NextRequest) {
  if (!workspaceAccessAllowed(request.headers)) {
    return new NextResponse("MediFair AI workspace access required.", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="MediFair AI demo"', "Cache-Control": "no-store" } });
  }
  const origin = request.headers.get("origin");
  if (process.env.NODE_ENV === "production" && request.method !== "GET" && request.method !== "HEAD" && !origin) {
    return new NextResponse("Origin required", { status: 403 });
  }
  if (request.method !== "GET" && request.method !== "HEAD" && origin) {
    try { if (new URL(origin).host !== request.headers.get("host")) return new NextResponse("Origin not allowed", { status: 403 }); }
    catch { return new NextResponse("Invalid origin", { status: 403 }); }
  }
  const selectedCase = request.nextUrl.searchParams.get("case");
  const rememberedCase = request.cookies.get("medifair-case")?.value;
  if (request.method === "GET" && !request.nextUrl.pathname.startsWith("/api/") && !selectedCase && rememberedCase && /^[a-zA-Z0-9_-]{1,100}$/.test(rememberedCase)) {
    const url = request.nextUrl.clone(); url.searchParams.set("case", rememberedCase);
    return NextResponse.redirect(url);
  }
  const response = NextResponse.next();
  if (selectedCase && /^[a-zA-Z0-9_-]{1,100}$/.test(selectedCase)) response.cookies.set("medifair-case", selectedCase, { httpOnly: true, sameSite: "strict", path: "/" });
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}
// Webhooks retain their own raw-body signature gate and are disabled in mock mode.
export const config = { matcher: ["/((?!_next/static|_next/image|icon.svg|api/resend/webhook).*)"] };
