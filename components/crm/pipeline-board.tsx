"use client";

import { useOptimistic, useTransition } from "react";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { moveLeadStage } from "@/lib/actions/leads";
import { LEAD_STAGES } from "@/lib/validation/crm";
import { cn } from "@/lib/utils";

export type PipelineLead = {
  id: string;
  title: string;
  stage: string;
  value: string | null; // Decimal serialized
  companyName: string | null;
  contactName: string | null;
};

const STAGE_LABELS: Record<(typeof LEAD_STAGES)[number], string> = {
  QUOTE_REQUESTED: "Quote requested",
  QUOTED: "Quoted",
  APPROVED: "Approved",
  IN_PRODUCTION: "In production",
  DELIVERED: "Delivered",
  REPEAT: "Repeat",
};

const STAGE_DOTS: Record<(typeof LEAD_STAGES)[number], string> = {
  QUOTE_REQUESTED: "bg-chart-1",
  QUOTED: "bg-chart-4",
  APPROVED: "bg-chart-2",
  IN_PRODUCTION: "bg-chart-3",
  DELIVERED: "bg-chart-5",
  REPEAT: "bg-primary",
};

function LeadCard({ lead }: { lead: PipelineLead }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: lead.id });

  return (
    <div
      ref={setNodeRef}
      style={
        transform
          ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
          : undefined
      }
      className={cn(
        "flex flex-col gap-1 rounded-md border bg-card p-3 text-sm shadow-xs",
        isDragging && "z-10 opacity-80 shadow-md",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium">{lead.title}</span>
        <button
          className="cursor-grab touch-none text-muted-foreground"
          aria-label={`Move ${lead.title}`}
          {...listeners}
          {...attributes}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
      </div>
      {lead.companyName ? (
        <span className="text-muted-foreground">{lead.companyName}</span>
      ) : null}
      <div className="flex items-center justify-between">
        {lead.contactName ? (
          <span className="text-xs text-muted-foreground">
            {lead.contactName}
          </span>
        ) : (
          <span />
        )}
        {lead.value ? (
          <Badge variant="secondary">
            {Number(lead.value).toLocaleString("sv-SE")} kr
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

function StageColumn({
  stage,
  leads,
}: {
  stage: (typeof LEAD_STAGES)[number];
  leads: PipelineLead[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const total = leads.reduce(
    (sum, l) => sum + (l.value ? Number(l.value) : 0),
    0,
  );

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-64 shrink-0 flex-col gap-2 rounded-lg border bg-muted/30 p-2",
        isOver && "border-ring bg-muted/60",
      )}
    >
      <div className="flex items-center justify-between px-1 pt-1">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span
            className={cn("size-2 rounded-full", STAGE_DOTS[stage])}
            aria-hidden
          />
          {STAGE_LABELS[stage]}
        </span>
        <span className="text-xs text-muted-foreground">
          {leads.length}
          {total > 0 ? ` · ${total.toLocaleString("sv-SE")} kr` : ""}
        </span>
      </div>
      <div className="flex min-h-24 flex-col gap-2">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} />
        ))}
      </div>
    </div>
  );
}

export function PipelineBoard({ leads }: { leads: PipelineLead[] }) {
  const [, startTransition] = useTransition();
  const [optimisticLeads, applyMove] = useOptimistic(
    leads,
    (current, move: { id: string; stage: string }) =>
      current.map((l) => (l.id === move.id ? { ...l, stage: move.stage } : l)),
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function onDragEnd(event: DragEndEvent) {
    const leadId = String(event.active.id);
    const stage = event.over ? String(event.over.id) : null;
    if (!stage) return;
    const lead = optimisticLeads.find((l) => l.id === leadId);
    if (!lead || lead.stage === stage) return;

    startTransition(async () => {
      applyMove({ id: leadId, stage });
      const result = await moveLeadStage(leadId, stage);
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {LEAD_STAGES.map((stage) => (
          <StageColumn
            key={stage}
            stage={stage}
            leads={optimisticLeads.filter((l) => l.stage === stage)}
          />
        ))}
      </div>
    </DndContext>
  );
}
