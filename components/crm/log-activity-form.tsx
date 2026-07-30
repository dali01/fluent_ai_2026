"use client";

import { useActionState, useRef } from "react";
import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { logActivity } from "@/lib/actions/activity";
import { LOGGABLE_ACTIVITY_TYPES } from "@/lib/validation/crm";

const TYPE_LABELS: Record<string, string> = {
  NOTE: "Note",
  EMAIL: "Email",
  SMS: "SMS",
  CALL: "Call",
  MEETING: "Meeting",
};

export function LogActivityForm({ contactId }: { contactId: string }) {
  const [state, formAction, pending] = useActionState(logActivity, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      toast.success("Logged");
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap gap-2">
      <input type="hidden" name="contactId" value={contactId} />
      <Select name="type" defaultValue="NOTE">
        <SelectTrigger className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LOGGABLE_ACTIVITY_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {TYPE_LABELS[type]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        name="summary"
        placeholder="What happened? e.g. Called about proof feedback"
        className="min-w-64 flex-1"
        required
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Logging…" : "Log"}
      </Button>
    </form>
  );
}
