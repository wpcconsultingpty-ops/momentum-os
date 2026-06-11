import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

export type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

/**
 * Minimal cookie-store contract the server client depends on. The Next.js
 * `cookies()` store satisfies it; tests inject a fake implementing the same
 * shape so the SSR client can be exercised without `next/headers`.
 */
export type CookieAdapter = {
  getAll(): { name: string; value: string }[];
  set(name: string, value: string, options?: CookieOptions): void;
};

function nextCookieAdapter(): CookieAdapter {
  return cookies() as unknown as CookieAdapter;
}

export function createClient(cookieStore: CookieAdapter = nextCookieAdapter()) {
  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if middleware refreshes user sessions.
        }
      },
    },
  });
}
