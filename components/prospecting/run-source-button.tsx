"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runProspectSourceNow } from "@/lib/actions/prospects";

export function RunSourceButton({
  sourceId,
  label,
}: {
  sourceId: string;
  label: string;
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
          if (result.ok) toast.success(`${label} run finished`);
          else toast.error(result.error);
        })
      }
    >
      <RefreshCw className={pending ? "animate-spin" : ""} aria-hidden />
      {pending ? "Running…" : `Run ${label}`}
    </Button>
  );
}
