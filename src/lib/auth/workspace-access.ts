import { timingSafeEqual } from "node:crypto";
import { localDocumentAccessAllowed } from "../documents/access";

function equal(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// A single-operator gate for the synthetic demo. This is not patient account auth.
export function workspaceAccessAllowed(requestHeaders: Headers, env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "production") return localDocumentAccessAllowed(requestHeaders.get("host"), env);
  const user = env.APP_ACCESS_USERNAME;
  const password = env.APP_ACCESS_PASSWORD;
  if (!user || !password || password.length < 16) return false;
  const header = requestHeaders.get("authorization");
  if (!header?.startsWith("Basic ")) return false;
  try {
    const value = Buffer.from(header.slice(6), "base64").toString("utf8");
    const colon = value.indexOf(":");
    return colon >= 0 && equal(value.slice(0, colon), user) && equal(value.slice(colon + 1), password);
  } catch { return false; }
}
