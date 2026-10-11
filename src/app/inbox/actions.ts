"use server";

import { assertWorkspaceAccess } from "@/lib/auth/server-access";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDatabaseClient } from "@/lib/db/client";

export async function updateReadStateAction(messageId: string, isRead: boolean) {
  await assertWorkspaceAccess();
  const id = z.string().trim().min(1).max(100).parse(messageId);
  const message = await getDatabaseClient().emailMessage.update({ where: { id }, data: { isRead: z.boolean().parse(isRead) } });
  if (message.caseId) revalidatePath("/inbox");
  return { ok: true as const };
}
