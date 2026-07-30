"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { recomputeInsightsNow } from "@/lib/actions/insights";

export function RecomputeButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await recomputeInsightsNow();
          if (result.ok) toast.success("Insights recomputed");
          else toast.error(result.error);
        })
      }
    >
      <RefreshCw className={pending ? "animate-spin" : ""} aria-hidden />
      {pending ? "Computing…" : "Recompute"}
    </Button>
  );
}
