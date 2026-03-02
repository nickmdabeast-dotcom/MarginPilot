import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/types";
import {
  extractAccessTokenFromStoredSession,
  SUPABASE_AUTH_COOKIE,
} from "@/lib/supabase/ssr";
import { createServerClient } from "@/lib/supabase/server";

type ServerClient = SupabaseClient<Database>;
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export class AuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export interface UserProfileContext {
  user: User;
  profile: Profile | null;
}

export interface CompanyContext extends UserProfileContext {
  profile: Profile;
  companyId: string;
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

export async function getSessionUser(
  db: ServerClient = createServerClient()
): Promise<User | null> {
  const cookieStore = cookies();
  const storedSession = cookieStore.get(SUPABASE_AUTH_COOKIE)?.value ?? null;
  const accessToken = extractAccessTokenFromStoredSession(storedSession);

  if (!accessToken) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await db.auth.getUser(accessToken);

  if (error) {
    return null;
  }

  return user;
}

export async function getUserProfile(
  db: ServerClient = createServerClient()
): Promise<UserProfileContext | null> {
  const user = await getSessionUser(db);

  if (!user) {
    return null;
  }

  const { data: profile, error } = await db
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new AuthError(error.message, 500);
  }

  return { user, profile };
}

export async function requireCompanyId(
  db: ServerClient = createServerClient()
): Promise<CompanyContext> {
  const context = await getUserProfile(db);

  if (!context?.user) {
    throw new AuthError("Unauthorized", 401);
  }

  if (!context.profile?.company_id) {
    throw new AuthError("User profile is not linked to a company", 403);
  }

  return {
    user: context.user,
    profile: context.profile,
    companyId: context.profile.company_id,
  };
}
