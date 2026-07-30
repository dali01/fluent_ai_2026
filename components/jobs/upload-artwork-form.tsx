"use client";

import { useActionState, useEffect, useRef } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/actions/form";
import { uploadJobFile } from "@/lib/actions/job-files";

export function UploadArtworkForm({ jobId }: { jobId: string }) {
  const action = uploadJobFile.bind(null, jobId);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) =>
      action(prev, formData),
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      toast.success("File uploaded — prepress checks complete");
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap gap-2">
      <Input
        type="file"
        name="file"
        accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,application/pdf,image/png,image/jpeg,image/tiff"
        className="max-w-xs"
        required
      />
      <Button type="submit" disabled={pending}>
        <Upload aria-hidden />
        {pending ? "Checking…" : "Upload & check"}
      </Button>
    </form>
  );
}
