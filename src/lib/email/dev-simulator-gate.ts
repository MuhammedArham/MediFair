export function emailSimulatorAllowed(host: string | null | undefined, env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "development" || (env.EMAIL_TRANSPORT?.trim().toLowerCase() || "mock") !== "mock" || env.ENABLE_EMAIL_SIMULATOR === "false") return false;
  if (!host) return false;
  const hostname = host.startsWith("[") ? host.slice(1, host.indexOf("]")) : host.split(":")[0];
  return ["localhost", "127.0.0.1", "::1"].includes(hostname.toLowerCase());
}
