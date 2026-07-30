"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/crm/form-field";
import type { ActionResult } from "@/lib/actions/form";
import { COLOR_MODES, JOB_STATUSES } from "@/lib/validation/jobs";

type Option = { id: string; name: string };

export type JobFormValues = {
  title: string;
  companyId: string;
  status: string;
  pressId: string;
  stock: string;
  sizeName: string;
  widthMm: string;
  heightMm: string;
  colorMode: string;
  finish: string;
  binding: string;
  quantity: string;
  bleedMm: string;
  rush: boolean;
  dueDate: string;
  notes: string;
};

const STATUS_LABELS: Record<string, string> = {
  DESIGN: "Design",
  PROOFING: "Proofing",
  PREPRESS: "Prepress",
  PRINTING: "Printing",
  FINISHING: "Finishing",
  SHIPPING: "Shipping",
  DONE: "Done",
};

const COLOR_LABELS: Record<string, string> = {
  CMYK: "CMYK (4-color process)",
  SPOT: "Spot color",
  PANTONE: "Pantone",
  BLACK_WHITE: "Black & white",
};

export function JobForm({
  action,
  initial,
  companies,
  presses,
  submitLabel,
}: {
  action: (
    prev: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  initial?: JobFormValues;
  companies: Option[];
  presses: Option[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormField
            label="Job title"
            name="title"
            placeholder="e.g. Business cards — spring campaign"
            defaultValue={initial?.title}
            error={errors.title}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="job-company">Company *</Label>
          <Select name="companyId" defaultValue={initial?.companyId || ""}>
            <SelectTrigger id="job-company" className="w-full">
              <SelectValue placeholder="Select company" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.companyId ? (
            <p className="text-sm text-destructive">{errors.companyId}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="job-status">Status</Label>
          <Select name="status" defaultValue={initial?.status || "DESIGN"}>
            <SelectTrigger id="job-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JOB_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <fieldset className="grid gap-4 rounded-xl border p-4 sm:grid-cols-3">
        <legend className="px-1 text-sm font-medium text-muted-foreground">
          Print specification
        </legend>
        <FormField
          label="Stock / paper"
          name="stock"
          placeholder="170gsm silk"
          defaultValue={initial?.stock}
        />
        <FormField
          label="Size name"
          name="sizeName"
          placeholder="A4, 90×55mm…"
          defaultValue={initial?.sizeName}
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="job-colorMode">Color mode</Label>
          <Select name="colorMode" defaultValue={initial?.colorMode || "CMYK"}>
            <SelectTrigger id="job-colorMode" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COLOR_MODES.map((m) => (
                <SelectItem key={m} value={m}>
                  {COLOR_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <FormField
          label="Width (mm)"
          name="widthMm"
          type="number"
          step="0.1"
          min={0}
          defaultValue={initial?.widthMm}
          error={errors.widthMm}
        />
        <FormField
          label="Height (mm)"
          name="heightMm"
          type="number"
          step="0.1"
          min={0}
          defaultValue={initial?.heightMm}
          error={errors.heightMm}
        />
        <FormField
          label="Bleed (mm)"
          name="bleedMm"
          type="number"
          step="0.5"
          min={0}
          placeholder="3"
          defaultValue={initial?.bleedMm}
          error={errors.bleedMm}
        />
        <FormField
          label="Quantity"
          name="quantity"
          type="number"
          min={0}
          defaultValue={initial?.quantity ?? "0"}
          error={errors.quantity}
        />
        <FormField
          label="Finish"
          name="finish"
          placeholder="matte laminate"
          defaultValue={initial?.finish}
        />
        <FormField
          label="Binding"
          name="binding"
          placeholder="saddle stitch"
          defaultValue={initial?.binding}
        />
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="job-press">Press</Label>
          <Select name="pressId" defaultValue={initial?.pressId || ""}>
            <SelectTrigger id="job-press" className="w-full">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              {presses.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <FormField
          label="Due date"
          name="dueDate"
          type="date"
          defaultValue={initial?.dueDate}
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox id="job-rush" name="rush" defaultChecked={initial?.rush} />
        <Label htmlFor="job-rush">Rush job</Label>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="job-notes">Notes</Label>
        <Textarea
          id="job-notes"
          name="notes"
          rows={3}
          defaultValue={initial?.notes}
        />
      </div>

      {state && !state.ok ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
