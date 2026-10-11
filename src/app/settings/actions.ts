"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { localDocumentAccessAllowed } from "@/lib/documents/access";
import { serviceStatus } from "@/lib/service-status";
import { seedDemoData } from "../../../prisma/demo-data";

export async function resetDemoAction(confirmed: boolean) {
  const mode = serviceStatus();
  if (!localDocumentAccessAllowed((await headers()).get("host")) || mode.email !== "mock" || mode.ai !== "mock" || !mode.demo || confirmed !== true) return { ok: false, message: "Reset requires local mock mode and explicit confirmation." };
  try {
    await seedDemoData();
    revalidatePath("/", "layout");
    return { ok: true, message: "Sample case restored. Other cases and their records were preserved." };
  } catch { return { ok: false, message: "Reset could not complete. Check the local database and retry; no external service was called." }; }
}
