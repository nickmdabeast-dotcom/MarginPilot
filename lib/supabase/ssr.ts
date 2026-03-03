import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types";

export const SUPABASE_AUTH_COOKIE = "marginpilot-auth-token";

/** Consistent cookie attributes used everywhere we write the auth cookie. */
export const AUTH_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 365, // 1 year
};

type Cookie = { name: string; value: string };

interface CookieAdapter {
  getAll: () => Cookie[];
  setAll?: (cookies: Array<{ name: string; value: string }>) => void;
}

// ─── Session parsing ──────────────────────────────────────────────────────────

export function parseStoredSession(
  raw: string | null | undefined
): Record<string, unknown> | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    return null;
  } catch {
    try {
      const parsed = JSON.parse(decodeURIComponent(raw)) as unknown;
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
      return null;
    } catch {
      return null;
    }
  }
}

export function extractAccessTokenFromStoredSession(
  raw: string | null | undefined
): string | null {
  const session = parseStoredSession(raw);
  if (!session) return null;

  if (typeof session.access_token === "string") return session.access_token;

  const currentSession = session.currentSession;
  if (currentSession && typeof currentSession === "object") {
    const cs = currentSession as Record<string, unknown>;
    if (typeof cs.access_token === "string") return cs.access_token;
  }

  return null;
}

/** Extract both tokens needed for server-side session refresh. */
export function extractSessionTokens(
  raw: string | null | undefined
): { access_token: string; refresh_token: string } | null {
  const session = parseStoredSession(raw);
  if (!session) return null;

  const at =
    typeof session.access_token === "string" ? session.access_token : null;
  const rt =
    typeof session.refresh_token === "string" ? session.refresh_token : null;

  if (!at || !rt) return null;
  return { access_token: at, refresh_token: rt };
}

// ─── Cookie storage (browser) ────────────────────────────────────────────────

function cookieStorage() {
  return {
    getItem(key: string) {
      if (typeof document === "undefined") return null;

      const match = document.cookie
        .split("; ")
        .find((entry) => entry.startsWith(`${key}=`));
      if (!match) return null;

      return decodeURIComponent(match.slice(key.length + 1));
    },
    setItem(key: string, value: string) {
      if (typeof document === "undefined") return;
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${key}=${encodeURIComponent(value)}; Path=/; SameSite=Lax${secure}; Max-Age=31536000`;
    },
    removeItem(key: string) {
      if (typeof document === "undefined") return;
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${key}=; Path=/; SameSite=Lax${secure}; Max-Age=0`;
    },
  };
}

// ─── Client factories ────────────────────────────────────────────────────────

export function createBrowserClient(url: string, anonKey: string) {
  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: SUPABASE_AUTH_COOKIE,
      storage: cookieStorage(),
    },
  });
}

export function createServerClient(
  url: string,
  anonKey: string,
  options: { cookies: CookieAdapter }
) {
  const authCookie = options.cookies
    .getAll()
    .find((cookie) => cookie.name === SUPABASE_AUTH_COOKIE)?.value;
  const accessToken = extractAccessTokenFromStoredSession(authCookie);

  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
  });
}
