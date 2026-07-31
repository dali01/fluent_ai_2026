import { tenantDb } from "@/lib/db/tenant";
import { byUrgency, forecastDemand, type DemandForecast } from "./demand";

/**
 * Loads consumption history and hands it to the pure forecaster. Only
 * JOB_CONSUMPTION and WASTE count as demand — a PURCHASE is supply, and
 * an ADJUSTMENT is a correction, not something the shop will use again.
 */
export async function buildDemandForecasts(
  orgId: string,
  now: Date = new Date(),
  sinceDays = 540,
): Promise<DemandForecast[]> {
  const db = tenantDb(orgId);
  const since = new Date(now.getTime() - sinceDays * 86_400_000);

  const items = await db.inventoryItem.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      quantityOnHand: true,
      reorderThreshold: true,
      stockMovements: {
        where: {
          createdAt: { gte: since },
          reason: { in: ["JOB_CONSUMPTION", "WASTE"] },
        },
        select: { createdAt: true, delta: true },
      },
    },
  });

  return items
    .map((item) =>
      forecastDemand({
        itemName: item.name,
        consumption: item.stockMovements.map((m) => ({
          at: m.createdAt,
          quantity: Math.abs(Number(m.delta)),
        })),
        quantityOnHand: Number(item.quantityOnHand),
        reorderThreshold: Number(item.reorderThreshold),
        now,
      }),
    )
    .filter((f): f is DemandForecast => f !== null)
    .sort(byUrgency);
}
