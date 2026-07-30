import { z } from "zod";

export const PAYMENT_METHODS = [
  "BANK_TRANSFER",
  "CARD",
  "CASH",
  "CHECK",
  "OTHER",
] as const;

export const paymentSchema = z.object({
  amount: z.coerce.number().gt(0, "Amount must be positive"),
  method: z.enum(PAYMENT_METHODS).default("BANK_TRANSFER"),
  isDeposit: z.boolean().default(false),
  reference: z.string().trim().max(200).default(""),
  paidAt: z.string().trim().or(z.literal("")).default(""),
});

export const INVOICE_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["SENT", "VOID"],
  SENT: ["OVERDUE", "VOID"], // paid states are payment-driven, not manual
  PARTIALLY_PAID: ["OVERDUE", "VOID"],
  OVERDUE: ["VOID"],
  PAID: [],
  VOID: [],
};
