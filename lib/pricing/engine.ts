import { RULE_CONFIG_SCHEMAS, type PricingRuleType } from "./rule-schemas";

/**
 * Deterministic pricing engine — pure functions, no DB access. Server
 * actions load the org's active rules + the company's tier and call
 * computeQuote; the quote builder imports the same functions for live
 * preview so preview and persisted numbers can never diverge.
 *
 * Money flows as plain numbers (SEK öre-precision is irrelevant at print
 * price magnitudes); persisted values round to 2 decimals at the edge.
 */

export type EngineRule = {
  id: string;
  name: string;
  type: PricingRuleType;
  config: unknown;
};

export type LineSpecs = {
  productType?: string;
  stock?: string;
  finish?: string;
};

export type LineInput = {
  description: string;
  quantity: number;
  /** manual price override — when set, QUANTITY_TIER rules are skipped */
  unitPriceOverride?: number | null;
  specs?: LineSpecs;
};

export type AppliedRule = {
  ruleId: string;
  ruleName: string;
  type: PricingRuleType;
  amount: number;
  detail: string;
};

export type LineResult = {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  applied: AppliedRule[];
};

export type QuoteComputation = {
  lines: LineResult[];
  subtotal: number;
  tierMultiplier: number;
  tierAdjustment: number;
  rushFee: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  applied: AppliedRule[]; // quote-level rules (rush, setup)
  skippedRules: Array<{ ruleId: string; ruleName: string; reason: string }>;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function parseRules(rules: EngineRule[]) {
  const valid: Array<EngineRule & { parsed: unknown }> = [];
  const skipped: QuoteComputation["skippedRules"] = [];
  for (const rule of rules) {
    const schema = RULE_CONFIG_SCHEMAS[rule.type];
    if (!schema) {
      skipped.push({
        ruleId: rule.id,
        ruleName: rule.name,
        reason: `unknown type ${rule.type}`,
      });
      continue;
    }
    const result = schema.safeParse(rule.config);
    if (!result.success) {
      skipped.push({
        ruleId: rule.id,
        ruleName: rule.name,
        reason: "invalid config",
      });
      continue;
    }
    valid.push({ ...rule, parsed: result.data });
  }
  return { valid, skipped };
}

const has = (haystack: string | undefined, needle: string) =>
  (haystack ?? "").toLowerCase().includes(needle.toLowerCase());

export function computeLine(
  line: LineInput,
  rules: Array<EngineRule & { parsed: unknown }>,
): LineResult {
  const applied: AppliedRule[] = [];
  let unitPrice = line.unitPriceOverride ?? 0;

  if (line.unitPriceOverride == null) {
    // Highest matching quantity tier wins (most specific price break)
    for (const rule of rules) {
      if (rule.type !== "QUANTITY_TIER") continue;
      const config = rule.parsed as {
        productType?: string;
        tiers: Array<{ minQty: number; unitPrice: number }>;
      };
      if (
        config.productType &&
        !has(line.specs?.productType, config.productType)
      ) {
        continue;
      }
      const tier = [...config.tiers]
        .sort((a, b) => a.minQty - b.minQty)
        .filter((t) => t.minQty <= line.quantity)
        .pop();
      if (tier) {
        unitPrice = tier.unitPrice;
        applied.push({
          ruleId: rule.id,
          ruleName: rule.name,
          type: "QUANTITY_TIER",
          amount: tier.unitPrice,
          detail: `unit price ${tier.unitPrice} at qty ≥ ${tier.minQty}`,
        });
        break; // first matching tier rule wins; keep rules curated
      }
    }
  }

  for (const rule of rules) {
    if (rule.type === "STOCK") {
      const config = rule.parsed as { stock: string; surchargePerUnit: number };
      if (has(line.specs?.stock, config.stock)) {
        unitPrice += config.surchargePerUnit;
        applied.push({
          ruleId: rule.id,
          ruleName: rule.name,
          type: "STOCK",
          amount: config.surchargePerUnit,
          detail: `+${config.surchargePerUnit}/unit for ${config.stock}`,
        });
      }
    }
  }

  let total = unitPrice * line.quantity;

  for (const rule of rules) {
    if (rule.type === "FINISHING") {
      const config = rule.parsed as {
        finish: string;
        perUnit: number;
        flat: number;
      };
      if (has(line.specs?.finish, config.finish)) {
        const amount = config.perUnit * line.quantity + config.flat;
        total += amount;
        applied.push({
          ruleId: rule.id,
          ruleName: rule.name,
          type: "FINISHING",
          amount,
          detail: `${config.finish}: ${config.perUnit}/unit + ${config.flat} flat`,
        });
      }
    }
  }

  return {
    description: line.description,
    quantity: line.quantity,
    unitPrice: round2(unitPrice),
    total: round2(total),
    applied,
  };
}

export function computeQuote(
  lines: LineInput[],
  rules: EngineRule[],
  options: {
    rush?: boolean;
    tierMultiplier?: number;
    taxRate?: number;
  } = {},
): QuoteComputation {
  const { valid, skipped } = parseRules(rules);
  const tierMultiplier = options.tierMultiplier ?? 1;
  const taxRate = options.taxRate ?? 0.25; // Swedish VAT default

  const lineResults = lines.map((line) => computeLine(line, valid));
  let subtotal = lineResults.reduce((sum, l) => sum + l.total, 0);
  const applied: AppliedRule[] = [];

  // Quote-level setup fees always apply
  for (const rule of valid) {
    if (rule.type === "SETUP_FEE") {
      const config = rule.parsed as { flat: number };
      subtotal += config.flat;
      applied.push({
        ruleId: rule.id,
        ruleName: rule.name,
        type: "SETUP_FEE",
        amount: config.flat,
        detail: `setup fee ${config.flat}`,
      });
    }
  }

  // Rush fee on the pre-tier subtotal
  let rushFee = 0;
  if (options.rush) {
    for (const rule of valid) {
      if (rule.type === "RUSH_FEE") {
        const config = rule.parsed as { percent: number; flat: number };
        rushFee += (subtotal * config.percent) / 100 + config.flat;
        applied.push({
          ruleId: rule.id,
          ruleName: rule.name,
          type: "RUSH_FEE",
          amount: round2((subtotal * config.percent) / 100 + config.flat),
          detail: config.percent
            ? `+${config.percent}% rush`
            : `+${config.flat} rush`,
        });
      }
    }
  }

  // Reseller/wholesale tier scales goods + rush, not tax
  const preTier = subtotal + rushFee;
  const afterTier = preTier * tierMultiplier;
  const tierAdjustment = round2(afterTier - preTier);

  const taxAmount = round2(afterTier * taxRate);
  const total = round2(afterTier + taxAmount);

  return {
    lines: lineResults,
    subtotal: round2(subtotal),
    tierMultiplier,
    tierAdjustment,
    rushFee: round2(rushFee),
    taxRate,
    taxAmount,
    total,
    applied,
    skippedRules: skipped,
  };
}
