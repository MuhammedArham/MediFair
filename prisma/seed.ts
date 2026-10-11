import "../src/lib/load-env";
import { createDatabaseClient } from "../src/lib/db/client";
import { seedDemoData } from "./demo-data";

async function main() {
  const db = createDatabaseClient();
  try {
    const result = await seedDemoData(db);
    console.log(`Seeded ${result.providerCount} fictional practices and ${result.quoteCount} fictional quotes for ${result.caseId}.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
