"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ─── Constants ────────────────────────────────────────────────────────────────

const JOB_STATUSES = ["scheduled", "en_route", "on_site", "completed", "canceled"] as const;
type JobStatus = (typeof JOB_STATUSES)[number];

const STATUS_LABELS: Record<JobStatus, string> = {
  scheduled: "Scheduled",
  en_route: "En Route",
  on_site: "On Site",
  completed: "Completed",
  canceled: "Canceled",
};

const STATUS_COLORS: Record<JobStatus, string> = {
  scheduled: "bg-blue-400/15 text-blue-400",
  en_route: "bg-yellow-400/15 text-yellow-400",
  on_site: "bg-orange-400/15 text-orange-400",
  completed: "bg-emerald-400/15 text-emerald-400",
  canceled: "bg-gray-400/15 text-gray-500 line-through",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface Technician {
  id: string;
  name: string;
  truck_id: string;
}

interface DispatchJob {
  id: string;
  technician_id: string | null;
  customer_id: string | null;
  job_date: string;
  revenue_estimate: number;
  duration_estimate_hours: number;
  urgency: number;
  status: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  order_index: number;
  customer_name: string | null;
  technician_name: string | null;
}

// ─── Job Card (sortable) ──────────────────────────────────────────────────────

function JobCard({
  job,
  onStatusChange,
  isDragging = false,
}: {
  job: DispatchJob;
  onStatusChange: (jobId: string, status: string) => void;
  isDragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: job.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const status = job.status as JobStatus;
  const durationLabel =
    job.duration_estimate_hours < 1
      ? `${Math.round(job.duration_estimate_hours * 60)}m`
      : `${job.duration_estimate_hours}h`;

  function formatTime(iso: string | null) {
    if (!iso) return null;
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border border-white/10 bg-white/5 rounded-lg p-3 backdrop-blur-sm select-none"
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-500 mb-2 text-xs font-mono"
        title="Drag to reorder"
      >
        ⠿
      </div>

      <div className="font-medium text-sm text-white truncate">
        {job.customer_name ?? "No customer"}
      </div>

      {job.status !== "canceled" && (
        <div className="text-xs text-gray-400 mt-0.5 truncate">
          {job.duration_estimate_hours > 0 && <span>{durationLabel}</span>}
          {job.scheduled_start && (
            <span className="ml-1 text-gray-500">· {formatTime(job.scheduled_start)}</span>
          )}
        </div>
      )}

      {/* Revenue */}
      {job.revenue_estimate > 0 && (
        <div className="text-xs text-emerald-400 mt-1">${job.revenue_estimate.toFixed(0)}</div>
      )}

      {/* Status dropdown */}
      <select
        value={job.status}
        onChange={(e) => onStatusChange(job.id, e.target.value)}
        onClick={(e) => e.stopPropagation()}
        className={`mt-2 w-full text-xs rounded px-1.5 py-1 border border-white/10 font-medium cursor-pointer bg-white/5 ${STATUS_COLORS[status] ?? "bg-white/5 text-gray-400"}`}
      >
        {JOB_STATUSES.map((s) => (
          <option key={s} value={s} className="bg-slate-900 text-white">
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Technician Column ────────────────────────────────────────────────────────

function TechColumn({
  tech,
  jobs,
  onStatusChange,
}: {
  tech: Technician | null; // null = unassigned column
  jobs: DispatchJob[];
  onStatusChange: (jobId: string, status: string) => void;
}) {
  const techId = tech?.id ?? "unassigned";
  const jobIds = jobs.map((j) => j.id);

  const totalHours = jobs.reduce((s, j) => s + j.duration_estimate_hours, 0);
  const isOvertime = totalHours > 8;

  return (
    <div className="flex flex-col w-56 shrink-0">
      {/* Column header */}
      <div className="mb-2 px-1">
        <div className="font-semibold text-sm text-white truncate">
          {tech?.name ?? "Unassigned"}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {tech?.truck_id && tech.truck_id !== "UNASSIGNED" && (
            <span className="text-xs text-gray-500">{tech.truck_id}</span>
          )}
          <span className={`text-xs ${isOvertime ? "text-orange-400 font-medium" : "text-gray-500"}`}>
            {totalHours.toFixed(1)}h
            {isOvertime && " ⚠"}
          </span>
          <span className="text-xs text-gray-500">({jobs.length})</span>
        </div>
      </div>

      {/* Drop zone */}
      <div
        data-tech-id={techId}
        className="flex-1 min-h-32 bg-white/5 rounded-lg p-2 flex flex-col gap-2 border border-white/10"
      >
        <SortableContext items={jobIds} strategy={verticalListSortingStrategy}>
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onStatusChange={onStatusChange}
            />
          ))}
        </SortableContext>

        {jobs.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-xs text-gray-500 italic">
            Drop jobs here
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dispatch Page ─────────────────────────────────────────────────────────────

export default function DispatchPage() {
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [jobs, setJobs] = useState<DispatchJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<DispatchJob | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // Track pending PATCH calls so we don't spam on rapid moves
  const patchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string, type: "success" | "error" = "error") {
    setToast({ msg, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  // ─── Data fetch ─────────────────────────────────────────────────────────────

  const fetchDispatch = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dispatch?date=${d}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setTechnicians(json.technicians);
      setJobs(json.jobs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dispatch data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDispatch(date);
  }, [date, fetchDispatch]);

  // ─── Derived state ───────────────────────────────────────────────────────────

  function getJobsForTech(techId: string | null): DispatchJob[] {
    return jobs
      .filter((j) => (techId === null ? j.technician_id === null : j.technician_id === techId))
      .sort((a, b) => a.order_index - b.order_index);
  }

  // ─── Persist helper ──────────────────────────────────────────────────────────

  async function patchJob(
    jobId: string,
    updates: Partial<Pick<DispatchJob, "technician_id" | "status" | "order_index">>
  ): Promise<boolean> {
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast(json.error || "Failed to save change", "error");
        return false;
      }
      return true;
    } catch {
      showToast("Network error — change may not be saved", "error");
      return false;
    }
  }

  // ─── Status change ───────────────────────────────────────────────────────────

  async function handleStatusChange(jobId: string, status: string) {
    const prev = jobs.find((j) => j.id === jobId)?.status;
    setJobs((all) => all.map((j) => (j.id === jobId ? { ...j, status } : j)));
    const ok = await patchJob(jobId, { status });
    if (!ok && prev !== undefined) {
      setJobs((all) => all.map((j) => (j.id === jobId ? { ...j, status: prev } : j)));
    }
  }

  // ─── DnD handlers ───────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function onDragStart(event: DragStartEvent) {
    const job = jobs.find((j) => j.id === event.active.id);
    setActiveJob(job ?? null);
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeJob = jobs.find((j) => j.id === active.id);
    if (!activeJob) return;

    // Determine target technician from the over element
    // over.id may be a job id or a droppable container id
    const overJob = jobs.find((j) => j.id === over.id);
    const targetTechId = overJob?.technician_id ?? null;

    if (activeJob.technician_id === targetTechId) return;

    // Move job to new column (optimistic)
    setJobs((prev) =>
      prev.map((j) =>
        j.id === activeJob.id ? { ...j, technician_id: targetTechId } : j
      )
    );
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveJob(null);

    if (!over) return;

    const movedJob = jobs.find((j) => j.id === active.id);
    if (!movedJob) return;

    const overJob = jobs.find((j) => j.id === over.id);
    const targetTechId = overJob?.technician_id ?? movedJob.technician_id;

    setJobs((prev) => {
      // Get jobs in target column (post-column-switch state)
      const colJobs = prev
        .filter((j) =>
          targetTechId === null
            ? j.technician_id === null
            : j.technician_id === targetTechId
        )
        .sort((a, b) => a.order_index - b.order_index);

      const oldIdx = colJobs.findIndex((j) => j.id === active.id);
      const newIdx = overJob ? colJobs.findIndex((j) => j.id === over.id) : colJobs.length;

      if (oldIdx === -1 || oldIdx === newIdx) return prev;

      const reordered = arrayMove(colJobs, oldIdx, newIdx);

      // Assign stable order_index values
      const updated = new Map(reordered.map((j, i) => [j.id, i]));

      // Clear pending timeout, batch PATCH calls
      if (patchTimeout.current) clearTimeout(patchTimeout.current);
      patchTimeout.current = setTimeout(async () => {
        const results = await Promise.all(
          Array.from(updated.entries()).map(([jobId, idx]) =>
            patchJob(jobId, { technician_id: targetTechId, order_index: idx })
          )
        );
        const failures = results.filter((ok) => !ok).length;
        if (failures > 0) {
          showToast(`${failures} job update(s) failed — try refreshing`, "error");
        }
      }, 400);

      return prev.map((j) => {
        if (!updated.has(j.id)) return j;
        return {
          ...j,
          technician_id: targetTechId,
          order_index: updated.get(j.id)!,
        };
      });
    });
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  const unassignedJobs = getJobsForTech(null);

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed right-6 top-20 z-50 rounded-lg border px-4 py-2.5 text-sm font-medium shadow-lg transition-all ${
            toast.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dispatch Board</h1>
          <p className="mt-1 text-sm text-gray-500">Drag jobs between technicians to reassign</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="text-sm rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-white focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30 [color-scheme:dark]"
          />
          <button
            onClick={() => fetchDispatch(date)}
            className="text-sm px-4 py-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Body */}
      <div>
        {loading && (
          <div className="text-sm text-gray-400 py-8 text-center">Loading...</div>
        )}

        {!loading && error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-4 my-4">
            {error}
          </div>
        )}

        {!loading && !error && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
          >
            <div className="flex gap-4 overflow-x-auto pb-4">
              {/* Technician columns */}
              {technicians.map((tech) => (
                <TechColumn
                  key={tech.id}
                  tech={tech}
                  jobs={getJobsForTech(tech.id)}
                  onStatusChange={handleStatusChange}
                />
              ))}

              {/* Unassigned column */}
              {(unassignedJobs.length > 0 || technicians.length === 0) && (
                <TechColumn
                  key="unassigned"
                  tech={null}
                  jobs={unassignedJobs}
                  onStatusChange={handleStatusChange}
                />
              )}
            </div>

            {/* Drag overlay — ghost card */}
            <DragOverlay>
              {activeJob ? (
                <div className="border border-blue-500/40 bg-slate-800 rounded-lg p-3 shadow-lg w-56 opacity-90">
                  <div className="font-medium text-sm text-white truncate">
                    {activeJob.customer_name ?? "No customer"}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {activeJob.duration_estimate_hours}h
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        {!loading && !error && technicians.length === 0 && (
          <div className="text-sm text-gray-500 text-center py-16">
            No technicians found for this company.
            <br />
            Upload a CSV on the{" "}
            <a href="/dashboard" className="underline text-blue-400 hover:text-blue-300">
              dashboard
            </a>{" "}
            to create technicians.
          </div>
        )}
      </div>
    </div>
  );
}
