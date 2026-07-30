import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { PrepressResult } from "@/lib/prepress/checks";
import { cn } from "@/lib/utils";

const ICONS = {
  pass: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
} as const;

const COLORS = {
  pass: "text-chart-5",
  warn: "text-chart-3",
  fail: "text-destructive",
} as const;

export function PrepressReport({ result }: { result: PrepressResult }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {result.checks.map((check) => {
        const Icon = ICONS[check.status];
        return (
          <li key={check.id} className="flex items-start gap-2 text-sm">
            <Icon
              className={cn("mt-0.5 size-4 shrink-0", COLORS[check.status])}
              aria-label={check.status}
            />
            <span>
              <span className="font-medium">{check.label}:</span>{" "}
              <span className="text-muted-foreground">{check.message}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
