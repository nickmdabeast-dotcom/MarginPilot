import { NextRequest, NextResponse } from "next/server";
import { isAuthError } from "@/lib/auth";
import { getApiContext } from "@/lib/apiContext";

export const dynamic = "force-dynamic";

// ─── GET /api/dispatch?date= or ?start=&end= ─────────────────────────────────
// Returns all technicians for the authenticated user's company and all jobs for
// a date range, ordered by job_date then technician then order_index.
//
// Query params (two modes):
//   date        — YYYY-MM-DD single day (backward compat, defaults to today)
//   start, end  — YYYY-MM-DD range (inclusive). Default: 7-day window from today.
//
// Returns: {
//   success: true,
//   start: string,
//   end: string,
//   technicians: Technician[],
//   jobs: DispatchJob[],
// }

interface TechnicianRow {
  id: string;
  name: string;
  truck_id: string;
}

interface DispatchJobRow {
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
  customers: { full_name: string } | { full_name: string }[] | null;
  technicians: { name: string } | { name: string }[] | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function today(): string {
  return new Date().toISOString().split("T")[0];
}

/** Adds N days to a YYYY-MM-DD string. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

export async function GET(req: NextRequest) {
  try {
    const { db, companyId } = await getApiContext();

    const { searchParams } = new URL(req.url);

    // Resolve date range: prefer start/end, fall back to date (single day),
    // default to 7-day window from today.
    let start: string;
    let end: string;

    const paramStart = searchParams.get("start");
    const paramEnd = searchParams.get("end");
    const paramDate = searchParams.get("date");

    if (paramStart && paramEnd) {
      start = paramStart;
      end = paramEnd;
    } else if (paramDate) {
      // Backward compat: single date = one-day range
      start = paramDate;
      end = paramDate;
    } else {
      start = today();
      end = addDays(start, 6);
    }

    if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
      return NextResponse.json({ success: false, error: "start and end must be YYYY-MM-DD" }, { status: 400 });
    }

    if (start > end) {
      return NextResponse.json({ success: false, error: "start must be <= end" }, { status: 400 });
    }

    // Fetch technicians and jobs in parallel
    const [techResult, jobsResult] = await Promise.all([
      db
        .from("technicians")
        .select("id, name, truck_id")
        .eq("company_id", companyId)
        .order("name"),

      db
        .from("jobs")
        .select("id, technician_id, customer_id, job_date, revenue_estimate, duration_estimate_hours, urgency, status, scheduled_start, scheduled_end, order_index, customers(full_name), technicians(name)")
        .eq("company_id", companyId)
        .gte("job_date", start)
        .lte("job_date", end)
        .order("job_date")
        .order("technician_id", { nullsFirst: true })
        .order("order_index"),
    ]);

    if (techResult.error) {
      return NextResponse.json({ success: false, error: techResult.error.message }, { status: 500 });
    }
    if (jobsResult.error) {
      return NextResponse.json({ success: false, error: jobsResult.error.message }, { status: 500 });
    }

    const technicians: TechnicianRow[] = (techResult.data ?? []) as TechnicianRow[];

    // Normalize PostgREST join shape (may return object or single-element array)
    const jobs = (jobsResult.data ?? []).map((row) => {
      const rawRow = row as unknown as DispatchJobRow;
      const customerRaw = rawRow.customers;
      const techRaw = rawRow.technicians;
      const customer = Array.isArray(customerRaw) ? customerRaw[0] : customerRaw;
      const tech = Array.isArray(techRaw) ? techRaw[0] : techRaw;
      return {
        id: rawRow.id,
        technician_id: rawRow.technician_id,
        customer_id: rawRow.customer_id,
        job_date: rawRow.job_date,
        revenue_estimate: Number(rawRow.revenue_estimate),
        duration_estimate_hours: Number(rawRow.duration_estimate_hours),
        urgency: Number(rawRow.urgency),
        status: rawRow.status ?? "scheduled",
        scheduled_start: rawRow.scheduled_start,
        scheduled_end: rawRow.scheduled_end,
        order_index: rawRow.order_index ?? 0,
        customer_name: customer?.full_name ?? null,
        technician_name: tech?.name ?? null,
      };
    });

    return NextResponse.json({
      success: true,
      start,
      end,
      technicians,
      jobs,
    });

  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.status }
      );
    }

    console.error("[/api/dispatch GET] Unhandled error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
