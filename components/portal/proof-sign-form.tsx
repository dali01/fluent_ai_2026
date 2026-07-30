"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { portalResolveProof } from "@/lib/actions/portal";

export function ProofSignForm({
  token,
  proofId,
}: {
  token: string;
  proofId: string;
}) {
  const [signerName, setSignerName] = useState("");
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();

  function resolve(decision: "APPROVED" | "REJECTED") {
    startTransition(async () => {
      const result = await portalResolveProof(
        token,
        proofId,
        decision,
        signerName,
        comment,
      );
      if (result.ok) {
        toast.success(
          decision === "APPROVED"
            ? "Proof approved — thank you!"
            : "Feedback sent to the shop",
        );
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`sign-${proofId}`}>
          Sign with your full name (legally binding approval)
        </Label>
        <Input
          id={`sign-${proofId}`}
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
          placeholder="Anna Lindqvist"
          autoComplete="name"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`comment-${proofId}`}>Comment (optional)</Label>
        <Input
          id={`comment-${proofId}`}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Looks great / please fix…"
        />
      </div>
      <div className="flex gap-2">
        <Button
          disabled={pending || !signerName.trim()}
          onClick={() => resolve("APPROVED")}
        >
          <Check aria-hidden /> Approve proof
        </Button>
        <Button
          variant="outline"
          disabled={pending || !signerName.trim()}
          onClick={() => resolve("REJECTED")}
        >
          <X aria-hidden /> Request changes
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Your name, timestamp, and network details are stored as an electronic
        signature record.
      </p>
    </div>
  );
}
