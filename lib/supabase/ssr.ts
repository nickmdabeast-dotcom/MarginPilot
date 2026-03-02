import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types";

export const SUPABASE_AUTH_COOKIE = "marginpilot-auth-token";

type Cookie = { name: string; value: string };

interface CookieAdapter {
  getAll: () => Cookie[];
  setAll?: (cookies: Array<{ name: string; value: string }>) => void;
}

function parseStoredSession(raw: string | null | undefined) {
  if (!raw) return null;

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    try {
      return JSON.parse(decodeURIComponent(raw)) as unknown;
    } catch {
      return null;
    }
  }
}

export function extractAccessTokenFromStoredSession(
  raw: string | null | undefined
): string | null {
  const session = parseStoredSession(raw);
  if (!session || typeof session !== "object") {
    return null;
  }

  const sessionRecord = session as Record<string, unknown>;
  const directToken = sessionRecord.access_token;
  if (typeof directToken === "string") {
    return directToken;
  }

  const currentSession = sessionRecord.currentSession;
  if (currentSession && typeof currentSession === "object") {
    const currentSessionRecord = currentSession as Record<string, unknown>;
    if (typeof currentSessionRecord.access_token === "string") {
      return currentSessionRecord.access_token;
    }
  }

  return null;
}

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

  const client = createClient<Database>(url, anonKey, {
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

  if (!authCookie) {
    return client;
  }

  options.cookies.setAll?.([
    { name: SUPABASE_AUTH_COOKIE, value: authCookie },
  ]);

  return client;
}
