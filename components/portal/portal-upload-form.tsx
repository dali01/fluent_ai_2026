"use client";

import { useActionState, useEffect, useRef } from "react";
import { Upload } from "lucide-react";
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
import type { ActionResult } from "@/lib/actions/form";
import { portalUploadFile } from "@/lib/actions/portal";

export function PortalUploadForm({
  token,
  jobs,
}: {
  token: string;
  jobs: Array<{ id: string; label: string }>;
}) {
  const bound = portalUploadFile.bind(null, token);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) =>
      bound(prev, formData),
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      toast.success("File received — we'll check it right away");
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap gap-2">
      <Select name="jobId" defaultValue={jobs[0]?.id ?? ""}>
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Pick order" />
        </SelectTrigger>
        <SelectContent>
          {jobs.map((job) => (
            <SelectItem key={job.id} value={job.id}>
              {job.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="file"
        name="file"
        accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff"
        className="max-w-xs"
        required
      />
      <Button type="submit" disabled={pending || jobs.length === 0}>
        <Upload aria-hidden /> {pending ? "Uploading…" : "Upload artwork"}
      </Button>
    </form>
  );
}
