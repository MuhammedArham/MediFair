import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

export function createDatabaseClient(url = process.env.DATABASE_URL) {
  if (!url || !/^postgres(ql)?:\/\//i.test(url)) throw new Error("DATABASE_URL must be a PostgreSQL connection URL.");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 5 }) });
}

const globalForPrisma = globalThis as unknown as { medifairPrisma?: PrismaClient };

export function getDatabaseClient() {
  globalForPrisma.medifairPrisma ??= createDatabaseClient();
  return globalForPrisma.medifairPrisma;
}

export type DatabaseClient = PrismaClient;
