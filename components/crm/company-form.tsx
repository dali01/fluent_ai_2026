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
import type { ActionResult } from "@/lib/actions/form";
import { FormField } from "./form-field";

type PriceTierOption = { id: string; name: string };

export type CompanyFormValues = {
  name: string;
  email: string;
  phone: string;
  website: string;
  city: string;
  country: string;
  isReseller: boolean;
  priceTierId: string;
  notes: string;
  tags: string[];
};

export function CompanyForm({
  action,
  initial,
  priceTiers,
  submitLabel,
}: {
  action: (
    prev: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  initial?: CompanyFormValues;
  priceTiers: PriceTierOption[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <FormField
        label="Name"
        name="name"
        defaultValue={initial?.name}
        error={errors.name}
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Email"
          name="email"
          type="email"
          defaultValue={initial?.email}
          error={errors.email}
        />
        <FormField
          label="Phone"
          name="phone"
          defaultValue={initial?.phone}
          error={errors.phone}
        />
        <FormField
          label="Website"
          name="website"
          defaultValue={initial?.website}
          error={errors.website}
        />
        <FormField
          label="City"
          name="city"
          defaultValue={initial?.city}
          error={errors.city}
        />
        <FormField
          label="Country (ISO-2)"
          name="country"
          placeholder="SE"
          maxLength={2}
          defaultValue={initial?.country}
          error={errors.country}
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="priceTierId">Price tier</Label>
          <Select name="priceTierId" defaultValue={initial?.priceTierId || ""}>
            <SelectTrigger id="priceTierId" className="w-full">
              <SelectValue placeholder="No tier" />
            </SelectTrigger>
            <SelectContent>
              {priceTiers.map((tier) => (
                <SelectItem key={tier.id} value={tier.id}>
                  {tier.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <FormField
        label="Tags (comma-separated)"
        name="tags"
        placeholder="agency, packaging"
        defaultValue={initial?.tags.join(", ")}
        error={errors.tags}
      />
      <div className="flex items-center gap-2">
        <Checkbox
          id="isReseller"
          name="isReseller"
          defaultChecked={initial?.isReseller}
        />
        <Label htmlFor="isReseller">
          Reseller / agency (wholesale pricing)
        </Label>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={4}
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
