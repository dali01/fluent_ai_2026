import { z } from "zod";

/**
 * Zod schemas for PricingRule.config by rule type. Rules are stored as
 * Json in the DB; the engine validates on read and skips (but reports)
 * rules whose config doesn't parse — a broken rule must never silently
 * change prices.
 */

export const quantityTierConfig = z.object({
  /** optional filter: rule only applies when specs.productType matches */
  productType: z.string().trim().min(1).optional(),
  /** sorted or not, engine picks the highest minQty <= quantity */
  tiers: z
    .array(
      z.object({
        minQty: z.number().int().min(0),
        unitPrice: z.number().min(0),
      }),
    )
    .min(1),
});

export const stockConfig = z.object({
  /** matched case-insensitively against specs.stock (substring) */
  stock: z.string().trim().min(1),
  surchargePerUnit: z.number(),
});

export const finishingConfig = z.object({
  /** matched case-insensitively against specs.finish (substring) */
  finish: z.string().trim().min(1),
  perUnit: z.number().default(0),
  flat: z.number().default(0),
});

export const rushFeeConfig = z.object({
  /** percentage of the quote subtotal, e.g. 25 = +25% */
  percent: z.number().min(0).max(500).default(0),
  flat: z.number().min(0).default(0),
});

export const setupFeeConfig = z.object({
  flat: z.number().min(0),
});

export const RULE_CONFIG_SCHEMAS = {
  QUANTITY_TIER: quantityTierConfig,
  STOCK: stockConfig,
  FINISHING: finishingConfig,
  RUSH_FEE: rushFeeConfig,
  SETUP_FEE: setupFeeConfig,
} as const;

export type PricingRuleType = keyof typeof RULE_CONFIG_SCHEMAS;
