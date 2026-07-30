"use client";

import Link from "next/link";
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
import { GripVertical, Zap } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  JOB_STATUS_DOTS,
  JOB_STATUS_LABELS,
} from "@/components/jobs/job-status-badge";
import { moveJobStatus } from "@/lib/actions/jobs";
import { JOB_STATUSES } from "@/lib/validation/jobs";
import { cn } from "@/lib/utils";

export type BoardJob = {
  id: string;
  jobNumber: number;
  title: string;
  status: string;
  companyName: string;
  quantity: number;
  rush: boolean;
  dueDate: string | null; // ISO
};

function JobCard({ job }: { job: BoardJob }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: job.id });

  const overdue =
    job.dueDate && new Date(job.dueDate) < new Date() && job.status !== "DONE";

  return (
    <div
      ref={setNodeRef}
      style={
        transform
          ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
          : undefined
      }
      className={cn(
        "flex flex-col gap-1 rounded-lg border bg-card p-3 text-sm shadow-xs",
        isDragging && "z-10 opacity-80 shadow-md",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/jobs/${job.id}`}
          className="font-medium hover:underline"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="mr-1.5 font-mono text-xs text-muted-foreground">
            #{job.jobNumber}
          </span>
          {job.title}
        </Link>
        <button
          className="cursor-grab touch-none text-muted-foreground"
          aria-label={`Move job ${job.jobNumber}`}
          {...listeners}
          {...attributes}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
      </div>
      <span className="text-xs text-muted-foreground">{job.companyName}</span>
      <div className="flex items-center justify-between text-xs">
        <span className="font-mono text-muted-foreground">
          ×{job.quantity.toLocaleString("sv-SE")}
        </span>
        <span className="flex items-center gap-1.5">
          {job.rush ? (
            <Badge variant="destructive" className="gap-1 px-1.5">
              <Zap className="size-3" aria-hidden />
            </Badge>
          ) : null}
          {job.dueDate ? (
            <span
              className={cn(
                "text-muted-foreground",
                overdue && "font-medium text-destructive",
              )}
            >
              {new Date(job.dueDate).toLocaleDateString("sv-SE")}
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

function StatusColumn({
  status,
  jobs,
}: {
  status: (typeof JOB_STATUSES)[number];
  jobs: BoardJob[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-64 shrink-0 flex-col gap-2 rounded-xl border bg-muted/40 p-2",
        isOver && "border-ring bg-muted/70",
      )}
    >
      <div className="flex items-center justify-between px-1 pt-1">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span
            className={cn("size-2 rounded-full", JOB_STATUS_DOTS[status])}
            aria-hidden
          />
          {JOB_STATUS_LABELS[status]}
        </span>
        <span className="text-xs text-muted-foreground">{jobs.length}</span>
      </div>
      <div className="flex min-h-24 flex-col gap-2">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
      </div>
    </div>
  );
}

export function ProductionBoard({ jobs }: { jobs: BoardJob[] }) {
  const [, startTransition] = useTransition();
  const [optimisticJobs, applyMove] = useOptimistic(
    jobs,
    (current, move: { id: string; status: string }) =>
      current.map((j) =>
        j.id === move.id ? { ...j, status: move.status } : j,
      ),
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function onDragEnd(event: DragEndEvent) {
    const jobId = String(event.active.id);
    const status = event.over ? String(event.over.id) : null;
    if (!status) return;
    const job = optimisticJobs.find((j) => j.id === jobId);
    if (!job || job.status === status) return;

    startTransition(async () => {
      applyMove({ id: jobId, status });
      const result = await moveJobStatus(jobId, status);
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {JOB_STATUSES.map((status) => (
          <StatusColumn
            key={status}
            status={status}
            jobs={optimisticJobs.filter((j) => j.status === status)}
          />
        ))}
      </div>
    </DndContext>
  );
}
