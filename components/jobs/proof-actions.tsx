"use client";

import { useState, useTransition } from "react";
import { Check, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resolveProof, sendProof } from "@/lib/actions/job-files";

export function SendProofButton({
  jobId,
  jobFileId,
  contactId,
}: {
  jobId: string;
  jobFileId: string;
  contactId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await sendProof(jobId, jobFileId, contactId);
          if (result.ok) toast.success("Proof sent");
          else toast.error(result.error);
        })
      }
    >
      <Send aria-hidden /> {pending ? "Sending…" : "Send proof"}
    </Button>
  );
}

export function ResolveProofButtons({ proofId }: { proofId: string }) {
  const [pending, startTransition] = useTransition();
  const [comment, setComment] = useState("");

  function resolve(decision: "APPROVED" | "REJECTED") {
    startTransition(async () => {
      const result = await resolveProof(proofId, decision, comment);
      if (result.ok)
        toast.success(
          decision === "APPROVED" ? "Proof approved" : "Proof rejected",
        );
      else toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Client comment (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        className="h-8 max-w-56 text-sm"
      />
      <Button size="sm" disabled={pending} onClick={() => resolve("APPROVED")}>
        <Check aria-hidden /> Approve
      </Button>
      <Button
        size="sm"
        variant="destructive"
        disabled={pending}
        onClick={() => resolve("REJECTED")}
      >
        <X aria-hidden /> Reject
      </Button>
    </div>
  );
}
