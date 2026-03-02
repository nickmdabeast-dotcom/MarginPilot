"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Loader2,
  Mail,
  MapPin,
  Phone,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchLeads,
  updateLeadStatus,
  LEAD_STATUSES,
  STATUS_LABELS,
  STATUS_COLORS,
  URGENCY_LABELS,
  URGENCY_COLORS,
  type Lead,
} from "@/lib/leads";
import { ConvertModal } from "@/components/leads/ConvertModal";

export default function LeadDetailPage() {
  const params = useParams();
  const leadId = params.id as string;

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{
    msg: string;
    type: "success" | "error";
  } | null>(null);
  const [showConvert, setShowConvert] = useState(false);

  const showToast = useCallback(
    (msg: string, type: "success" | "error") => {
      setToast({ msg, type });
      setTimeout(() => setToast(null), 3000);
    },
    []
  );

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await fetchLeads();
      setLoading(false);

      if (!result.success) {
        setError(result.error || "Failed to load lead");
        return;
      }

      const found = (result.data ?? []).find((l) => l.id === leadId);
      if (!found) {
        setError("Lead not found");
        return;
      }

      setLead(found);
    }

    load();
  }, [leadId]);

  async function handleStatusChange(newStatus: string) {
    if (!lead) return;
    const result = await updateLeadStatus(lead.id, newStatus);
    if (result.success) {
      setLead({ ...lead, status: newStatus });
      showToast("Status updated", "success");
    } else {
      showToast(result.error || "Failed to update status", "error");
    }
  }

  function handleConverted() {
    setShowConvert(false);
    showToast("Lead converted to job", "success");
    if (lead) setLead({ ...lead, status: "scheduled" });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <p className="mb-4 text-gray-400">{error || "Lead not found"}</p>
        <Link
          href="/leads"
          className="text-sm text-blue-400 transition-colors hover:text-blue-300"
        >
          Back to Leads
        </Link>
      </div>
    );
  }

  const customer = lead.customers;
  const urgencyLabel = URGENCY_LABELS[lead.urgency] ?? lead.urgency;
  const urgencyColor = URGENCY_COLORS[lead.urgency] ?? "text-gray-400";
  const canConvert =
    lead.status !== "scheduled" &&
    lead.status !== "lost" &&
    lead.status !== "completed";

  return (
    <>
      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "fixed right-6 top-20 z-50 rounded-lg border px-4 py-2.5 text-sm font-medium shadow-lg transition-all",
            toast.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          )}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/leads"
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white">
              {customer?.full_name ?? "Unknown Lead"}
            </h1>
            <p className="text-sm text-gray-400">
              Lead created{" "}
              {new Date(lead.created_at).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        {canConvert && (
          <button
            onClick={() => setShowConvert(true)}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
          >
            <ArrowRight className="h-4 w-4" />
            Convert to Job
          </button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main info */}
        <div className="space-y-6 lg:col-span-2">
          {/* Contact card */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
              Contact Information
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoItem
                icon={<User className="h-4 w-4" />}
                label="Full Name"
                value={customer?.full_name ?? "—"}
              />
              <InfoItem
                icon={<Phone className="h-4 w-4" />}
                label="Phone"
                value={customer?.phone ?? "—"}
              />
              <InfoItem
                icon={<Mail className="h-4 w-4" />}
                label="Email"
                value={customer?.email ?? "—"}
              />
              <InfoItem
                icon={<MapPin className="h-4 w-4" />}
                label="Address"
                value="—"
              />
            </div>
            <p className="mt-4 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-400/80">
              Contact editing available after auth rollout
            </p>
          </div>

          {/* Service details */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
              Service Details
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <span className="block text-xs text-gray-500">
                  Service Type
                </span>
                <span className="mt-1 block text-sm capitalize text-white">
                  {lead.service_type?.replace(/_/g, " ") ?? "—"}
                </span>
              </div>
              <div>
                <span className="block text-xs text-gray-500">Urgency</span>
                <span
                  className={cn("mt-1 block text-sm font-medium", urgencyColor)}
                >
                  {urgencyLabel}
                </span>
              </div>
              <div>
                <span className="block text-xs text-gray-500">Source</span>
                <span className="mt-1 block text-sm capitalize text-white">
                  {lead.source}
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
              Notes
            </h2>
            {lead.notes ? (
              <p className="whitespace-pre-wrap text-sm text-gray-300">
                {lead.notes}
              </p>
            ) : (
              <p className="text-sm italic text-gray-500">No notes</p>
            )}
            <p className="mt-4 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-400/80">
              Notes editing available after auth rollout
            </p>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status card */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
              Status
            </h2>
            <div className="space-y-2">
              {LEAD_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all",
                    lead.status === s
                      ? STATUS_COLORS[s] + " border-current"
                      : "border-white/5 text-gray-500 hover:border-white/10 hover:bg-white/5 hover:text-gray-300"
                  )}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      lead.status === s ? "bg-current" : "bg-gray-600"
                    )}
                  />
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Timeline */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
              Timeline
            </h2>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-400/10">
                <Clock className="h-3 w-3 text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-white">Lead created</p>
                <p className="text-xs text-gray-500">
                  {new Date(lead.created_at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Convert modal */}
      {showConvert && (
        <ConvertModal
          lead={lead}
          onClose={() => setShowConvert(false)}
          onConverted={handleConverted}
          onToast={showToast}
        />
      )}
    </>
  );
}

function InfoItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-gray-400">
        {icon}
      </div>
      <div>
        <span className="block text-xs text-gray-500">{label}</span>
        <span className="mt-0.5 block text-sm text-white">{value}</span>
      </div>
    </div>
  );
}
