"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions/form";
import { FormField } from "./form-field";

type CompanyOption = { id: string; name: string };

export type ContactFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  title: string;
  companyId: string;
  notes: string;
  tags: string[];
};

export function ContactForm({
  action,
  initial,
  companies,
  submitLabel,
}: {
  action: (
    prev: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  initial?: ContactFormValues;
  companies: CompanyOption[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="First name"
          name="firstName"
          defaultValue={initial?.firstName}
          error={errors.firstName}
          required
        />
        <FormField
          label="Last name"
          name="lastName"
          defaultValue={initial?.lastName}
          error={errors.lastName}
          required
        />
        <FormField
          label="Email"
          name="email"
          type="email"
          defaultValue={initial?.email}
          error={errors.email}
        />
        <FormField
          label="Phone"
          name="phone"
          defaultValue={initial?.phone}
          error={errors.phone}
        />
        <FormField
          label="Job title"
          name="title"
          defaultValue={initial?.title}
          error={errors.title}
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="companyId">Company</Label>
          <Select name="companyId" defaultValue={initial?.companyId || ""}>
            <SelectTrigger id="companyId" className="w-full">
              <SelectValue placeholder="No company" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <FormField
        label="Tags (comma-separated)"
        name="tags"
        placeholder="decision-maker, vip"
        defaultValue={initial?.tags.join(", ")}
        error={errors.tags}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={4}
          defaultValue={initial?.notes}
        />
      </div>
      {state && !state.ok ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
