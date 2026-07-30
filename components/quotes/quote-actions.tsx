"use client";

import { useTransition } from "react";
import { Check, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { transitionQuote } from "@/lib/actions/quotes";

const LABELS: Record<string, { label: string; icon: typeof Send }> = {
  SENT: { label: "Mark sent", icon: Send },
  ACCEPTED: { label: "Mark accepted", icon: Check },
  REJECTED: { label: "Mark rejected", icon: X },
  EXPIRED: { label: "Mark expired", icon: X },
};

export function QuoteTransitionButtons({
  quoteId,
  transitions,
}: {
  quoteId: string;
  transitions: string[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <>
      {transitions
        .filter((t) => t in LABELS)
        .map((next) => {
          const { label, icon: Icon } = LABELS[next];
          return (
            <Button
              key={next}
              variant={next === "REJECTED" ? "destructive" : "outline"}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await transitionQuote(quoteId, next);
                  if (result.ok) toast.success(label.replace("Mark", "Marked"));
                  else toast.error(result.error);
                })
              }
            >
              <Icon aria-hidden /> {label}
            </Button>
          );
        })}
    </>
  );
}
