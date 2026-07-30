"use client";

import { useTransition } from "react";
import { AlertTriangle, Ban, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { transitionInvoice } from "@/lib/actions/invoices";

const LABELS: Record<
  string,
  { label: string; icon: typeof Send; variant?: "destructive" | "outline" }
> = {
  SENT: { label: "Mark sent", icon: Send, variant: "outline" },
  OVERDUE: { label: "Mark overdue", icon: AlertTriangle, variant: "outline" },
  VOID: { label: "Void", icon: Ban, variant: "destructive" },
};

export function InvoiceTransitionButtons({
  invoiceId,
  transitions,
}: {
  invoiceId: string;
  transitions: string[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <>
      {transitions
        .filter((t) => t in LABELS)
        .map((next) => {
          const { label, icon: Icon, variant } = LABELS[next];
          return (
            <Button
              key={next}
              variant={variant ?? "outline"}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await transitionInvoice(invoiceId, next);
                  if (result.ok)
                    toast.success(label.replace("Mark ", "Marked "));
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
