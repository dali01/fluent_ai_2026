"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/actions/form";
import { updateGeneralSettings } from "@/lib/actions/general-settings";
import { CURRENCIES, type Currency } from "@/lib/format/money";

const CURRENCY_LABELS: Record<Currency, string> = {
  SEK: "SEK — Swedish krona",
  EUR: "EUR — Euro",
  USD: "USD — US dollar",
  GBP: "GBP — British pound",
  NOK: "NOK — Norwegian krone",
  DKK: "DKK — Danish krone",
};

export function GeneralSettingsForm({ initial }: { initial: Currency }) {
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await updateGeneralSettings(prev, formData);
      if (result.ok) toast.success("General settings saved");
      return result;
    },
    null,
  );

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="general-currency">Currency</Label>
        <select
          id="general-currency"
          name="currency"
          defaultValue={initial}
          className="border-input h-9 w-64 rounded-md border bg-transparent px-3 text-sm shadow-xs"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {CURRENCY_LABELS[c]}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-sm">
          Display currency for quotes, invoices and the pipeline — amounts are
          not converted.
        </p>
      </div>
      {state && !state.ok ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save general settings"}
        </Button>
      </div>
    </form>
  );
}
