"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Search,
  Eye,
  ArrowRight,
  Loader2,
  Users,
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
  type LeadStatus,
} from "@/lib/leads";
import { ConvertModal } from "./ConvertModal";

interface LeadsTableProps {
  refreshKey: number;
  onToast: (msg: string, type: "success" | "error") => void;
}

export function LeadsTable({ refreshKey, onToast }: LeadsTableProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState<string>("");
  const [search, setSearch] = useState("");
  const [convertingLead, setConvertingLead] = useState<Lead | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadLeads = useCallback(
    async (status?: string, searchQuery?: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      const result = await fetchLeads(
        { status: status || undefined, search: searchQuery || undefined },
        controller.signal
      );

      if (result.error === "Request cancelled") return;

      setLoading(false);
      if (result.success) {
        setLeads(result.data ?? []);
      } else {
        onToast(result.error || "Failed to load leads", "error");
      }
    },
    [onToast]
  );

  // Debounced fetch — handles status, search, and refresh changes
  useEffect(() => {
    const t = setTimeout(() => {
      loadLeads(activeStatus, search);
    }, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, activeStatus, refreshKey, loadLeads]);

  async function handleStatusChange(leadId: string, newStatus: string) {
    const result = await updateLeadStatus(leadId, newStatus);
    if (result.success) {
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l))
      );
    } else {
      onToast(result.error || "Failed to update status", "error");
    }
  }

  function handleConverted() {
    setConvertingLead(null);
    loadLeads(activeStatus, search);
  }

  // Pipeline counts
  const counts: Record<string, number> = {};
  leads.forEach((l) => {
    counts[l.status] = (counts[l.status] || 0) + 1;
  });

  return (
    <div className="space-y-4">
      {/* Pipeline summary cards */}
      <div className="grid grid-cols-5 gap-2">
        {LEAD_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setActiveStatus(activeStatus === s ? "" : s)}
            className={cn(
              "rounded-lg border px-3 py-2.5 text-center transition-all",
              activeStatus === s
                ? STATUS_COLORS[s] + " border-current"
                : "border-white/10 bg-white/5 text-gray-400 hover:bg-white/10"
            )}
          >
            <div className="text-lg font-bold">
              {activeStatus === "" ? counts[s] ?? 0 : activeStatus === s ? leads.length : "–"}
            </div>
            <div className="text-xs">{STATUS_LABELS[s]}</div>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone..."
          className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-white placeholder-gray-500 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setActiveStatus("")}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            activeStatus === ""
              ? "bg-white/20 text-white"
              : "bg-white/5 text-gray-400 hover:bg-white/10"
          )}
        >
          All
        </button>
        {LEAD_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setActiveStatus(activeStatus === s ? "" : s)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              activeStatus === s
                ? STATUS_COLORS[s]
                : "bg-white/5 text-gray-400 hover:bg-white/10"
            )}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
              <Users className="h-6 w-6 text-gray-500" />
            </div>
            <p className="text-sm text-gray-400">
              {search || activeStatus
                ? "No leads match your filters"
                : "No leads yet — add your first lead"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="hidden px-4 py-3 md:table-cell">Service</th>
                  <th className="px-4 py-3">Urgency</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="hidden px-4 py-3 lg:table-cell">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {leads.map((lead) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    onStatusChange={handleStatusChange}
                    onConvert={() => setConvertingLead(lead)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Convert modal */}
      {convertingLead && (
        <ConvertModal
          lead={convertingLead}
          onClose={() => setConvertingLead(null)}
          onConverted={handleConverted}
          onToast={onToast}
        />
      )}
    </div>
  );
}

// ─── LeadRow ──────────────────────────────────────────────────────────────────

function LeadRow({
  lead,
  onStatusChange,
  onConvert,
}: {
  lead: Lead;
  onStatusChange: (id: string, status: string) => void;
  onConvert: () => void;
}) {
  const name = lead.customers?.full_name ?? "Unknown";
  const phone = lead.customers?.phone ?? "—";
  const serviceLabel = lead.service_type
    ? lead.service_type.replace(/_/g, " ")
    : "—";
  const urgencyLabel = URGENCY_LABELS[lead.urgency] ?? lead.urgency;
  const urgencyColor = URGENCY_COLORS[lead.urgency] ?? "text-gray-400";
  const statusKey = (lead.status as LeadStatus) || "new";
  const statusColor =
    STATUS_COLORS[statusKey] ?? STATUS_COLORS.new;
  const canConvert =
    lead.status !== "scheduled" &&
    lead.status !== "lost" &&
    lead.status !== "completed";
  const created = new Date(lead.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <tr className="transition-colors hover:bg-white/5">
      <td className="px-4 py-3">
        <span className="font-medium text-white">{name}</span>
      </td>
      <td className="px-4 py-3 text-gray-400">{phone}</td>
      <td className="hidden px-4 py-3 capitalize text-gray-400 md:table-cell">
        {serviceLabel}
      </td>
      <td className="px-4 py-3">
        <span className={cn("text-xs font-medium", urgencyColor)}>
          {urgencyLabel}
        </span>
      </td>
      <td className="px-4 py-3">
        <select
          value={lead.status}
          onChange={(e) => onStatusChange(lead.id, e.target.value)}
          className={cn(
            "rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
            "bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500",
            statusColor
          )}
        >
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s} className="bg-slate-900 text-white">
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </td>
      <td className="hidden px-4 py-3 text-gray-500 lg:table-cell">
        {created}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <Link
            href={`/leads/${lead.id}`}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
            title="View details"
          >
            <Eye className="h-4 w-4" />
          </Link>
          {canConvert && (
            <button
              onClick={onConvert}
              className="rounded-lg p-1.5 text-emerald-400 transition-colors hover:bg-emerald-400/10"
              title="Convert to Job"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
