"use client";

import { useState } from "react";
import { Loader2, ArrowRight, X } from "lucide-react";
import { convertLeadToJob, type Lead } from "@/lib/leads";

interface ConvertModalProps {
  lead: Lead;
  onClose: () => void;
  onConverted: (jobDate: string) => void;
  onToast: (msg: string, type: "success" | "error") => void;
}

export function ConvertModal({
  lead,
  onClose,
  onConverted,
  onToast,
}: ConvertModalProps) {
  const [scheduledStart, setScheduledStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [submitting, setSubmitting] = useState(false);

  async function handleConvert(ev: React.FormEvent) {
    ev.preventDefault();
    setSubmitting(true);

    const result = await convertLeadToJob({
      lead_id: lead.id,
      scheduled_start: new Date(scheduledStart).toISOString(),
      duration_minutes: durationMinutes,
    });

    setSubmitting(false);

    if (result.success) {
      onToast("Lead converted to job", "success");
      onConverted(result.data?.job_date ?? "");
    } else {
      onToast(result.error || "Conversion failed", "error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-xl border border-white/10 bg-slate-900 p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-5">
          <h3 className="text-lg font-semibold text-white">Convert to Job</h3>
          <p className="mt-1 text-sm text-gray-400">
            Schedule a job for{" "}
            <span className="text-white">
              {lead.customers?.full_name ?? "Unknown"}
            </span>
          </p>
        </div>

        <form onSubmit={handleConvert} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-400">
              Scheduled Start
            </span>
            <input
              type="datetime-local"
              value={scheduledStart}
              onChange={(e) => setScheduledStart(e.target.value)}
              required
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-400">
              Duration (minutes)
            </span>
            <input
              type="number"
              min={15}
              step={15}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              required
              className={inputClass}
            />
          </label>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              {submitting ? "Converting..." : "Convert"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
