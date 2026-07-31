"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertTriangle, HelpCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { draftQuoteFromEnquiry, type RfqDraft } from "@/lib/actions/rfq";
import type { Currency } from "@/lib/format/money";
import { formatMoney } from "@/lib/format/money";

/**
 * Paste an enquiry, get a priced draft. Everything the model inferred is
 * shown as an assumption, and nothing is saved until the CSR opens the
 * builder — the extraction is a starting point, not a decision.
 */
export function RfqIntake({ currency }: { currency: Currency }) {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<RfqDraft | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" aria-hidden />
          Quote from an enquiry
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Textarea
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            "Paste the customer's email or message here — e.g.\n\n" +
            "Hi, we need about 2.5k A5 flyers for the spring campaign, decent\n" +
            "silk paper, folded once, delivered by the 14th. Same as last time.\n"
          }
          className="text-sm"
          maxLength={8000}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={pending || text.trim().length < 20}
            onClick={() =>
              startTransition(async () => {
                const result = await draftQuoteFromEnquiry(text);
                if (result.ok) {
                  setDraft(result.draft);
                  toast.success("Enquiry read — check the assumptions");
                } else {
                  toast.error(result.error);
                }
              })
            }
          >
            <Sparkles aria-hidden />
            {pending ? "Reading…" : "Read enquiry"}
          </Button>
          {draft ? (
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(null);
                setText("");
              }}
            >
              Clear
            </Button>
          ) : null}
          <span className="text-xs text-muted-foreground">
            Extracted by AI, priced by the rules engine. Nothing is saved until
            you create the quote.
          </span>
        </div>

        {draft ? (
          <div className="flex flex-col gap-4 rounded-lg border bg-muted/40 p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {draft.matchedCompanyName ??
                  draft.extraction.companyName ??
                  "Unknown customer"}
              </span>
              {draft.matchedCompanyId ? (
                <Badge variant="secondary">existing customer</Badge>
              ) : (
                <Badge variant="outline">no match — create the company</Badge>
              )}
              {draft.extraction.rush ? (
                <Badge variant="destructive">rush</Badge>
              ) : null}
              {draft.extraction.dueDate ? (
                <span className="text-muted-foreground">
                  due {draft.extraction.dueDate}
                </span>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              {draft.extraction.lines.map((line, i) => (
                <div key={i} className="flex flex-wrap justify-between gap-2">
                  <span>
                    <span className="font-medium">{line.description}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {line.quantity.toLocaleString("sv-SE")}
                      {line.sizeName ? ` · ${line.sizeName}` : ""}
                      {line.stock ? ` · ${line.stock}` : ""}
                      {line.finish ? ` · ${line.finish}` : ""}
                    </span>
                  </span>
                  {draft.pricing?.lines[i] ? (
                    <span className="font-mono">
                      {formatMoney(draft.pricing.lines[i].total, currency)}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>

            {draft.pricing ? (
              <div className="flex justify-between border-t pt-2 font-medium">
                <span>Indicative total (incl. tax)</span>
                <span className="font-mono">
                  {formatMoney(draft.pricing.total, currency)}
                </span>
              </div>
            ) : (
              <p className="text-muted-foreground">
                No pricing rules configured — add them under Settings to price
                extracted enquiries automatically.
              </p>
            )}

            {draft.extraction.assumptions.length > 0 ? (
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-1.5 text-xs font-medium tracking-wider text-chart-3 uppercase">
                  <AlertTriangle className="size-3" aria-hidden />
                  Assumptions — verify before sending
                </span>
                <ul className="list-disc pl-5 text-muted-foreground">
                  {draft.extraction.assumptions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {draft.extraction.clarifications.length > 0 ? (
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  <HelpCircle className="size-3" aria-hidden />
                  Ask the customer
                </span>
                <ul className="list-disc pl-5 text-muted-foreground">
                  {draft.extraction.clarifications.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div>
              <Button
                size="sm"
                render={
                  <Link
                    href={
                      draft.matchedCompanyId
                        ? `/quotes/new?companyId=${draft.matchedCompanyId}`
                        : "/quotes/new"
                    }
                  />
                }
              >
                Continue in the quote builder
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
