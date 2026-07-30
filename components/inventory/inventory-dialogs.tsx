"use client";

import { useActionState, useState } from "react";
import { ArrowUpDown, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "@/components/crm/form-field";
import type { ActionResult } from "@/lib/actions/form";
import { adjustStock, saveInventoryItem } from "@/lib/actions/inventory";
import {
  ADJUSTMENT_REASONS,
  INVENTORY_TYPES,
} from "@/lib/validation/inventory";

export type ItemForDialog = {
  id: string;
  name: string;
  type: string;
  sku: string | null;
  unit: string;
  reorderThreshold: number;
  costPerUnit: number | null;
};

export function InventoryItemDialog({ item }: { item?: ItemForDialog }) {
  const [open, setOpen] = useState(false);
  const bound = saveInventoryItem.bind(null, item?.id ?? null);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await bound(prev, formData);
      if (result.ok) {
        setOpen(false);
        toast.success("Item saved");
      }
      return result;
    },
    null,
  );
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          item ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit ${item.name}`}
            >
              <Pencil aria-hidden />
            </Button>
          ) : (
            <Button>
              <Plus aria-hidden /> New item
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {item ? `Edit ${item.name}` : "New inventory item"}
          </DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <FormField
            label="Name"
            name="name"
            placeholder="Silk 170gsm 720×1020"
            defaultValue={item?.name}
            error={errors.name}
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-type">Type</Label>
              <Select name="type" defaultValue={item?.type ?? "PAPER"}>
                <SelectTrigger id="inv-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVENTORY_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">
                      {t.toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <FormField
              label="SKU"
              name="sku"
              defaultValue={item?.sku ?? ""}
              error={errors.sku}
            />
            <FormField
              label="Unit"
              name="unit"
              placeholder="sheet / kg / litre / roll"
              defaultValue={item?.unit ?? "sheet"}
              error={errors.unit}
              required
            />
            <FormField
              label="Cost per unit (kr)"
              name="costPerUnit"
              type="number"
              step="0.01"
              min={0}
              defaultValue={item?.costPerUnit ?? ""}
              error={errors.costPerUnit}
            />
            {!item ? (
              <FormField
                label="Opening stock"
                name="quantityOnHand"
                type="number"
                step="0.001"
                min={0}
                defaultValue={0}
                error={errors.quantityOnHand}
              />
            ) : null}
            <FormField
              label="Reorder threshold"
              name="reorderThreshold"
              type="number"
              step="0.001"
              min={0}
              defaultValue={item?.reorderThreshold ?? 0}
              error={errors.reorderThreshold}
            />
          </div>
          {state && !state.ok ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save item"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AdjustStockDialog({
  items,
}: {
  items: Array<{ id: string; name: string; unit: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await adjustStock(prev, formData);
      if (result.ok) {
        setOpen(false);
        toast.success("Stock adjusted");
      }
      return result;
    },
    null,
  );
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <ArrowUpDown aria-hidden /> Adjust stock
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adj-item">Item</Label>
            <Select name="inventoryItemId" defaultValue="">
              <SelectTrigger id="adj-item" className="w-full">
                <SelectValue placeholder="Pick item" />
              </SelectTrigger>
              <SelectContent>
                {items.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name} ({i.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.inventoryItemId ? (
              <p className="text-sm text-destructive">
                {errors.inventoryItemId}
              </p>
            ) : null}
          </div>
          <FormField
            label="Delta (+ in / − out)"
            name="delta"
            type="number"
            step="0.001"
            placeholder="-500 or 2000"
            error={errors.delta}
            required
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adj-reason">Reason</Label>
            <Select name="reason" defaultValue="ADJUSTMENT">
              <SelectTrigger id="adj-reason" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADJUSTMENT_REASONS.map((r) => (
                  <SelectItem key={r} value={r} className="capitalize">
                    {r.toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <FormField label="Note" name="note" error={errors.note} />
          {state && !state.ok ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Record movement"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
