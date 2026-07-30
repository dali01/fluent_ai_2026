"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runProspectSourceNow } from "@/lib/actions/prospects";

/**
 * A run that discovers nothing must say so. SKIPPED is reported as a
 * warning with the exact reason (missing key, agent switched off,
 * prospecting disabled) rather than a success toast.
 */
export function RunSourceButton({
  sourceId,
  label,
  available = true,
}: {
  sourceId: string;
  label: string;
  /** false when the connector is known-unavailable (missing env/config) */
  available?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await runProspectSourceNow(sourceId);
          if (!result.ok) {
            toast.error(`${label} run failed`, { description: result.error });
            return;
          }
          if (result.status === "SKIPPED") {
            toast.warning(`${label} skipped — nothing ran`, {
              description: result.reason,
            });
            return;
          }
          toast.success(
            result.created > 0
              ? `${label}: ${result.created} new prospect${result.created === 1 ? "" : "s"}`
              : `${label}: no new prospects`,
            {
              description: `${result.fetched} fetched · ${result.duplicates} already known · ${result.screenedOut} screened out`,
            },
          );
        })
      }
      title={available ? undefined : `${label} is not configured`}
    >
      <RefreshCw className={pending ? "animate-spin" : ""} aria-hidden />
      {pending ? "Running…" : `Run ${label}`}
    </Button>
  );
}
