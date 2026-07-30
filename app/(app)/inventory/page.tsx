import { AlertTriangle, Boxes } from "lucide-react";
import {
  AdjustStockDialog,
  InventoryItemDialog,
} from "@/components/inventory/inventory-dialogs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";

export const metadata = { title: "Inventory" };

export default async function InventoryPage() {
  const { orgId } = await requireOrg();
  const db = tenantDb(orgId);

  const [items, movements] = await Promise.all([
    db.inventoryItem.findMany({
      where: { deletedAt: null },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
    db.stockMovement.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      include: {
        inventoryItem: { select: { name: true, unit: true } },
        job: { select: { id: true, jobNumber: true } },
      },
    }),
  ]);

  const lowStock = items.filter(
    (i) => Number(i.quantityOnHand) <= Number(i.reorderThreshold),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        <div className="flex gap-2">
          <AdjustStockDialog
            items={items.map((i) => ({ id: i.id, name: i.name, unit: i.unit }))}
          />
          <InventoryItemDialog />
        </div>
      </div>

      {lowStock.length > 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-chart-3/40 bg-chart-3/10 px-4 py-3 text-sm">
          <AlertTriangle className="size-4 text-chart-3" aria-hidden />
          <span>
            <span className="font-medium">
              {lowStock.length} item(s) at or below reorder threshold:
            </span>{" "}
            {lowStock.map((i) => i.name).join(", ")}
          </span>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-muted-foreground">
          <Boxes className="size-8" aria-hidden />
          <p>No inventory yet. Add paper and ink stock.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Reorder at</TableHead>
                <TableHead className="text-right">Cost/unit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const low =
                  Number(item.quantityOnHand) <= Number(item.reorderThreshold);
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <span className="font-medium">{item.name}</span>
                      {item.sku ? (
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {item.sku}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="capitalize">
                      {item.type.toLowerCase()}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(item.quantityOnHand).toLocaleString("sv-SE")}{" "}
                      <span className="text-muted-foreground">{item.unit}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(item.reorderThreshold).toLocaleString("sv-SE")}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {item.costPerUnit
                        ? `${Number(item.costPerUnit).toLocaleString("sv-SE")} kr`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {low ? (
                        <Badge variant="destructive">Low stock</Badge>
                      ) : (
                        <Badge variant="secondary">OK</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <InventoryItemDialog
                        item={{
                          id: item.id,
                          name: item.name,
                          type: item.type,
                          sku: item.sku,
                          unit: item.unit,
                          reorderThreshold: Number(item.reorderThreshold),
                          costPerUnit: item.costPerUnit
                            ? Number(item.costPerUnit)
                            : null,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">
          Recent movements
        </h2>
        {movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">No movements yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Delta</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-muted-foreground">
                      {m.createdAt.toLocaleString("sv-SE", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </TableCell>
                    <TableCell>{m.inventoryItem.name}</TableCell>
                    <TableCell
                      className={`text-right font-mono ${Number(m.delta) < 0 ? "text-destructive" : "text-chart-5"}`}
                    >
                      {Number(m.delta) > 0 ? "+" : ""}
                      {Number(m.delta).toLocaleString("sv-SE")}
                    </TableCell>
                    <TableCell className="capitalize">
                      {m.reason.replaceAll("_", " ").toLowerCase()}
                    </TableCell>
                    <TableCell>
                      {m.job ? (
                        <a
                          href={`/jobs/${m.job.id}`}
                          className="font-mono hover:underline"
                        >
                          #{m.job.jobNumber}
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.note ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
