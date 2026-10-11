export function localDocumentAccessAllowed(host: string | null | undefined, env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "development" || env.DEMO_MODE === "false" || !host) return false;
  const hostname = host.startsWith("[") ? host.slice(1, host.indexOf("]")) : host.split(":")[0];
  return ["localhost", "127.0.0.1", "::1"].includes(hostname.toLowerCase());
}
