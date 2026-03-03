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

// ─── Bulk resolution ──────────────────────────────────────────────────────────

export interface BulkResolveResult {
  /** name (lowercase) → technician UUID */
  map: Map<string, string>;
  /** How many technicians already existed in the DB */
  resolved_count: number;
  /** How many new technician records were created */
  created_count: number;
}

/**
 * Resolves an array of technician names to DB IDs in at most 2 queries:
 *   1. One SELECT … WHERE name ILIKE ANY(names) to find existing technicians.
 *   2. One INSERT for any names not found.
 * Returns a lowercase-name → ID map.
 */
export async function bulkResolveTechnicians(
  names: string[],
  companyId: string,
  db: DbClient
): Promise<BulkResolveResult> {
  const uniqueNames = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const map = new Map<string, string>();

  if (uniqueNames.length === 0) {
    return { map, resolved_count: 0, created_count: 0 };
  }

  // 1. Fetch all existing technicians for this company whose name matches
  const { data: existing, error: fetchErr } = await db
    .from("technicians")
    .select("id, name")
    .eq("company_id", companyId)
    .in("name", uniqueNames);

  if (fetchErr) {
    throw new Error(`Failed to fetch technicians: ${fetchErr.message}`);
  }

  for (const tech of existing ?? []) {
    map.set(tech.name.toLowerCase(), tech.id);
  }

  // Also check case-insensitive matches for names not found with exact match
  const missingNames = uniqueNames.filter((n) => !map.has(n.toLowerCase()));

  if (missingNames.length > 0) {
    // Try ilike for remaining names (handles case differences)
    const { data: ilikeResults } = await db
      .from("technicians")
      .select("id, name")
      .eq("company_id", companyId);

    if (ilikeResults) {
      for (const tech of ilikeResults) {
        const key = tech.name.toLowerCase();
        if (!map.has(key)) {
          map.set(key, tech.id);
        }
      }
    }

    // Determine truly missing names after case-insensitive check
    const trulyMissing = missingNames.filter((n) => !map.has(n.toLowerCase()));

    if (trulyMissing.length > 0) {
      // 2. Bulk insert missing technicians
      const insertPayload = trulyMissing.map((name) => ({
        company_id: companyId,
        name,
        truck_id: "UNASSIGNED",
      }));

      const { data: inserted, error: insertErr } = await db
        .from("technicians")
        .insert(insertPayload)
        .select("id, name");

      if (insertErr) {
        throw new Error(`Failed to bulk-insert technicians: ${insertErr.message}`);
      }

      for (const tech of inserted ?? []) {
        map.set(tech.name.toLowerCase(), tech.id);
      }

      return {
        map,
        resolved_count: uniqueNames.length - trulyMissing.length,
        created_count: trulyMissing.length,
      };
    }
  }

  return {
    map,
    resolved_count: uniqueNames.length,
    created_count: 0,
  };
}
