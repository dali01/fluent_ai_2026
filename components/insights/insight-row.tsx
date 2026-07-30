"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { explainCompanyInsight } from "@/lib/actions/insights";
import type { InsightExplanation } from "@/lib/ai/insights";
import { cn } from "@/lib/utils";

export type InsightRowData = {
  companyId: string;
  companyName: string;
  focus: "reorder" | "churn";
  /** 0..100 for display */
  score: number;
  rationale: string;
  computedAt: string;
};

function scoreTone(score: number, focus: "reorder" | "churn"): string {
  if (score >= 70)
    return focus === "reorder"
      ? "bg-primary text-primary-foreground"
      : "bg-destructive text-white";
  if (score >= 40)
    return focus === "reorder"
      ? "bg-primary/15 text-primary"
      : "bg-destructive/15 text-destructive";
  return "bg-muted text-muted-foreground";
}

export function InsightRow({ insight }: { insight: InsightRowData }) {
  const [open, setOpen] = useState(false);
  const [explanation, setExplanation] = useState<InsightExplanation | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-xl border bg-card">
      <button
        className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-semibold",
            scoreTone(insight.score, insight.focus),
          )}
        >
          {insight.score}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">
            {insight.companyName}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {insight.rationale}
          </span>
        </span>
        {open ? (
          <ChevronUp className="size-4 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        )}
      </button>

      {open ? (
        <div className="flex flex-col gap-4 border-t px-4 py-4 text-sm">
          <p className="text-muted-foreground">{insight.rationale}</p>

          {explanation ? (
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
              <p>{explanation.explanation}</p>
              <p>
                <span className="font-medium">Next step:</span>{" "}
                {explanation.suggestedAction}
              </p>
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Opener:</span>{" "}
                “{explanation.talkingPoint}”
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await explainCompanyInsight(
                    insight.companyId,
                    insight.focus,
                  );
                  if (result.ok) setExplanation(result.explanation);
                  else toast.error(result.error);
                })
              }
            >
              <Sparkles aria-hidden />
              {pending ? "Thinking…" : "Explain"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              render={<Link href={`/companies/${insight.companyId}`} />}
            >
              Open company
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              computed {new Date(insight.computedAt).toLocaleString("sv-SE")}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
