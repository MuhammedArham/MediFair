"use server";

import { assertWorkspaceAccess } from "@/lib/auth/server-access";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDatabaseClient } from "@/lib/db/client";
import { retryQuoteExtraction, saveQuoteCorrection } from "@/lib/db/quote-extraction";

const idSchema = z.string().trim().min(1).max(100);

export async function saveCorrectionAction(messageId: string, formData: FormData) {
  await assertWorkspaceAccess();
  const id = idSchema.parse(messageId);
  const record = await getDatabaseClient().emailMessage.findUnique({ where: { id }, include: { case: { include: { patientProfile: true } } } });
  if (!record?.case?.isFictional || !record.case.patientProfile.isFictional || record.matchStatus !== "MATCHED") return { ok: false as const, message: "Only a matched synthetic demo email can be corrected." };
  try {
    const parsed = JSON.parse(String(formData.get("resultJson") ?? "")) as unknown;
    await saveQuoteCorrection(id, parsed);
    revalidatePath("/quote-analysis"); revalidatePath("/comparison");
    return { ok: true as const, message: "Reviewed values saved to the comparison." };
  } catch (error) { return { ok: false as const, message: error instanceof Error ? error.message : "Correction could not be saved." }; }
}

export async function retryExtractionAction(messageId: string) {
  await assertWorkspaceAccess();
  const id = idSchema.parse(messageId);
  const record = await getDatabaseClient().emailMessage.findUnique({ where: { id }, include: { case: { include: { patientProfile: true } } } });
  if (!record?.case?.isFictional || !record.case.patientProfile.isFictional || record.matchStatus !== "MATCHED") return { ok: false as const, message: "Only a matched synthetic demo email can be processed." };
  try {
    const result = await retryQuoteExtraction(id);
    revalidatePath("/quote-analysis"); revalidatePath("/comparison");
    return { ok: result.status === "COMPLETE" as const, message: result.status === "COMPLETE" ? "Extraction completed." : `Extraction status: ${result.status.toLowerCase()}. Review the source email manually.` };
  } catch (error) { return { ok: false as const, message: error instanceof Error ? error.message : "Extraction retry failed." }; }
}
