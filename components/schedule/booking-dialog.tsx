"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { createScheduleBlock } from "@/lib/actions/schedule";

type Option = { id: string; name: string };

export function BookingDialog({
  presses,
  jobs,
}: {
  presses: Option[];
  jobs: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await createScheduleBlock(prev, formData);
      if (result.ok) {
        setOpen(false);
        toast.success("Press time booked");
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
            <Plus aria-hidden /> Book press time
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Book press time</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="book-press">Press *</Label>
            <Select name="pressId" defaultValue="">
              <SelectTrigger id="book-press" className="w-full">
                <SelectValue placeholder="Pick press" />
              </SelectTrigger>
              <SelectContent>
                {presses.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.pressId ? (
              <p className="text-sm text-destructive">{errors.pressId}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="book-job">Job (optional)</Label>
            <Select name="jobId" defaultValue="">
              <SelectTrigger id="book-job" className="w-full">
                <SelectValue placeholder="No job" />
              </SelectTrigger>
              <SelectContent>
                {jobs.map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Starts"
              name="startsAt"
              type="datetime-local"
              error={errors.startsAt}
              required
            />
            <FormField
              label="Ends"
              name="endsAt"
              type="datetime-local"
              error={errors.endsAt}
              required
            />
          </div>
          <FormField label="Note" name="note" error={errors.note} />
          {state && !state.ok ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Booking…" : "Book"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
