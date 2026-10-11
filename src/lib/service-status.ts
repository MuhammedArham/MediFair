/** Returns presence flags only. Secret values must never reach client components. */
export function serviceStatus(env: NodeJS.ProcessEnv = process.env) {
  const email = env.EMAIL_TRANSPORT?.trim().toLowerCase() || "mock";
  const ai = env.AI_PROVIDER?.trim().toLowerCase() || "mock";
  return {
    email, ai, demo: (env.DEMO_MODE?.trim().toLowerCase() || "true") === "true",
    databaseReady: /^postgres(ql)?:\/\//i.test(env.DATABASE_URL || ""),
    storageMode: env.DOCUMENT_STORAGE || (env.NODE_ENV === "production" ? "vercel-blob" : "local"),
    storageReady: env.NODE_ENV !== "production" || Boolean(env.BLOB_READ_WRITE_TOKEN),
    accessReady: env.NODE_ENV !== "production" || Boolean(env.APP_ACCESS_USERNAME && (env.APP_ACCESS_PASSWORD?.length || 0) >= 16),
    emailMissing: email === "mock" ? [] : ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "RESEND_INBOUND_ADDRESS", "RESEND_WEBHOOK_SECRET", "DEMO_ALLOWED_RECIPIENTS", "APP_BASE_URL"].filter((key) => !env[key]?.trim()),
    aiMissing: ai === "mock" ? [] : ["OPENAI_API_KEY", "OPENAI_MODEL"].filter((key) => !env[key]?.trim()),
    valid: ["mock", "resend"].includes(email) && ["mock", "openai"].includes(ai),
  };
}
