import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDatabaseClient } from "./client";

describe("PostgreSQL deployment setup", () => {
  it("rejects missing and SQLite runtime URLs before attempting a connection", () => {
    expect(() => createDatabaseClient("")).toThrow(/PostgreSQL/);
    expect(() => createDatabaseClient("file:./dev.db")).toThrow(/PostgreSQL/);
  });
  it("constructs the Prisma PostgreSQL adapter without connecting during setup", async () => {
    const client = createDatabaseClient("postgresql://example:example@127.0.0.1:5432/medifair");
    await client.$disconnect();
  });
  it("keeps the historical SQLite test schema aligned with production models", () => {
    const production = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const test = readFileSync(join(process.cwd(), "prisma/sqlite-test.prisma"), "utf8")
      .replace('../src/generated/sqlite-test', '../src/generated/prisma')
      .replace('provider = "sqlite"', 'provider = "postgresql"');
    expect(test).toBe(production);
  });
  it("tracks a PostgreSQL baseline migration separately from historical SQLite migrations", () => {
    const migration = readFileSync(join(process.cwd(), "prisma/postgres-migrations/20261012000000_postgres_baseline/migration.sql"), "utf8");
    expect(migration).toContain('CREATE TYPE "QuoteResponseStatus"');
    expect(migration).toContain('CREATE TABLE "Quote"');
    expect(migration).toContain('CREATE TABLE "Negotiation"');
  });
});
