import { z } from "zod";

export const JOB_STATUSES = [
  "DESIGN",
  "PROOFING",
  "PREPRESS",
  "PRINTING",
  "FINISHING",
  "SHIPPING",
  "DONE",
] as const;

export const COLOR_MODES = ["CMYK", "SPOT", "PANTONE", "BLACK_WHITE"] as const;

const optionalMm = z.coerce.number().min(0).max(10000).optional();

export const jobSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  companyId: z.string().trim().min(1, "Company is required"),
  status: z.enum(JOB_STATUSES).default("DESIGN"),
  pressId: z.string().trim().or(z.literal("")).default(""),
  stock: z.string().trim().max(120).default(""),
  sizeName: z.string().trim().max(60).default(""),
  widthMm: optionalMm,
  heightMm: optionalMm,
  colorMode: z.enum(COLOR_MODES).default("CMYK"),
  finish: z.string().trim().max(120).default(""),
  binding: z.string().trim().max(120).default(""),
  quantity: z.coerce.number().int().min(0).max(100_000_000).default(0),
  bleedMm: optionalMm,
  rush: z.boolean().default(false),
  dueDate: z.string().trim().or(z.literal("")).default(""),
  notes: z.string().trim().max(5000).default(""),
});
export type JobInput = z.infer<typeof jobSchema>;
