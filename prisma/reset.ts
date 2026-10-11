import "../src/lib/load-env";
import { createDatabaseClient } from "../src/lib/db/client";
import { resetDemoData } from "./demo-data";

async function main() {
  const db = createDatabaseClient();
  try {
    await resetDemoData(db);
    console.log("Removed only MediFair AI fictional demo records. Run pnpm db:seed to restore the sample.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
