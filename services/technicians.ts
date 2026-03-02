import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types";

type DbClient = SupabaseClient<Database>;

export interface UpsertTechnicianResult {
  id: string;
  /** True when a new technician record was inserted. */
  created: boolean;
}

/**
 * Finds an existing technician by name (case-insensitive) for the given
 * company, or creates one if none exists.
 *
 * Pass a shared `cache` Map per request to avoid redundant DB round-trips
 * when the same technician name appears across multiple rows.
 */
export async function findOrCreateTechnician(
  name: string,
  companyId: string,
  db: DbClient,
  cache: Map<string, string>
): Promise<UpsertTechnicianResult> {
  const key = name.toLowerCase();

  if (cache.has(key)) {
    return { id: cache.get(key)!, created: false };
  }

  const { data: existing } = await db
    .from("technicians")
    .select("id")
    .eq("company_id", companyId)
    .ilike("name", name)
    .maybeSingle();

  if (existing) {
    cache.set(key, existing.id);
    return { id: existing.id, created: false };
  }

  const { data: inserted, error } = await db
    .from("technicians")
    .insert({ company_id: companyId, name, truck_id: "UNASSIGNED" })
    .select("id")
    .single();

  if (error || !inserted) {
    throw new Error(
      `Failed to create technician "${name}": ${error?.message ?? "no data returned"}`
    );
  }

  cache.set(key, inserted.id);
  return { id: inserted.id, created: true };
}
