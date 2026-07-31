"use client";

import { useActionState, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/actions/form";
import { recordActualUsage } from "@/lib/actions/job-materials";

/**
 * Optional by design. Waste stays an estimate from press settings until
 * somebody records a real figure here; nothing forces them to, and the
 * estimate is labelled honestly in the meantime.
 */
export function ActualUsageDialog({
  jobId,
  materialId,
  itemName,
  unit,
  quantityPlanned,
}: {
  jobId: string;
  materialId: string;
  itemName: string;
  unit: string;
  quantityPlanned: number;
}) {
  const [open, setOpen] = useState(false);
  const bound = recordActualUsage.bind(null, jobId, materialId);
  const [, formAction, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await bound(prev, formData);
      if (result.ok) {
        setOpen(false);
        toast.success("Actual usage recorded");
      } else {
        toast.error(result.error);
      }
      return result;
    },
    null,
  );

  // No effect needed to keep the dialog open on failure — it only
  // closes in the success branch above.
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm">
            <ClipboardCheck aria-hidden /> Record actual
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Actual usage — {itemName}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Planned {quantityPlanned.toLocaleString("sv-SE")} {unit}. Recording
            what was really used corrects the stock ledger and lets waste be
            measured instead of estimated.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quantityActual">Actually used ({unit})</Label>
            <Input
              id="quantityActual"
              name="quantityActual"
              type="number"
              step="0.001"
              min="0"
              defaultValue={quantityPlanned}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quantitySpoiled">
              Of which spoiled ({unit}, optional)
            </Label>
            <Input
              id="quantitySpoiled"
              name="quantitySpoiled"
              type="number"
              step="0.001"
              min="0"
              placeholder="e.g. makeready and misprints"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Record"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
