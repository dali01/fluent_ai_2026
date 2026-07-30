"use client";

import { useState, useTransition } from "react";
import { Copy, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { explainJobFilePrepress } from "@/lib/actions/job-files";
import type { PrepressExplanation } from "@/lib/ai/prepress";

export function ExplainPrepressButton({ jobFileId }: { jobFileId: string }) {
  const [explanation, setExplanation] = useState<PrepressExplanation | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      {explanation ? (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="text-muted-foreground">{explanation.summary}</p>
          <p className="whitespace-pre-wrap">{explanation.customerMessage}</p>
          {explanation.fixes.length > 0 ? (
            <ul className="list-disc pl-5 text-muted-foreground">
              {explanation.fixes.map((fix) => (
                <li key={fix}>{fix}</li>
              ))}
            </ul>
          ) : null}
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(
                  `${explanation.customerMessage}\n\n${explanation.fixes.map((f) => `• ${f}`).join("\n")}`.trim(),
                );
                toast.success("Copied — review before sending");
              }}
            >
              <Copy aria-hidden /> Copy for customer
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await explainJobFilePrepress(jobFileId);
                if (result.ok) setExplanation(result.explanation);
                else toast.error(result.error);
              })
            }
          >
            <Sparkles aria-hidden />
            {pending ? "Thinking…" : "Explain in plain English"}
          </Button>
        </div>
      )}
    </div>
  );
}
