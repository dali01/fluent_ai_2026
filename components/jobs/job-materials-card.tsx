"use client";

import { useActionState, useRef, useEffect, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ActionResult } from "@/lib/actions/form";
import { addJobMaterial, removeJobMaterial } from "@/lib/actions/job-materials";
import { ActualUsageDialog } from "./actual-usage-dialog";

export type MaterialRow = {
  id: string;
  itemName: string;
  unit: string;
  quantityPlanned: number;
  quantityActual: number | null;
  consumed: boolean;
};

export function JobMaterialsCard({
  jobId,
  jobDone,
  materials,
  items,
}: {
  jobId: string;
  jobDone: boolean;
  materials: MaterialRow[];
  items: Array<{ id: string; name: string; unit: string }>;
}) {
  const bound = addJobMaterial.bind(null, jobId);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) =>
      bound(prev, formData),
    null,
  );
  const [removing, startRemove] = useTransition();

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      toast.success("Material planned");
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Materials</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!jobDone ? (
          <form
            ref={formRef}
            action={formAction}
            className="flex flex-wrap gap-2"
          >
            <Select name="inventoryItemId" defaultValue="">
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Pick material" />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} ({item.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              name="quantityPlanned"
              type="number"
              step="0.001"
              min="0.001"
              placeholder="Qty"
              className="w-28"
              required
            />
            <Button type="submit" disabled={pending} variant="outline">
              <Plus aria-hidden /> {pending ? "Adding…" : "Plan"}
            </Button>
          </form>
        ) : null}

        {materials.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No materials planned. Planned materials are deducted from stock
            automatically when the job reaches Done.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {materials.map((material) => (
              <li
                key={material.id}
                className="flex items-center justify-between gap-3"
              >
                <span>
                  {material.itemName}{" "}
                  <span className="font-mono text-muted-foreground">
                    ×{material.quantityPlanned.toLocaleString("sv-SE")}{" "}
                    {material.unit}
                  </span>
                  {material.consumed ? (
                    <span className="ml-2 text-xs text-chart-5">deducted</span>
                  ) : null}
                </span>
                {material.quantityActual !== null ? (
                  <span className="font-mono text-xs">
                    actual {material.quantityActual.toLocaleString("sv-SE")}
                    <span
                      className={
                        material.quantityActual > material.quantityPlanned
                          ? "text-chart-3"
                          : "text-muted-foreground"
                      }
                    >
                      {" "}
                      (
                      {material.quantityActual > material.quantityPlanned
                        ? "+"
                        : ""}
                      {(
                        material.quantityActual - material.quantityPlanned
                      ).toLocaleString("sv-SE")}
                      )
                    </span>
                  </span>
                ) : material.consumed ? (
                  <ActualUsageDialog
                    jobId={jobId}
                    materialId={material.id}
                    itemName={material.itemName}
                    unit={material.unit}
                    quantityPlanned={material.quantityPlanned}
                  />
                ) : null}
                {!material.consumed && !jobDone ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${material.itemName}`}
                    disabled={removing}
                    onClick={() =>
                      startRemove(async () => {
                        await removeJobMaterial(jobId, material.id);
                        toast.success("Removed");
                      })
                    }
                  >
                    <Trash2 aria-hidden />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
