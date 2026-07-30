"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteScheduleBlock } from "@/lib/actions/schedule";

export function CancelBookingButton({ blockId }: { blockId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label="Cancel booking"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await deleteScheduleBlock(blockId);
          toast.success("Booking cancelled");
        })
      }
    >
      <X aria-hidden />
    </Button>
  );
}
