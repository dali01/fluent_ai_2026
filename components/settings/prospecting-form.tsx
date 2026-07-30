"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/crm/form-field";
import type { ActionResult } from "@/lib/actions/form";
import { saveProspectingSettings } from "@/lib/actions/prospecting-settings";

export function ProspectingSettingsForm({
  initial,
}: {
  initial: {
    enabled: boolean;
    city: string;
    country: string;
    placesQueries: string[];
    minScore: number;
    maxPerRun: number;
  };
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await saveProspectingSettings(prev, formData);
      if (result.ok) toast.success("Prospecting settings saved");
      return result;
    },
    null,
  );
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <div className="flex items-center gap-2">
        <Checkbox
          id="prospecting-enabled"
          name="enabled"
          defaultChecked={initial.enabled}
        />
        <Label htmlFor="prospecting-enabled">
          Enable prospecting for this organization
        </Label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Pilot market city"
          name="city"
          placeholder="Jönköping"
          defaultValue={initial.city}
          error={errors.city}
        />
        <FormField
          label="Country (ISO-2)"
          name="country"
          placeholder="SE"
          maxLength={2}
          defaultValue={initial.country}
          error={errors.country}
        />
        <FormField
          label="Min score to enrich"
          name="minScore"
          type="number"
          min={0}
          max={100}
          defaultValue={initial.minScore}
          error={errors.minScore}
        />
        <FormField
          label="Max enrichments per run"
          name="maxPerRun"
          type="number"
          min={0}
          max={100}
          defaultValue={initial.maxPerRun}
          error={errors.maxPerRun}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="prospecting-queries">
          Places queries (one per line)
        </Label>
        <Textarea
          id="prospecting-queries"
          name="placesQueries"
          rows={4}
          placeholder={"new bakery Jönköping\nnew restaurant Jönköping"}
          defaultValue={initial.placesQueries.join("\n")}
          className="font-mono text-xs"
        />
        {errors.placesQueries ? (
          <p className="text-sm text-destructive">{errors.placesQueries}</p>
        ) : null}
      </div>
      {state && !state.ok ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save prospecting settings"}
        </Button>
      </div>
    </form>
  );
}
