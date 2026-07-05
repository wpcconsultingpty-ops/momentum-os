// Server-side Supabase client using service role key (bypasses RLS)
// Uses `ws` for the realtime transport so it works on Node < 22.
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

let cached = null;
export function getAdminClient() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket },
    global: { headers: { "X-Client-Info": "momentum-os-admin" } },
  });
  return cached;
}
