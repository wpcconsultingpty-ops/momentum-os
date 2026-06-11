import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "./env";

let cached: SupabaseClient | null = null;

/**
 * Service-role Supabase client. Bypasses RLS — only import this from
 * server-only webhook route handlers, never from client components.
 */
export function createAdminClient(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return cached;
}
