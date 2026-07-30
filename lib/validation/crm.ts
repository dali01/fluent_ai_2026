import { z } from "zod";

/** Shared Zod schemas for CRM entities — the single source of truth for
 * every server action's input. Forms submit FormData; use the `parseForm`
 * helpers in lib/actions/form.ts to coerce it into these shapes. */

export const tagArray = z
  .array(z.string().trim().min(1).max(40))
  .max(20)
  .default([]);

export const companySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.email("Invalid email").max(320).or(z.literal("")).default(""),
  phone: z.string().trim().max(40).default(""),
  website: z.string().trim().max(200).default(""),
  city: z.string().trim().max(100).default(""),
  country: z.string().trim().max(2).toUpperCase().or(z.literal("")).default(""),
  isReseller: z.boolean().default(false),
  priceTierId: z.string().trim().or(z.literal("")).default(""),
  notes: z.string().trim().max(5000).default(""),
  tags: tagArray,
});
export type CompanyInput = z.infer<typeof companySchema>;

export const contactSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  email: z.email("Invalid email").max(320).or(z.literal("")).default(""),
  phone: z.string().trim().max(40).default(""),
  title: z.string().trim().max(120).default(""),
  companyId: z.string().trim().or(z.literal("")).default(""),
  notes: z.string().trim().max(5000).default(""),
  tags: tagArray,
});
export type ContactInput = z.infer<typeof contactSchema>;

/** The six kanban stages. Deliberately does NOT include prospect stages —
 * the board, the stage-move validator and the dashboard all key off this. */
export const LEAD_STAGES = [
  "QUOTE_REQUESTED",
  "QUOTED",
  "APPROVED",
  "IN_PRODUCTION",
  "DELIVERED",
  "REPEAT",
] as const;

/** Sourced-prospect stages — never on the kanban (docs/prospecting.md §1a). */
export const PROSPECT_STAGES = ["PROSPECT", "DISQUALIFIED"] as const;

export const ALL_LEAD_STAGES = [...LEAD_STAGES, ...PROSPECT_STAGES] as const;

export const leadSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  stage: z.enum(LEAD_STAGES).default("QUOTE_REQUESTED"),
  companyId: z.string().trim().or(z.literal("")).default(""),
  contactId: z.string().trim().or(z.literal("")).default(""),
  value: z.coerce.number().min(0).max(1_000_000_000).optional(),
  source: z.string().trim().max(100).default(""),
  notes: z.string().trim().max(5000).default(""),
});
export type LeadInput = z.infer<typeof leadSchema>;

export const LOGGABLE_ACTIVITY_TYPES = [
  "NOTE",
  "EMAIL",
  "SMS",
  "CALL",
  "MEETING",
] as const;

export const activityLogSchema = z.object({
  type: z.enum(LOGGABLE_ACTIVITY_TYPES).default("NOTE"),
  summary: z.string().trim().min(1, "Summary is required").max(1000),
  contactId: z.string().trim().or(z.literal("")).default(""),
  jobId: z.string().trim().or(z.literal("")).default(""),
});
export type ActivityLogInput = z.infer<typeof activityLogSchema>;
