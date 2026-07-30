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
import { type ActionResult } from "@/lib/actions/form";
import { createLead } from "@/lib/actions/leads";
import { LEAD_STAGES } from "@/lib/validation/crm";
import { FormField } from "./form-field";

type Option = { id: string; name: string };

export function NewLeadDialog({
  companies,
  contacts,
}: {
  companies: Option[];
  contacts: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await createLead(prev, formData);
      if (result.ok) {
        setOpen(false);
        toast.success("Lead created");
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
            <Plus aria-hidden /> New lead
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New lead</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <FormField
            label="Title"
            name="title"
            placeholder="e.g. Business cards for spring campaign"
            error={errors.title}
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lead-stage">Stage</Label>
              <Select name="stage" defaultValue={LEAD_STAGES[0]}>
                <SelectTrigger id="lead-stage" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_STAGES.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {stage.replaceAll("_", " ").toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <FormField
              label="Value"
              name="value"
              type="number"
              min={0}
              step="100"
              error={errors.value}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lead-company">Company</Label>
              <Select name="companyId" defaultValue="">
                <SelectTrigger id="lead-company" className="w-full">
                  <SelectValue placeholder="No company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lead-contact">Contact</Label>
              <Select name="contactId" defaultValue="">
                <SelectTrigger id="lead-contact" className="w-full">
                  <SelectValue placeholder="No contact" />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <FormField
            label="Source"
            name="source"
            placeholder="email, referral, website…"
            error={errors.source}
          />
          {state && !state.ok ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create lead"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
