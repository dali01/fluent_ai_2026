import { z } from "zod";

export const INVENTORY_TYPES = ["PAPER", "INK", "OTHER"] as const;

export const inventoryItemSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  type: z.enum(INVENTORY_TYPES).default("PAPER"),
  sku: z.string().trim().max(80).default(""),
  unit: z.string().trim().min(1).max(30).default("sheet"),
  quantityOnHand: z.coerce.number().min(0).default(0),
  reorderThreshold: z.coerce.number().min(0).default(0),
  costPerUnit: z.coerce.number().min(0).optional(),
});

export const ADJUSTMENT_REASONS = [
  "PURCHASE",
  "ADJUSTMENT",
  "WASTE",
  "RETURN",
] as const;

export const stockAdjustmentSchema = z.object({
  inventoryItemId: z.string().trim().min(1),
  delta: z.coerce.number().refine((n) => n !== 0, "Delta cannot be zero"),
  reason: z.enum(ADJUSTMENT_REASONS).default("ADJUSTMENT"),
  note: z.string().trim().max(500).default(""),
});

export const jobMaterialSchema = z.object({
  inventoryItemId: z.string().trim().min(1, "Pick a material"),
  quantityPlanned: z.coerce.number().gt(0, "Quantity must be positive"),
});

export const vendorSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.email("Invalid email").max(320).or(z.literal("")).default(""),
  phone: z.string().trim().max(40).default(""),
  services: z.string().trim().max(300).default(""),
  notes: z.string().trim().max(5000).default(""),
});

export const scheduleBlockSchema = z
  .object({
    pressId: z.string().trim().min(1, "Pick a press"),
    jobId: z.string().trim().or(z.literal("")).default(""),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    note: z.string().trim().max(300).default(""),
  })
  .refine((v) => v.endsAt > v.startsAt, {
    message: "End must be after start",
    path: ["endsAt"],
  });
