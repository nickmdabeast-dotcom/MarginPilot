// ─── Client-side fetch layer for Leads ──────────────────────────────────────

const DEMO_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LeadCustomer {
  full_name: string;
  phone: string;
  email: string | null;
}

export interface Lead {
  id: string;
  company_id: string;
  customer_id: string | null;
  source: string;
  service_type: string | null;
  urgency: string;
  status: string;
  notes: string | null;
  created_at: string;
  customers: LeadCustomer | null;
}

export interface CreateLeadPayload {
  full_name: string;
  phone: string;
  email?: string;
  address?: string;
  service_type?: string;
  urgency?: string;
  source?: string;
  notes?: string;
}

export interface ConvertLeadPayload {
  lead_id: string;
  scheduled_start: string;
  duration_minutes: number;
}

export type LeadStatus = "new" | "contacted" | "quoted" | "scheduled" | "lost";

export const LEAD_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "quoted",
  "scheduled",
  "lost",
];

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  scheduled: "Scheduled",
  lost: "Lost",
};

export const STATUS_COLORS: Record<LeadStatus, string> = {
  new: "bg-blue-400/15 text-blue-400 border-blue-500/30",
  contacted: "bg-purple-400/15 text-purple-400 border-purple-500/30",
  quoted: "bg-orange-400/15 text-orange-400 border-orange-500/30",
  scheduled: "bg-emerald-400/15 text-emerald-400 border-emerald-500/30",
  lost: "bg-gray-400/15 text-gray-400 border-gray-500/30",
};

export const URGENCY_OPTIONS = [
  { value: "asap", label: "Emergency" },
  { value: "soon", label: "Soon" },
  { value: "flexible", label: "Whenever" },
] as const;

export const URGENCY_LABELS: Record<string, string> = {
  asap: "Emergency",
  soon: "Soon",
  flexible: "Whenever",
};

export const URGENCY_COLORS: Record<string, string> = {
  asap: "text-red-400",
  soon: "text-yellow-400",
  flexible: "text-gray-400",
};

export const SERVICE_TYPE_OPTIONS = [
  { value: "no_heat", label: "No Heat" },
  { value: "ac_down", label: "AC Down" },
  { value: "maintenance", label: "Maintenance" },
  { value: "install", label: "Install" },
  { value: "other", label: "Other" },
] as const;

export const SOURCE_OPTIONS = [
  { value: "website", label: "Website" },
  { value: "gmb", label: "Google" },
  { value: "facebook", label: "Facebook" },
  { value: "referral", label: "Referral" },
  { value: "manual", label: "Manual" },
] as const;

// ─── API helpers ────────────────────────────────────────────────────────────

interface ApiResult<T> {
  success: boolean;
  error?: string;
  data?: T;
}

export async function fetchLeads(
  params: { status?: string; search?: string } = {},
  signal?: AbortSignal
): Promise<ApiResult<Lead[]>> {
  const url = new URL("/api/leads", window.location.origin);
  url.searchParams.set("company_id", DEMO_COMPANY_ID);
  if (params.status) url.searchParams.set("status", params.status);

  try {
    const res = await fetch(url.toString(), { signal });
    const json = await res.json();

    if (!json.success) {
      return { success: false, error: json.error || "Failed to fetch leads" };
    }

    let leads: Lead[] = json.leads ?? [];

    // Client-side search filter (API doesn't support search param)
    if (params.search) {
      const q = params.search.toLowerCase();
      leads = leads.filter((l) => {
        const name = l.customers?.full_name?.toLowerCase() ?? "";
        const phone = l.customers?.phone ?? "";
        return name.includes(q) || phone.includes(q);
      });
    }

    return { success: true, data: leads };
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return { success: false, error: "Request cancelled" };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

export async function createLead(
  payload: CreateLeadPayload
): Promise<ApiResult<Lead>> {
  try {
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, company_id: DEMO_COMPANY_ID }),
    });
    const json = await res.json();

    if (!json.success) {
      return { success: false, error: json.error || "Failed to create lead" };
    }

    return { success: true, data: json.lead };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

export async function convertLeadToJob(
  payload: ConvertLeadPayload
): Promise<ApiResult<{ job: Record<string, unknown>; job_date: string }>> {
  try {
    const res = await fetch("/api/leads/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, company_id: DEMO_COMPANY_ID }),
    });
    const json = await res.json();

    if (!json.success) {
      return { success: false, error: json.error || "Failed to convert lead" };
    }

    const job = json.job;
    return { success: true, data: { job, job_date: job?.job_date ?? "" } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

export async function updateLeadStatus(
  leadId: string,
  status: string
): Promise<ApiResult<null>> {
  // Direct Supabase client update — no dedicated API route exists yet
  try {
    const { createBrowserSupabaseClient } = await import("@/lib/supabase/client");
    const db = createBrowserSupabaseClient();

    if (!db) {
      return { success: false, error: "Supabase client unavailable" };
    }

    const { error } = await db
      .from("leads")
      .update({ status })
      .eq("id", leadId);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update status",
    };
  }
}
