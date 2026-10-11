import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createDatabaseClient } from "../src/lib/db/client";
import { seedDemoData } from "../prisma/demo-data";

async function main() {
  const value = process.env.E2E_DATABASE_URL;
  if (!value) throw new Error("E2E_DATABASE_URL is required for browser tests. Use an isolated local PostgreSQL database named medifair_e2e.");
  const url = new URL(value);
  if (!( ["localhost", "127.0.0.1", "::1"].includes(url.hostname) && url.pathname === "/medifair_e2e")) {
    throw new Error("Browser tests may reset only a local medifair_e2e PostgreSQL database.");
  }
  process.env.DATABASE_URL = value;
  process.env.DEMO_MODE = "true";
  execFileSync(resolve("node_modules/.bin/prisma"), ["migrate", "reset", "--force", "--skip-seed"], { stdio: "inherit", env: process.env });
  const db = createDatabaseClient(value);
  try { await seedDemoData(db); } finally { await db.$disconnect(); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "E2E setup failed."); process.exitCode = 1; });
