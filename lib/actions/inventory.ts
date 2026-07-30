"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";
import {
  inventoryItemSchema,
  stockAdjustmentSchema,
} from "@/lib/validation/inventory";
import { type ActionResult, actionOk, parseForm } from "./form";

export async function saveInventoryItem(
  itemId: string | null,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const { data, result } = parseForm(inventoryItemSchema, formData);
  if (!data) return result!;

  const db = tenantDb(orgId);
  const fields = {
    name: data.name,
    type: data.type,
    sku: data.sku || null,
    unit: data.unit,
    reorderThreshold: data.reorderThreshold,
    costPerUnit: data.costPerUnit ?? null,
  };

  if (itemId) {
    // quantityOnHand changes only through movements, never direct edit
    await db.inventoryItem.update({ where: { id: itemId }, data: fields });
  } else {
    const item = await db.inventoryItem.create({
      data: {
        organizationId: orgId,
        ...fields,
        quantityOnHand: data.quantityOnHand,
      },
    });
    if (data.quantityOnHand > 0) {
      await db.stockMovement.create({
        data: {
          organizationId: orgId,
          inventoryItemId: item.id,
          delta: data.quantityOnHand,
          reason: "PURCHASE",
          note: "Opening stock",
        },
      });
    }
  }

  revalidatePath("/inventory");
  return actionOk;
}

/** Manual stock movement (purchase/adjustment/waste/return). */
export async function adjustStock(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const { data, result } = parseForm(stockAdjustmentSchema, formData);
  if (!data) return result!;

  const db = tenantDb(orgId);
  const item = await db.inventoryItem.findUnique({
    where: { id: data.inventoryItemId },
  });
  if (!item || item.deletedAt) return { ok: false, error: "Item not found" };
  if (Number(item.quantityOnHand) + data.delta < 0) {
    return {
      ok: false,
      error: `Stock cannot go negative (on hand: ${Number(item.quantityOnHand)})`,
    };
  }

  await db.stockMovement.create({
    data: {
      organizationId: orgId,
      inventoryItemId: data.inventoryItemId,
      delta: data.delta,
      reason: data.reason,
      note: data.note || null,
    },
  });
  await db.inventoryItem.update({
    where: { id: data.inventoryItemId },
    data: { quantityOnHand: { increment: data.delta } },
  });

  revalidatePath("/inventory");
  return actionOk;
}

export async function archiveInventoryItem(itemId: string): Promise<void> {
  const { orgId } = await requireOrg();
  await tenantDb(orgId).inventoryItem.update({
    where: { id: itemId },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/inventory");
}
