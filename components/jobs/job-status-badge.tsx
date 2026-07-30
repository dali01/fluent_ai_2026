import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const JOB_STATUS_LABELS: Record<string, string> = {
  DESIGN: "Design",
  PROOFING: "Proofing",
  PREPRESS: "Prepress",
  PRINTING: "Printing",
  FINISHING: "Finishing",
  SHIPPING: "Shipping",
  DONE: "Done",
};

export const JOB_STATUS_DOTS: Record<string, string> = {
  DESIGN: "bg-chart-1",
  PROOFING: "bg-chart-2",
  PREPRESS: "bg-chart-4",
  PRINTING: "bg-chart-3",
  FINISHING: "bg-chart-5",
  SHIPPING: "bg-primary",
  DONE: "bg-muted-foreground",
};

export function JobStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className="gap-1.5">
      <span
        className={cn("size-1.5 rounded-full", JOB_STATUS_DOTS[status])}
        aria-hidden
      />
      {JOB_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
