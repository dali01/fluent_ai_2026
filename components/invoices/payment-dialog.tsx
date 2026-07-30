"use client";

import { useActionState, useState } from "react";
import { Banknote } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "@/components/crm/form-field";
import type { ActionResult } from "@/lib/actions/form";
import { recordPayment } from "@/lib/actions/invoices";
import { PAYMENT_METHODS } from "@/lib/validation/invoices";

const METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
  CASH: "Cash",
  CHECK: "Check",
  OTHER: "Other",
};

export function PaymentDialog({
  invoiceId,
  remaining,
  suggestDeposit,
}: {
  invoiceId: string;
  remaining: number;
  suggestDeposit: number | null;
}) {
  const [open, setOpen] = useState(false);
  const bound = recordPayment.bind(null, invoiceId);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await bound(prev, formData);
      if (result.ok) {
        setOpen(false);
        toast.success("Payment recorded");
      }
      return result;
    },
    null,
  );
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Banknote aria-hidden /> Record payment
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <FormField
            label={`Amount — ${remaining.toLocaleString("sv-SE")} remaining`}
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            max={remaining}
            defaultValue={suggestDeposit ?? remaining}
            error={errors.amount}
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-method">Method</Label>
              <Select name="method" defaultValue="BANK_TRANSFER">
                <SelectTrigger id="pay-method" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <FormField
              label="Paid on"
              name="paidAt"
              type="date"
              error={errors.paidAt}
            />
          </div>
          <FormField
            label="Reference"
            name="reference"
            placeholder="OCR / transaction id"
            error={errors.reference}
          />
          <div className="flex items-center gap-2">
            <Checkbox
              id="pay-deposit"
              name="isDeposit"
              defaultChecked={Boolean(suggestDeposit)}
            />
            <Label htmlFor="pay-deposit">This is the deposit</Label>
          </div>
          {state && !state.ok ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Record payment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
