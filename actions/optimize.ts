"use server";

import { isAuthError } from "@/lib/auth";
import { getApiContext } from "@/lib/apiContext";
import { optimizeJobs, type OptimizationResult } from "@/lib/optimize";
import { getJobsByDate } from "@/services/jobs";

type ActionResult =
  | { success: true; result: OptimizationResult }
  | { success: false; error: string };

export async function runOptimization(
  date: string, // YYYY-MM-DD
  averageHourlyLaborCost?: number
): Promise<ActionResult> {
  if (!date) {
    return { success: false, error: "date is required" };
  }

  try {
    const { db, companyId } = await getApiContext();
    const jobs = await getJobsByDate(companyId, date, db);

    return { success: true, result: optimizeJobs(jobs, averageHourlyLaborCost) };
  } catch (err) {
    if (isAuthError(err)) {
      return { success: false, error: err.message };
    }

    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
