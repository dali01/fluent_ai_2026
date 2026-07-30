import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  CONVERTED: "Converted",
};

const DOTS: Record<string, string> = {
  DRAFT: "bg-muted-foreground",
  SENT: "bg-chart-1",
  ACCEPTED: "bg-chart-5",
  REJECTED: "bg-destructive",
  EXPIRED: "bg-chart-3",
  CONVERTED: "bg-primary",
};

export function QuoteStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className="gap-1.5">
      <span className={cn("size-1.5 rounded-full", DOTS[status])} aria-hidden />
      {QUOTE_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
