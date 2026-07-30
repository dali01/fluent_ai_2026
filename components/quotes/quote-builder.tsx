"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveQuote } from "@/lib/actions/quotes";
import { type Currency, formatMoney } from "@/lib/format/money";
import { computeQuote, type EngineRule } from "@/lib/pricing/engine";

export type BuilderCompany = {
  id: string;
  name: string;
  tierName: string | null;
  tierMultiplier: number;
};

type LineRow = {
  key: number;
  description: string;
  quantity: string;
  unitPriceOverride: string;
  stock: string;
  finish: string;
};

const emptyRow = (key: number): LineRow => ({
  key,
  description: "",
  quantity: "1000",
  unitPriceOverride: "",
  stock: "",
  finish: "",
});

export function QuoteBuilder({
  quoteId,
  companies,
  rules,
  currency = "SEK",
  initial,
}: {
  quoteId?: string;
  companies: BuilderCompany[];
  rules: EngineRule[];
  currency?: Currency;
  initial?: {
    companyId: string;
    rush: boolean;
    validUntil: string;
    notes: string;
    lines: Array<{
      description: string;
      quantity: number;
      unitPriceOverride: number | null;
      stock: string;
      finish: string;
    }>;
  };
}) {
  const kr = (n: number) => formatMoney(n, currency);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [companyId, setCompanyId] = useState(initial?.companyId ?? "");
  const [rush, setRush] = useState(initial?.rush ?? false);
  const [validUntil, setValidUntil] = useState(initial?.validUntil ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [rows, setRows] = useState<LineRow[]>(
    initial?.lines.length
      ? initial.lines.map((line, i) => ({
          key: i,
          description: line.description,
          quantity: String(line.quantity),
          unitPriceOverride: line.unitPriceOverride?.toString() ?? "",
          stock: line.stock,
          finish: line.finish,
        }))
      : [emptyRow(0)],
  );

  const company = companies.find((c) => c.id === companyId);

  const lineInputs = useMemo(
    () =>
      rows
        .filter((row) => row.description.trim() && Number(row.quantity) > 0)
        .map((row) => ({
          description: row.description.trim(),
          quantity: Number(row.quantity),
          unitPriceOverride: row.unitPriceOverride
            ? Number(row.unitPriceOverride)
            : null,
          specs: {
            stock: row.stock.trim() || undefined,
            finish: row.finish.trim() || undefined,
          },
        })),
    [rows],
  );

  const preview = useMemo(
    () =>
      computeQuote(lineInputs, rules, {
        rush,
        tierMultiplier: company?.tierMultiplier ?? 1,
      }),
    [lineInputs, rules, rush, company],
  );

  function updateRow(key: number, patch: Partial<LineRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function save() {
    startTransition(async () => {
      const result = await saveQuote(quoteId ?? null, {
        companyId,
        rush,
        validUntil,
        notes,
        lines: lineInputs,
      });
      if (result.ok) {
        toast.success("Quote saved");
        router.push(`/quotes/${result.quoteId}`);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qb-company">Company *</Label>
            <Select
              value={companyId}
              onValueChange={(v) => setCompanyId(v ?? "")}
            >
              <SelectTrigger id="qb-company" className="w-full">
                <SelectValue placeholder="Select company" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.tierName ? ` (${c.tierName})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qb-valid">Valid until</Label>
            <Input
              id="qb-valid"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </div>
          <div className="flex items-end gap-2 pb-2">
            <Checkbox
              id="qb-rush"
              checked={rush}
              onCheckedChange={(v) => setRush(v === true)}
            />
            <Label htmlFor="qb-rush">Rush job</Label>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="hidden gap-2 text-xs font-medium text-muted-foreground md:grid md:grid-cols-[1fr_90px_110px_140px_140px_32px]">
            <span>Description</span>
            <span>Qty</span>
            <span>Unit price*</span>
            <span>Stock</span>
            <span>Finish</span>
            <span />
          </div>
          {rows.map((row) => (
            <div
              key={row.key}
              className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_90px_110px_140px_140px_32px] md:border-0 md:p-0"
            >
              <Input
                placeholder="A5 flyers, 4/4"
                value={row.description}
                onChange={(e) =>
                  updateRow(row.key, { description: e.target.value })
                }
              />
              <Input
                type="number"
                min={1}
                value={row.quantity}
                onChange={(e) =>
                  updateRow(row.key, { quantity: e.target.value })
                }
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="auto"
                value={row.unitPriceOverride}
                onChange={(e) =>
                  updateRow(row.key, { unitPriceOverride: e.target.value })
                }
              />
              <Input
                placeholder="170gsm silk"
                value={row.stock}
                onChange={(e) => updateRow(row.key, { stock: e.target.value })}
              />
              <Input
                placeholder="laminate"
                value={row.finish}
                onChange={(e) => updateRow(row.key, { finish: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove line"
                onClick={() =>
                  setRows((rs) =>
                    rs.length > 1 ? rs.filter((r) => r.key !== row.key) : rs,
                  )
                }
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setRows((rs) => [
                  ...rs,
                  emptyRow(Math.max(...rs.map((r) => r.key)) + 1),
                ])
              }
            >
              <Plus aria-hidden /> Add line
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            * Leave unit price empty to price from the org&apos;s quantity-tier
            rules.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="qb-notes">Notes</Label>
          <Textarea
            id="qb-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      <Card className="h-fit lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {preview.lines.map((line, i) => (
            <div key={i} className="flex justify-between gap-3">
              <span className="truncate text-muted-foreground">
                {line.description} ×{line.quantity}
              </span>
              <span className="shrink-0 font-mono">{kr(line.total)}</span>
            </div>
          ))}
          {preview.applied.map((rule) => (
            <div key={rule.ruleId} className="flex justify-between gap-3">
              <span className="text-muted-foreground">{rule.ruleName}</span>
              <span className="shrink-0 font-mono">{kr(rule.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t pt-2">
            <span>Subtotal</span>
            <span className="font-mono">
              {kr(preview.subtotal + preview.rushFee)}
            </span>
          </div>
          {preview.tierAdjustment !== 0 ? (
            <div className="flex justify-between text-muted-foreground">
              <span>
                {company?.tierName ?? "Tier"} ×{preview.tierMultiplier}
              </span>
              <span className="font-mono">{kr(preview.tierAdjustment)}</span>
            </div>
          ) : null}
          <div className="flex justify-between text-muted-foreground">
            <span>VAT {Math.round(preview.taxRate * 100)}%</span>
            <span className="font-mono">{kr(preview.taxAmount)}</span>
          </div>
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <span>Total</span>
            <span className="font-mono">{kr(preview.total)}</span>
          </div>
          {preview.skippedRules.length > 0 ? (
            <p className="text-xs text-destructive">
              {preview.skippedRules.length} pricing rule(s) skipped due to
              invalid config — check Settings.
            </p>
          ) : null}
          <Button
            className="mt-2"
            disabled={pending || !companyId || lineInputs.length === 0}
            onClick={save}
          >
            {pending ? "Saving…" : quoteId ? "Save changes" : "Save draft"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
