"use client";

import { useState, useTransition } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  disqualifyProspect,
  draftProspectOutreach,
  enrichProspectNow,
  qualifyProspect,
} from "@/lib/actions/prospects";
import { cn } from "@/lib/utils";

export type ProspectRowData = {
  id: string;
  businessName: string;
  triggerReason: string;
  source: string;
  category: string | null;
  city: string | null;
  score: number | null;
  rationale: string | null;
  scoreFactors: Array<{ factor: string; points: number; detail: string }>;
  contactName: string | null;
  contactEmail: string | null;
  contactTitle: string | null;
  enrichmentStatus: string;
  website: string | null;
  discoveredAt: string | null;
};

const SOURCE_BADGE: Record<string, string> = {
  FDA: "bg-chart-2/10 text-chart-2",
  PLACES: "bg-chart-1/10 text-chart-1",
  PERMIT: "bg-chart-3/10 text-chart-3",
};

function scoreTone(score: number | null): string {
  if (score == null) return "bg-muted text-muted-foreground";
  if (score >= 70) return "bg-primary text-primary-foreground";
  if (score >= 40) return "bg-primary/15 text-primary";
  return "bg-muted text-muted-foreground";
}

export function ProspectRow({ prospect }: { prospect: ProspectRowData }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(
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
            scoreTone(prospect.score),
          )}
        >
          {prospect.score ?? "—"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">
            {prospect.businessName}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {prospect.triggerReason}
          </span>
        </span>
        <Badge
          variant="outline"
          className={cn("shrink-0", SOURCE_BADGE[prospect.source])}
        >
          {prospect.source.toLowerCase()}
        </Badge>
        {prospect.city ? (
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {prospect.city}
          </span>
        ) : null}
        {open ? (
          <ChevronUp className="size-4 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        )}
      </button>

      {open ? (
        <div className="flex flex-col gap-4 border-t px-4 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                Score breakdown
              </span>
              {prospect.scoreFactors.map((factor) => (
                <span key={factor.factor} className="text-muted-foreground">
                  <span className="font-mono">+{factor.points}</span>{" "}
                  {factor.factor} — {factor.detail}
                </span>
              ))}
            </div>
            <div className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                Contact
              </span>
              {prospect.contactName || prospect.contactEmail ? (
                <>
                  <span>
                    {prospect.contactName ?? "—"}
                    {prospect.contactTitle ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {prospect.contactTitle}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground">
                    {prospect.contactEmail ?? ""}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">
                  Not enriched ({prospect.enrichmentStatus.toLowerCase()})
                </span>
              )}
              {prospect.website ? (
                <a
                  href={prospect.website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  {prospect.website}
                </a>
              ) : null}
            </div>
          </div>

          {draft ? (
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
              <span className="font-medium">{draft.subject}</span>
              <p className="whitespace-pre-wrap text-muted-foreground">
                {draft.body}
              </p>
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(
                      `${draft.subject}\n\n${draft.body}`,
                    );
                    toast.success("Draft copied — review before sending");
                  }}
                >
                  <Copy aria-hidden /> Copy draft
                </Button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await qualifyProspect(prospect.id);
                })
              }
            >
              <UserPlus aria-hidden /> Qualify
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await enrichProspectNow(prospect.id);
                  if (result.ok) toast.success("Contact enriched");
                  else toast.error(result.error);
                })
              }
            >
              <Check aria-hidden /> Enrich
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await draftProspectOutreach(prospect.id);
                  if (result.ok) {
                    setDraft(result.draft);
                    toast.success("Outreach drafted — never auto-sent");
                  } else {
                    toast.error(result.error);
                  }
                })
              }
            >
              <Sparkles aria-hidden /> Draft outreach
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await disqualifyProspect(prospect.id);
                  if (result.ok) toast.success("Disqualified");
                  else toast.error(result.error);
                })
              }
            >
              <X aria-hidden /> Disqualify
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
