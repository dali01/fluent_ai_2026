"use client";

import { useActionState, useState, useTransition } from "react";
import { Archive, Pencil, Plus } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/crm/form-field";
import type { ActionResult } from "@/lib/actions/form";
import { archiveVendor, saveVendor } from "@/lib/actions/vendors";

export type VendorForDialog = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  services: string | null;
  notes: string | null;
};

export function VendorDialog({ vendor }: { vendor?: VendorForDialog }) {
  const [open, setOpen] = useState(false);
  const bound = saveVendor.bind(null, vendor?.id ?? null);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await bound(prev, formData);
      if (result.ok) {
        setOpen(false);
        toast.success("Vendor saved");
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
          vendor ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit ${vendor.name}`}
            >
              <Pencil aria-hidden />
            </Button>
          ) : (
            <Button>
              <Plus aria-hidden /> New vendor
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {vendor ? `Edit ${vendor.name}` : "New vendor"}
          </DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <FormField
            label="Name"
            name="name"
            defaultValue={vendor?.name}
            error={errors.name}
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Email"
              name="email"
              type="email"
              defaultValue={vendor?.email ?? ""}
              error={errors.email}
            />
            <FormField
              label="Phone"
              name="phone"
              defaultValue={vendor?.phone ?? ""}
              error={errors.phone}
            />
          </div>
          <FormField
            label="Services"
            name="services"
            placeholder="foiling, die-cutting, embossing"
            defaultValue={vendor?.services ?? ""}
            error={errors.services}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vendor-notes">Notes</Label>
            <Textarea
              id="vendor-notes"
              name="notes"
              rows={3}
              defaultValue={vendor?.notes ?? ""}
            />
          </div>
          {state && !state.ok ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save vendor"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ArchiveVendorButton({
  vendorId,
  name,
}: {
  vendorId: string;
  name: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Archive ${name}`}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await archiveVendor(vendorId);
          toast.success("Vendor archived");
        })
      }
    >
      <Archive aria-hidden />
    </Button>
  );
}
