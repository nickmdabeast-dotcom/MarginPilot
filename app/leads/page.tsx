"use client";

import { useState, useCallback } from "react";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { NewLeadForm } from "@/components/leads/NewLeadForm";
import { LeadsTable } from "@/components/leads/LeadsTable";

export default function LeadsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = useCallback((msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  function handleCreated() {
    setRefreshKey((k) => k + 1);
  }

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
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-400/10">
          <Users className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Leads</h1>
          <p className="text-sm text-gray-400">
            Manage your pipeline and convert leads to jobs
          </p>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Left: New Lead form */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <NewLeadForm onCreated={handleCreated} onToast={showToast} />
        </div>

        {/* Right: Pipeline + Table */}
        <LeadsTable refreshKey={refreshKey} onToast={showToast} />
      </div>
    </>
  );
}
