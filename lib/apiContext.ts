import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types";
import { requireCompanyId, type CompanyContext } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";

type DbClient = SupabaseClient<Database>;

export interface ApiContext extends CompanyContext {
  db: DbClient;
}

/**
 * Creates a Supabase server client + resolves the authenticated company context.
 * Throws AuthError (401/403) if session is missing or profile lacks a company_id.
 *
 * Usage:
 *   const { db, companyId } = await getApiContext();
 */
export async function getApiContext(): Promise<ApiContext> {
  const db = createServerClient();
  const ctx = await requireCompanyId(db);
  return { db, ...ctx };
}
