"use client";

import { useActionState, useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/crm/form-field";
import type { ActionResult } from "@/lib/actions/form";
import {
  deletePricingRule,
  savePriceTier,
  savePricingRule,
} from "@/lib/actions/pricing";

const CONFIG_EXAMPLES: Record<string, string> = {
  QUANTITY_TIER:
    '{"tiers":[{"minQty":0,"unitPrice":4},{"minQty":1000,"unitPrice":2.5}]}',
  STOCK: '{"stock":"silk","surchargePerUnit":0.3}',
  FINISHING: '{"finish":"laminate","perUnit":0.5,"flat":200}',
  RUSH_FEE: '{"percent":25,"flat":0}',
  SETUP_FEE: '{"flat":500}',
};

export function PriceTierDialog({
  tier,
}: {
  tier?: {
    id: string;
    name: string;
    multiplier: number;
    isResellerTier: boolean;
  };
}) {
  const [open, setOpen] = useState(false);
  const bound = savePriceTier.bind(null, tier?.id ?? null);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await bound(prev, formData);
      if (result.ok) {
        setOpen(false);
        toast.success("Tier saved");
      }
      return result;
    },
    null,
  );
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          tier ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit ${tier.name}`}
            >
              <Pencil aria-hidden />
            </Button>
          ) : (
            <Button variant="outline" size="sm">
              <Plus aria-hidden /> New tier
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {tier ? `Edit ${tier.name}` : "New price tier"}
          </DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <FormField
            label="Name"
            name="name"
            defaultValue={tier?.name}
            error={errors.name}
            required
          />
          <FormField
            label="Multiplier (1 = list price, 0.8 = 20% off)"
            name="multiplier"
            type="number"
            step="0.01"
            min="0.05"
            max="10"
            defaultValue={tier?.multiplier ?? 1}
            error={errors.multiplier}
            required
          />
          <div className="flex items-center gap-2">
            <Checkbox
              id={`tier-reseller-${tier?.id ?? "new"}`}
              name="isResellerTier"
              defaultChecked={tier?.isResellerTier}
            />
            <Label htmlFor={`tier-reseller-${tier?.id ?? "new"}`}>
              Reseller / wholesale tier
            </Label>
          </div>
          {state && !state.ok ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save tier"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PricingRuleDialog({
  rule,
}: {
  rule?: {
    id: string;
    name: string;
    type: string;
    active: boolean;
    config: unknown;
  };
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(rule?.type ?? "QUANTITY_TIER");
  const bound = savePricingRule.bind(null, rule?.id ?? null);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      const result = await bound(prev, formData);
      if (result.ok) {
        setOpen(false);
        toast.success("Rule saved");
      }
      return result;
    },
    null,
  );
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          rule ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit ${rule.name}`}
            >
              <Pencil aria-hidden />
            </Button>
          ) : (
            <Button variant="outline" size="sm">
              <Plus aria-hidden /> New rule
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {rule ? `Edit ${rule.name}` : "New pricing rule"}
          </DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <FormField
            label="Name"
            name="name"
            defaultValue={rule?.name}
            error={errors.name}
            required
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-type">Type</Label>
            <Select
              name="type"
              value={type}
              onValueChange={(v) => setType(v ?? "QUANTITY_TIER")}
            >
              <SelectTrigger id="rule-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(CONFIG_EXAMPLES).map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replaceAll("_", " ").toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-config">Config (JSON)</Label>
            <Textarea
              id="rule-config"
              name="config"
              rows={4}
              className="font-mono text-xs"
              defaultValue={
                rule ? JSON.stringify(rule.config) : CONFIG_EXAMPLES[type]
              }
              key={rule ? rule.id : type} // reset example when type changes
            />
            {errors.config ? (
              <p className="text-sm text-destructive">{errors.config}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Example: {CONFIG_EXAMPLES[type]}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`rule-active-${rule?.id ?? "new"}`}
              name="active"
              defaultChecked={rule?.active ?? true}
            />
            <Label htmlFor={`rule-active-${rule?.id ?? "new"}`}>Active</Label>
          </div>
          {state && !state.ok ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save rule"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteRuleButton({
  ruleId,
  name,
}: {
  ruleId: string;
  name: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Delete ${name}`}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await deletePricingRule(ruleId);
          toast.success("Rule deleted");
        })
      }
    >
      <Trash2 aria-hidden />
    </Button>
  );
}
