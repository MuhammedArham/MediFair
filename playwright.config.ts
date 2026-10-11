import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, workers: 1, timeout: 300_000,
  expect: { timeout: 20_000 }, reporter: [["list"], ["html", { open: "never" }]],
  use: { actionTimeout: 20_000, baseURL: "http://127.0.0.1:3100", channel: process.env.PLAYWRIGHT_CHANNEL || undefined, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: {
    command: "node --import tsx scripts/e2e-setup.ts && node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100", reuseExistingServer: false, timeout: 120_000,
    env: { E2E_DATABASE_URL: process.env.E2E_DATABASE_URL || "", DATABASE_URL: process.env.E2E_DATABASE_URL || "", DOCUMENT_STORAGE: "local", DOCUMENT_STORAGE_DIR: resolve(".e2e/private"), DEMO_MODE: "true", EMAIL_TRANSPORT: "mock", AI_PROVIDER: "mock", ENABLE_EMAIL_SIMULATOR: "true", RESEND_API_KEY: "", OPENAI_API_KEY: "" },
  },
});
