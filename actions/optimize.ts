"use server";

import { createServerClient } from "@/lib/supabase/server";
import { optimizeJobs, type OptimizationResult } from "@/lib/optimize";
import { getJobsByDate } from "@/services/jobs";

type ActionResult =
  | { success: true; result: OptimizationResult }
  | { success: false; error: string };

export async function runOptimization(
  companyId: string,
  date: string, // YYYY-MM-DD
  averageHourlyLaborCost?: number
): Promise<ActionResult> {
  if (!companyId || !date) {
    return { success: false, error: "companyId and date are required" };
  }

  try {
    const db = createServerClient();
    const jobs = await getJobsByDate(companyId, date, db);

    return { success: true, result: optimizeJobs(jobs, averageHourlyLaborCost) };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
