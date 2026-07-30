"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth/require-org";
import { CURRENCIES, writeGeneralConfig } from "@/lib/db/org-settings";
import { type ActionResult, actionOk } from "./form";

const inputSchema = z.object({ currency: z.enum(CURRENCIES) });

export async function updateGeneralSettings(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const parsed = inputSchema.safeParse({
    currency: formData.get("currency"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Choose a valid currency" };
  }

  await writeGeneralConfig(orgId, parsed.data);
  // Currency shows on most money-bearing pages — refresh the whole app
  revalidatePath("/", "layout");
  return actionOk;
}
