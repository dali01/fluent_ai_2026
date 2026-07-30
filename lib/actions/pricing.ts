"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";
import { RULE_CONFIG_SCHEMAS } from "@/lib/pricing/rule-schemas";
import { pricingRuleSchema, priceTierSchema } from "@/lib/validation/quotes";
import { type ActionResult, actionOk, parseForm } from "./form";

export async function savePriceTier(
  tierId: string | null,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const { data, result } = parseForm(priceTierSchema, formData, {
    booleans: ["isResellerTier"],
  });
  if (!data) return result!;

  const db = tenantDb(orgId);
  if (tierId) {
    await db.priceTier.update({ where: { id: tierId }, data });
  } else {
    await db.priceTier.create({ data: { organizationId: orgId, ...data } });
  }
  revalidatePath("/settings");
  return actionOk;
}

export async function savePricingRule(
  ruleId: string | null,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const { data, result } = parseForm(pricingRuleSchema, formData, {
    booleans: ["active"],
  });
  if (!data) return result!;

  let config: unknown;
  try {
    config = JSON.parse(data.config);
  } catch {
    return {
      ok: false,
      error: "Config must be valid JSON",
      fieldErrors: { config: "Invalid JSON" },
    };
  }
  const schema = RULE_CONFIG_SCHEMAS[data.type];
  const parsed = schema.safeParse(config);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Config doesn't match the ${data.type} shape: ${parsed.error.issues[0]?.message}`,
      fieldErrors: { config: parsed.error.issues[0]?.message ?? "Invalid" },
    };
  }

  const db = tenantDb(orgId);
  const fields = {
    name: data.name,
    type: data.type,
    active: data.active,
    config: JSON.parse(JSON.stringify(parsed.data)),
  };
  if (ruleId) {
    await db.pricingRule.update({ where: { id: ruleId }, data: fields });
  } else {
    await db.pricingRule.create({ data: { organizationId: orgId, ...fields } });
  }
  revalidatePath("/settings");
  return actionOk;
}

export async function deletePricingRule(ruleId: string): Promise<void> {
  const { orgId } = await requireOrg();
  await tenantDb(orgId).pricingRule.delete({ where: { id: ruleId } });
  revalidatePath("/settings");
}
