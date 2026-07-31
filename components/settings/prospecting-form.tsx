"use client";

import { useActionState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/crm/form-field";
import type { ActionResult } from "@/lib/actions/form";
import { saveProspectingSettings } from "@/lib/actions/prospecting-settings";
import {
  SOURCE_IDS,
  SOURCE_META,
  type SourceId,
} from "@/lib/prospecting/sources/meta";

export type SourceAvailability = {
  id: SourceId;
  enabled: boolean;
  /** undefined when the connector is ready to run */
  unavailableReason?: string;
};

export function ProspectingSettingsForm({
  initial,
  sources,
}: {
  initial: {
    enabled: boolean;
    city: string;
    country: string;
    placesQueries: string[];
    osmCategories: string[];
    minScore: number;
    maxPerRun: number;
  };
  sources: SourceAvailability[];
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
  const byId = new Map(sources.map((s) => [s.id, s]));

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5">
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

      {/* Per-org agent selection — the master switch above turns
          everything off; these pick which agents run. */}
      <fieldset className="flex flex-col gap-3">
        <legend className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Discovery agents
        </legend>
        {SOURCE_IDS.map((id) => {
          const meta = SOURCE_META[id];
          const state = byId.get(id);
          const unavailable = state?.unavailableReason;
          return (
            <div key={id} className="flex items-start gap-2.5">
              <Checkbox
                id={`source-${id}`}
                name={`source_${id}`}
                defaultChecked={state?.enabled ?? meta.defaultEnabled}
                className="mt-0.5"
              />
              <div className="flex flex-col gap-0.5">
                <Label
                  htmlFor={`source-${id}`}
                  className="flex flex-wrap items-center gap-2"
                >
                  {meta.label}
                  {meta.stub ? (
                    <Badge variant="outline" className="px-1.5 py-0 text-xs">
                      stub
                    </Badge>
                  ) : null}
                  {!meta.requiresEnv ? (
                    <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                      no key needed
                    </Badge>
                  ) : null}
                </Label>
                <span className="text-xs text-muted-foreground">
                  {meta.watches} — {meta.value}
                </span>
                {unavailable ? (
                  <span className="flex items-start gap-1.5 text-xs text-chart-3">
                    <AlertTriangle
                      className="mt-0.5 size-3 shrink-0"
                      aria-hidden
                    />
                    {unavailable}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </fieldset>

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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="prospecting-osm">
          OpenStreetMap categories (one tag per line)
        </Label>
        <Textarea
          id="prospecting-osm"
          name="osmCategories"
          rows={4}
          placeholder={"shop=bakery\namenity=restaurant\noffice=*"}
          defaultValue={initial.osmCategories.join("\n")}
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          OSM tag selectors — <code>key=value</code>, or <code>key=*</code> for
          any value. Needs a market centre (coordinates) to search around.
        </p>
        {errors.osmCategories ? (
          <p className="text-sm text-destructive">{errors.osmCategories}</p>
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
