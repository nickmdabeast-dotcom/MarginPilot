"use client";

import { useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  BarChart2,
  Clock,
  DollarSign,
  Loader2,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  optimizeJobs,
  type JobInput,
  type OptimizationResult,
  type ScoredJob,
  type TechnicianResult,
} from "@/lib/optimize";
import { formatCurrency } from "@/lib/utils";
import { UploadCSV } from "@/components/ui/UploadCSV";

// ─── Demo company — no auth in Phase 1 ───────────────────────────────────────
const DEMO_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

// ─── Mock data (shown before any upload) ─────────────────────────────────────
const MOCK_JOBS: JobInput[] = [
  { id: "j1", technician_id: "t1", technician_name: "Mike Torres",   revenue_estimate: 420,  duration_estimate_hours: 2,   urgency: 2 },
  { id: "j2", technician_id: "t2", technician_name: "Jake Williams", revenue_estimate: 380,  duration_estimate_hours: 3,   urgency: 1 },
  { id: "j3", technician_id: "t3", technician_name: "Sarah Chen",    revenue_estimate: 4200, duration_estimate_hours: 5,   urgency: 5 },
  { id: "j4", technician_id: "t1", technician_name: "Mike Torres",   revenue_estimate: 680,  duration_estimate_hours: 1.5, urgency: 4 },
  { id: "j5", technician_id: "t2", technician_name: "Jake Williams", revenue_estimate: 290,  duration_estimate_hours: 1,   urgency: 2 },
  { id: "j6", technician_id: "t3", technician_name: "Sarah Chen",    revenue_estimate: 180,  duration_estimate_hours: 1,   urgency: 1 },
  { id: "j7", technician_id: "t1", technician_name: "Mike Torres",   revenue_estimate: 3800, duration_estimate_hours: 6,   urgency: 5 },
  { id: "j8", technician_id: "t2", technician_name: "Jake Williams", revenue_estimate: 280,  duration_estimate_hours: 1,   urgency: 2 },
  { id: "j9", technician_id: "t3", technician_name: "Sarah Chen",    revenue_estimate: 1200, duration_estimate_hours: 2,   urgency: 5 },
];

// ─── Accent map ───────────────────────────────────────────────────────────────
const accentMap = {
  blue:   { icon: "text-blue-400 bg-blue-400/10",       bar: "bg-blue-400" },
  purple: { icon: "text-purple-400 bg-purple-400/10",   bar: "bg-purple-400" },
  green:  { icon: "text-emerald-400 bg-emerald-400/10", bar: "bg-emerald-400" },
  orange: { icon: "text-orange-400 bg-orange-400/10",   bar: "bg-orange-400" },
};
type Accent = keyof typeof accentMap;

// ─── KpiCard ──────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, accent = "blue", delay = 0 }: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  accent?: Accent; delay?: number;
}) {
  const cls = accentMap[accent];
  return (
    <motion.div
      className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm hover:bg-white/10 transition-colors duration-300"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-400">{label}</span>
        <div className={`rounded-lg p-2 ${cls.icon}`}>{icon}</div>
      </div>
      <div>
        <p className="text-3xl font-bold tracking-tight text-white">{value}</p>
        {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
      </div>
      <div className={`h-0.5 w-8 rounded-full ${cls.bar}`} />
    </motion.div>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────
function SectionHeader({ title, sub, delay = 0 }: { title: string; sub?: string; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay }}>
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </motion.div>
  );
}

// ─── StatCompare ──────────────────────────────────────────────────────────────
function StatCompare({ icon, label, before, after, accent = "blue", delay = 0 }: {
  icon: React.ReactNode; label: string; before: string; after: string;
  accent?: Accent; delay?: number;
}) {
  const cls = accentMap[accent];
  const unchanged = before === after;
  return (
    <motion.div
      className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm hover:bg-white/10 transition-colors duration-300"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</span>
        <div className={`rounded-lg p-1.5 ${cls.icon}`}>{icon}</div>
      </div>
      <div className="flex items-baseline gap-2">
        {!unchanged && (
          <>
            <span className="text-sm text-gray-600 line-through">{before}</span>
            <span className="text-xs text-gray-700">→</span>
          </>
        )}
        <span className="text-xl font-bold tracking-tight text-white">{after}</span>
      </div>
      {unchanged && <p className="text-xs text-gray-600">No change</p>}
      <div className={`h-0.5 w-6 rounded-full ${cls.bar}`} />
    </motion.div>
  );
}

// ─── TechComparisonTable ──────────────────────────────────────────────────────
interface TechRow {
  id: string; name: string;
  baseline: TechnicianResult; optimized: TechnicianResult;
}

function TechComparisonTable({ rows, delay = 0 }: { rows: TechRow[]; delay?: number }) {
  const headers = ["Technician", "Rev Before", "Rev After", "Hrs Before", "Hrs After", "OT Before", "OT After"];
  return (
    <motion.div
      className="overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
    >
      <div className="flex items-center gap-3 border-b border-white/10 px-6 py-4">
        <h2 className="text-sm font-semibold text-white">Technician Comparison</h2>
        <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-0.5 text-xs font-medium text-purple-300">
          Before vs After
        </span>
        <span className="ml-auto text-xs text-gray-600">{rows.length} technicians</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              {headers.map((h) => (
                <th key={h} className={`px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-600 ${
                  h === "Technician" ? "text-left" : ["OT Before","OT After"].includes(h) ? "text-center" : "text-right"
                }`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-white/5">
                <td className="px-5 py-3.5 font-medium text-gray-200">{row.name}</td>
                <td className="px-5 py-3.5 text-right text-gray-500">{formatCurrency(row.baseline.revenue)}</td>
                <td className="px-5 py-3.5 text-right font-semibold text-white">{formatCurrency(row.optimized.revenue)}</td>
                <td className="px-5 py-3.5 text-right text-gray-500">{row.baseline.total_hours}h</td>
                <td className="px-5 py-3.5 text-right font-semibold text-white">{row.optimized.total_hours}h</td>
                <td className="px-5 py-3.5 text-center">
                  {row.baseline.overtime_flag
                    ? <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-400"><AlertTriangle className="h-3 w-3" />OT</span>
                    : <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                </td>
                <td className="px-5 py-3.5 text-center">
                  {row.optimized.overtime_flag
                    ? <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-400"><AlertTriangle className="h-3 w-3" />OT</span>
                    : <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

// ─── UrgencyPip ───────────────────────────────────────────────────────────────
function UrgencyPip({ level }: { level: number }) {
  const colors = ["bg-gray-500","bg-gray-400","bg-yellow-500","bg-orange-500","bg-red-500"];
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={`inline-block h-1.5 w-1.5 rounded-full ${i < level ? colors[level - 1] : "bg-white/10"}`} />
      ))}
    </span>
  );
}

// ─── ScheduleTable ────────────────────────────────────────────────────────────
function ScheduleTable({ title, badge, badgeClass, jobs, showScore, overtimeTechIds, delay = 0 }: {
  title: string; badge: string; badgeClass: string;
  jobs: ScoredJob[]; showScore: boolean;
  overtimeTechIds: Set<string>; delay?: number;
}) {
  return (
    <motion.div
      className="overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
    >
      <div className="flex items-center gap-3 border-b border-white/10 px-6 py-4">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeClass}`}>{badge}</span>
        <span className="ml-auto text-xs text-gray-600">{jobs.length} jobs</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              {["#","Job / ID","Technician","Revenue","Hrs","Urgency",...(showScore?["Score"]:[]),"OT"].map((h) => (
                <th key={h} className={`px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-600 ${
                  ["Revenue","Hrs","Score"].includes(h) ? "text-right" : ["#","OT","Urgency"].includes(h) ? "text-center" : "text-left"
                }`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {jobs.map((job, i) => {
              const isOT = overtimeTechIds.has(job.technician_id);
              return (
                <tr key={job.id} className="transition-colors hover:bg-white/5">
                  <td className="px-5 py-3.5 text-center text-xs text-gray-600">{i + 1}</td>
                  <td className="px-5 py-3.5 font-medium text-gray-200 max-w-[160px] truncate">{job.id}</td>
                  <td className="px-5 py-3.5 text-gray-400">{job.technician_name}</td>
                  <td className="px-5 py-3.5 text-right font-semibold text-white">{formatCurrency(job.revenue_estimate)}</td>
                  <td className="px-5 py-3.5 text-right text-gray-400">{job.duration_estimate_hours}h</td>
                  <td className="px-5 py-3.5 text-center"><UrgencyPip level={job.urgency} /></td>
                  {showScore && <td className="px-5 py-3.5 text-right font-mono text-xs text-blue-300">{job.score.toFixed(1)}</td>}
                  <td className="px-5 py-3.5 text-center">
                    {isOT
                      ? <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-400"><AlertTriangle className="h-3 w-3" />OT</span>
                      : <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

// ─── DiagnosticChip ───────────────────────────────────────────────────────────
function DiagnosticChip({ icon, label, value, sub, status = "neutral", delay = 0 }: {
  icon: React.ReactNode; label: string; value: string; sub: string;
  status?: "good"|"warn"|"neutral"; delay?: number;
}) {
  const statusCls = {
    good:    { border: "border-emerald-500/20", icon: "text-emerald-400 bg-emerald-400/10", value: "text-emerald-400" },
    warn:    { border: "border-orange-500/20",  icon: "text-orange-400 bg-orange-400/10",   value: "text-orange-400"  },
    neutral: { border: "border-white/10",       icon: "text-blue-400 bg-blue-400/10",       value: "text-white"       },
  }[status];
  return (
    <motion.div
      className={`flex items-start gap-4 rounded-xl border ${statusCls.border} bg-white/5 p-5 backdrop-blur-sm`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
    >
      <div className={`rounded-lg p-2 ${statusCls.icon} shrink-0`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
        <p className={`mt-1 text-2xl font-bold tracking-tight ${statusCls.value}`}>{value}</p>
        <p className="mt-0.5 text-xs text-gray-600">{sub}</p>
      </div>
    </motion.div>
  );
}

// ─── ResultsPanel ─────────────────────────────────────────────────────────────
function ResultsPanel({ result, isDemo }: { result: OptimizationResult; isDemo: boolean }) {
  const { baseline, optimized, delta, diagnostics } = result;

  const totalTechHours = optimized.technicians.reduce((s, t) => s + t.total_hours, 0);
  const revenuePerTech = optimized.technicians.length > 0
    ? Math.round(optimized.total_revenue / optimized.technicians.length)
    : 0;
  const overtimeCount = optimized.overtime_tech_count;
  const overtimeTechIds = new Set(
    optimized.technicians.filter((t) => t.overtime_flag).map((t) => t.id)
  );
  const baselineById = Object.fromEntries(baseline.technicians.map((t) => [t.id, t]));
  const techRows: TechRow[] = optimized.technicians.map((t) => ({
    id: t.id, name: t.name,
    baseline: baselineById[t.id] ?? t,
    optimized: t,
  }));

  return (
    <div className="space-y-8">
      {/* Status badge */}
      <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
        isDemo
          ? "border-white/10 bg-white/5 text-gray-400"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      }`}>
        <span className={`h-1.5 w-1.5 rounded-full ${isDemo ? "bg-gray-500" : "bg-emerald-400"}`} />
        {isDemo ? "Demo data — upload a CSV to analyze your schedule" : "Live data — results from your uploaded schedule"}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={<DollarSign className="h-5 w-5" />} label="Total Revenue" value={formatCurrency(optimized.total_revenue)} sub={`${optimized.jobs.length} jobs scheduled`} accent="blue" delay={0.1} />
        <KpiCard icon={<Users className="h-5 w-5" />} label="Revenue Per Technician" value={formatCurrency(revenuePerTech)} sub={`Across ${optimized.technicians.length} technicians`} accent="purple" delay={0.2} />
        <KpiCard icon={<Clock className="h-5 w-5" />} label="Revenue Per Tech Hour" value={`${formatCurrency(optimized.revenue_per_hour)}/hr`} sub={`${totalTechHours.toFixed(1)} total field hours`} accent="green" delay={0.3} />
        <KpiCard icon={<AlertTriangle className="h-5 w-5" />} label="Overtime Flags" value={`${overtimeCount} technician${overtimeCount !== 1 ? "s" : ""}`} sub={`${delta.overtime_reduction > 0 ? `−${delta.overtime_reduction} OT · ` : ""}${Math.round(optimized.capacity_utilization_rate * 100)}% utilization`} accent={overtimeCount > 0 ? "orange" : "green"} delay={0.4} />
      </div>

      {/* Executive summary */}
      <div className="space-y-3">
        <SectionHeader title="Executive Summary" sub="Optimization impact vs. original manual schedule" delay={0.45} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCompare icon={<TrendingUp className="h-4 w-4" />} label="Revenue / Hr" before={`${formatCurrency(baseline.revenue_per_hour)}/hr`} after={`${formatCurrency(optimized.revenue_per_hour)}/hr`} accent="blue" delay={0.5} />
          <StatCompare icon={<AlertTriangle className="h-4 w-4" />} label="Overtime Techs" before={`${baseline.overtime_tech_count} tech${baseline.overtime_tech_count !== 1 ? "s" : ""}`} after={`${optimized.overtime_tech_count} tech${optimized.overtime_tech_count !== 1 ? "s" : ""}`} accent={delta.overtime_reduction > 0 ? "green" : "orange"} delay={0.55} />
          <StatCompare icon={<BarChart2 className="h-4 w-4" />} label="Workload Variance" before={`${baseline.workload_variance}h`} after={`${optimized.workload_variance}h`} accent={delta.workload_balance_improvement > 0 ? "green" : "blue"} delay={0.6} />
          <StatCompare icon={<Clock className="h-4 w-4" />} label="Idle Capacity" before={`${diagnostics.idle_capacity_hours}h`} after={`${diagnostics.idle_capacity_hours}h`} accent="purple" delay={0.65} />
        </div>
      </div>

      {/* Technician strip */}
      <motion.div className="grid grid-cols-1 gap-3 sm:grid-cols-3" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.7 }}>
        {optimized.technicians.map((tech) => (
          <div key={tech.id} className={`flex items-center justify-between rounded-xl border px-5 py-4 transition-colors ${
            tech.overtime_flag ? "border-orange-500/30 bg-orange-500/5" : "border-white/10 bg-white/5"
          }`}>
            <div>
              <p className="text-sm font-semibold text-white">{tech.name}</p>
              <p className="mt-0.5 text-xs text-gray-500">{tech.total_hours}h &nbsp;·&nbsp; {formatCurrency(tech.revenue_per_hour)}/hr</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-white">{formatCurrency(tech.revenue)}</p>
              {tech.overtime_flag
                ? <p className="text-xs font-medium text-orange-400">overtime risk</p>
                : <p className="text-xs font-medium text-emerald-400">on track</p>}
            </div>
          </div>
        ))}
      </motion.div>

      {/* Comparison table */}
      <TechComparisonTable rows={techRows} delay={0.75} />

      {/* Schedule tables */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ScheduleTable title="Original Schedule" badge="Manual dispatch" badgeClass="border-white/10 bg-white/5 text-gray-400" jobs={baseline.jobs} showScore={false} overtimeTechIds={overtimeTechIds} delay={0.8} />
        <ScheduleTable title="Optimized Schedule" badge="Revenue-weighted" badgeClass="border-blue-500/30 bg-blue-500/10 text-blue-300" jobs={optimized.jobs} showScore={true} overtimeTechIds={overtimeTechIds} delay={0.85} />
      </div>

      {/* Diagnostics */}
      <div className="space-y-3">
        <SectionHeader title="Diagnostics" sub="Advisory signals — no automated action taken" delay={0.9} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <DiagnosticChip icon={<Users className="h-4 w-4" />} label="Underutilized Techs" value={String(diagnostics.underutilized_count)} sub="< 5 assigned hours" status={diagnostics.underutilized_count > 0 ? "warn" : "good"} delay={0.95} />
          <DiagnosticChip icon={<AlertTriangle className="h-4 w-4" />} label="Overloaded Techs" value={String(diagnostics.overloaded_count)} sub="> 9 assigned hours" status={diagnostics.overloaded_count > 0 ? "warn" : "good"} delay={1.0} />
          <DiagnosticChip icon={<BarChart2 className="h-4 w-4" />} label="Revenue Concentration" value={diagnostics.revenue_concentration_ratio > 0 ? `${diagnostics.revenue_concentration_ratio}×` : "N/A"} sub="Highest / lowest tech revenue" status={diagnostics.revenue_concentration_ratio > 3 ? "warn" : "neutral"} delay={1.05} />
          <DiagnosticChip icon={<Activity className="h-4 w-4" />} label="Capacity Utilization" value={`${Math.round(optimized.capacity_utilization_rate * 100)}%`} sub={`${diagnostics.idle_capacity_hours}h idle of ${optimized.technicians.length * 8}h total`} status="neutral" delay={1.1} />
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const demoResult = useMemo(() => optimizeJobs(MOCK_JOBS), []);

  const [liveResult, setLiveResult] = useState<OptimizationResult | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeError, setOptimizeError] = useState<string | null>(null);

  const handleUploadSuccess = useCallback(async (date: string) => {
    setOptimizing(true);
    setOptimizeError(null);
    try {
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: DEMO_COMPANY_ID, date }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setOptimizeError(json.error ?? "Optimization failed");
        return;
      }
      setLiveResult(json.result);
    } catch (err) {
      setOptimizeError(err instanceof Error ? err.message : "Network error");
    } finally {
      setOptimizing(false);
    }
  }, []);

  const activeResult = liveResult ?? demoResult;
  const isDemo = liveResult === null;

  return (
    <div className="space-y-8">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="text-2xl font-bold text-white">Revenue Operations</h1>
        <p className="mt-1 text-sm text-gray-500">
          {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </motion.div>

      {/* Upload panel */}
      <motion.div
        className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05 }}
      >
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-white">Upload Schedule CSV</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Export from your FSM tool and upload. Analysis runs automatically.
          </p>
        </div>
        <UploadCSV companyId={DEMO_COMPANY_ID} onSuccess={handleUploadSuccess} />
      </motion.div>

      {/* Optimization state */}
      <AnimatePresence>
        {optimizing && (
          <motion.div key="optimizing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/10 px-5 py-4">

            <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
            <span className="text-sm text-blue-300">Running revenue analysis…</span>
          </motion.div>
        )}
        {optimizeError && !optimizing && (
          <motion.div key="opt-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-4">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <span className="text-sm text-red-300">{optimizeError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      <ResultsPanel result={activeResult} isDemo={isDemo} />

    </div>
  );
}
