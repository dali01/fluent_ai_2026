import { z } from "zod";

export const quoteLineSchema = z.object({
  description: z.string().trim().min(1, "Description required").max(300),
  quantity: z.coerce.number().int().min(1).max(100_000_000),
  unitPriceOverride: z.coerce.number().min(0).nullable().optional(),
  specs: z
    .object({
      productType: z.string().trim().max(80).optional(),
      stock: z.string().trim().max(120).optional(),
      finish: z.string().trim().max(120).optional(),
    })
    .optional(),
});

export const quoteSchema = z.object({
  companyId: z.string().trim().min(1, "Company is required"),
  rush: z.boolean().default(false),
  validUntil: z.string().trim().or(z.literal("")).default(""),
  notes: z.string().trim().max(5000).default(""),
  lines: z.array(quoteLineSchema).min(1, "Add at least one line item"),
});
export type QuoteInput = z.infer<typeof quoteSchema>;

export const QUOTE_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["SENT"],
  SENT: ["ACCEPTED", "REJECTED", "EXPIRED"],
  ACCEPTED: ["CONVERTED"],
  REJECTED: [],
  EXPIRED: ["SENT"],
  CONVERTED: [],
};

export const priceTierSchema = z.object({
  name: z.string().trim().min(1).max(80),
  multiplier: z.coerce.number().min(0.05).max(10),
  isResellerTier: z.boolean().default(false),
});

export const pricingRuleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum([
    "QUANTITY_TIER",
    "STOCK",
    "FINISHING",
    "RUSH_FEE",
    "SETUP_FEE",
  ]),
  active: z.boolean().default(true),
  /** JSON string from the settings form, validated against the type's schema */
  config: z.string().trim().min(2),
});
