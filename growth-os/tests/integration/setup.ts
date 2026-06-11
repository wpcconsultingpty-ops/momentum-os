import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Integration harness for a LOCAL Supabase stack (`supabase start`). Everything
 * here is gated behind RUN_INTEGRATION_TESTS=1 by the callers; in CI (no docker)
 * the integration tests are excluded entirely. Run locally with:
 *
 *   cd growth-os
 *   supabase start
 *   RUN_INTEGRATION_TESTS=1 npm run test:integration
 *
 * It expects the standard local Supabase endpoints/keys, overridable via env:
 *   SUPABASE_URL                 (default http://127.0.0.1:54321)
 *   SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 */

export const INTEGRATION_ENABLED = process.env.RUN_INTEGRATION_TESTS === "1";

// Default local-dev keys printed by `supabase start`. These are well-known,
// non-secret demo keys for the local stack — never used against a real project.
const DEFAULT_URL = "http://127.0.0.1:54321";
const DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlLWRlbW8iLCJpYXQiOjE2NDExNzYwMDAsImV4cCI6MTk1Njc1MjAwMH0.kRZGFLLVWdGtZJZqLpBdM-l1l9hQx3iqfRQq-mF_8M0";
const DEFAULT_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtZGVtbyIsImlhdCI6MTY0MTE3NjAwMCwiZXhwIjoxOTU2NzUyMDAwfQ.M2d2z4SFn5C7HlJlaSLfrzuYim9nbY_XI40uWFN3hEE";

export function getConfig() {
  return {
    url: process.env.SUPABASE_URL ?? DEFAULT_URL,
    anonKey: process.env.SUPABASE_ANON_KEY ?? DEFAULT_ANON_KEY,
    serviceRoleKey:
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? DEFAULT_SERVICE_ROLE_KEY,
  };
}

export type IntegrationContext = {
  adminClient: SupabaseClient;
  anonClient: SupabaseClient;
};

/**
 * Applies the two Phase 4 migrations against the running local stack via the
 * Supabase CLI. `supabase db reset` re-applies everything under
 * supabase/migrations/ cleanly (and proves they apply in order).
 */
export function applyMigrations(): void {
  execFileSync("supabase", ["db", "reset", "--no-seed"], {
    stdio: "inherit",
  });
}

export function makeClients(): IntegrationContext {
  const { url, anonKey, serviceRoleKey } = getConfig();
  const adminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anonClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return { adminClient, anonClient };
}

export type CreatedUser = {
  userId: string;
  email: string;
  accessToken: string;
};

/**
 * Creates a confirmed auth user via the admin API and signs them in to obtain a
 * JWT. The on_auth_user_created trigger inserts the matching profiles row.
 * Returns a client-usable access token for RLS-scoped queries.
 */
export async function createUser(
  ctx: IntegrationContext,
  email = `user-${crypto.randomUUID()}@example.com`,
  password = "test-password-123!",
): Promise<CreatedUser> {
  const { data: created, error: createErr } =
    await ctx.adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (createErr || !created.user) {
    throw createErr ?? new Error("createUser returned no user");
  }

  const { data: signIn, error: signInErr } =
    await ctx.anonClient.auth.signInWithPassword({ email, password });
  if (signInErr || !signIn.session) {
    throw signInErr ?? new Error("signIn returned no session");
  }

  return {
    userId: created.user.id,
    email,
    accessToken: signIn.session.access_token,
  };
}

/**
 * Returns a client whose requests carry the given user's JWT, so RLS policies
 * (auth.uid() = owner_id) are evaluated as that user.
 */
export function clientAs(accessToken: string): SupabaseClient {
  const { url, anonKey } = getConfig();
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export function sign(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
}
