import { z } from "zod";

/** Uniform result shape for useActionState forms. */
export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export const actionOk: ActionResult = { ok: true };

/**
 * Parse FormData against a Zod schema. Checkboxes arrive as "on"/absent and
 * tags as a comma-separated string — both are normalized here so schemas
 * stay clean.
 */
export function parseForm<S extends z.ZodType>(
  schema: S,
  formData: FormData,
  options?: { booleans?: string[]; tagFields?: string[] },
): { data?: z.infer<S>; result?: ActionResult } {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") raw[key] = value;
  }
  for (const key of options?.booleans ?? []) {
    raw[key] = formData.get(key) === "on" || formData.get(key) === "true";
  }
  for (const key of options?.tagFields ?? []) {
    const v = formData.get(key);
    raw[key] =
      typeof v === "string" && v.trim().length > 0
        ? v
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [];
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (path && !fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    return {
      result: {
        ok: false,
        error: "Please fix the highlighted fields",
        fieldErrors,
      },
    };
  }
  return { data: parsed.data };
}

/** Map empty-string selects to null for optional foreign keys. */
export function idOrNull(value: string): string | null {
  return value === "" ? null : value;
}
