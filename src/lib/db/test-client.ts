// Historical SQLite fixtures exercise the same repository logic without a remote DB.
// Production code never imports this test-only adapter; PostgreSQL needs a separate smoke test.
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient as SQLiteTestClient } from "../../generated/sqlite-test/client";
import type { DatabaseClient } from "./client";

export function createTestDatabaseClient(url: string): DatabaseClient {
  if (!url.startsWith("file:")) throw new Error("Test SQLite URL required.");
  return new SQLiteTestClient({ adapter: new PrismaBetterSqlite3({ url }) }) as unknown as DatabaseClient;
}
