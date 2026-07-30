"use client";

import { useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { portalReorder } from "@/lib/actions/portal";

export function ReorderButton({
  token,
  jobId,
}: {
  token: string;
  jobId: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await portalReorder(token, jobId);
          if (result.ok)
            toast.success("Reorder placed — we'll take it from here");
          else toast.error(result.error);
        })
      }
    >
      <RotateCcw aria-hidden /> {pending ? "Ordering…" : "Order again"}
    </Button>
  );
}
