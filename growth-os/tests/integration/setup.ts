import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { Client as PgClient } from "pg";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Integration harness for a LOCAL Supabase stack (`supabase start`). Everything
 * here is gated behind RUN_INTEGRATION_TESTS=1 by the callers; in the default
 * `npm test` run the integration tests are excluded entirely. Run locally with:
 *
 *   cd growth-os
 *   supabase start
 *   RUN_INTEGRATION_TESTS=1 npm run test:integration
 *
 * It expects the standard local Supabase endpoints/keys, overridable via env:
 *   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_DB_URL (direct Postgres connection, for resetDb truncation)
 */

export const INTEGRATION_ENABLED = process.env.RUN_INTEGRATION_TESTS === "1";

// Default local-dev keys printed by `supabase start`. These are well-known,
// non-secret demo keys for the local stack — never used against a real project.
const DEFAULT_URL = "http://127.0.0.1:54321";
const DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlLWRlbW8iLCJpYXQiOjE2NDExNzYwMDAsImV4cCI6MTk1Njc1MjAwMH0.kRZGFLLVWdGtZJZqLpBdM-l1l9hQx3iqfRQq-mF_8M0";
const DEFAULT_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtZGVtbyIsImlhdCI6MTY0MTE3NjAwMCwiZXhwIjoxOTU2NzUyMDAwfQ.M2d2z4SFn5C7HlJlaSLfrzuYim9nbY_XI40uWFN3hEE";
const DEFAULT_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export type IntegrationEnv = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  dbUrl: string;
};

/**
 * Reads the integration env. When RUN_INTEGRATION_TESTS=1, missing values fall
 * back to the well-known local CLI defaults so a vanilla `supabase start` works
 * with zero extra config. Outside integration mode it still returns defaults so
 * importing this module never throws.
 */
export function getEnv(): IntegrationEnv {
  return {
    url:
      process.env.NEXT_PUBLIC_SUPABASE_URL ??
      process.env.SUPABASE_URL ??
      DEFAULT_URL,
    anonKey:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.SUPABASE_ANON_KEY ??
      DEFAULT_ANON_KEY,
    serviceRoleKey:
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? DEFAULT_SERVICE_ROLE_KEY,
    dbUrl: process.env.SUPABASE_DB_URL ?? DEFAULT_DB_URL,
  };
}

/** Back-compat alias used by the original Phase 5 tests. */
export function getConfig() {
  const env = getEnv();
  return {
    url: env.url,
    anonKey: env.anonKey,
    serviceRoleKey: env.serviceRoleKey,
  };
}

/** Service-role client — bypasses RLS. */
export function adminClient(): SupabaseClient {
  const { url, serviceRoleKey } = getEnv();
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Anon client with no session. */
export function anonClient(): SupabaseClient {
  const { url, anonKey } = getEnv();
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Client whose requests carry the given user's JWT, so RLS policies
 * (auth.uid() = owner_id) are evaluated as that user.
 */
export function clientForToken(accessToken: string): SupabaseClient {
  const { url, anonKey } = getEnv();
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** Back-compat alias for clientForToken. */
export const clientAs = clientForToken;

export type IntegrationContext = {
  adminClient: SupabaseClient;
  anonClient: SupabaseClient;
};

/** Back-compat factory returning a pair of clients. */
export function makeClients(): IntegrationContext {
  return { adminClient: adminClient(), anonClient: anonClient() };
}

/**
 * Applies the two Phase 4 migrations against the running local stack via the
 * Supabase CLI. `supabase db reset` re-applies everything under
 * supabase/migrations/ cleanly (and proves they apply in order). In CI the
 * stack is already migrated by `supabase start`, so this is opt-in via
 * INTEGRATION_OWNS_SUPABASE=1 (set only when the harness booted the stack).
 */
export function applyMigrations(): void {
  if (process.env.INTEGRATION_SKIP_MIGRATIONS === "1") return;
  execFileSync("supabase", ["db", "reset", "--no-seed"], {
    stdio: "inherit",
  });
}

export type CreatedUser = {
  userId: string;
  email: string;
  accessToken: string;
};

/**
 * Creates an email-confirmed auth user via the admin API and signs them in to
 * obtain a JWT. The on_auth_user_created trigger should insert the matching
 * profiles row, but the trigger can silently no-op on the admin.createUser
 * code path in some local-CLI / GoTrue combinations — so we ALSO explicitly
 * upsert the profiles row as service-role and poll until it's visible before
 * returning. The trigger is still exercised end-to-end by the auth signup
 * route test (auth.integration.test.ts "signUp action ... profiles row"), so
 * we're not weakening coverage of the production code path.
 *
 * Returns the user id, email, and a usable access token.
 */
export async function createUser(
  ctxOrOpts?: IntegrationContext | { email?: string; password?: string },
  emailArg?: string,
  passwordArg?: string,
): Promise<CreatedUser> {
  // Support both the legacy positional signature createUser(ctx, email, pw)
  // and the spec signature createUser({ email, password }).
  let email: string;
  let password: string;
  const isCtx =
    ctxOrOpts != null && "adminClient" in (ctxOrOpts as IntegrationContext);
  if (isCtx) {
    email = emailArg ?? `user-${crypto.randomUUID()}@example.com`;
    password = passwordArg ?? "test-password-123!";
  } else {
    const opts = (ctxOrOpts as { email?: string; password?: string }) ?? {};
    email = opts.email ?? `user-${crypto.randomUUID()}@example.com`;
    password = opts.password ?? "test-password-123!";
  }

  const admin = isCtx ? (ctxOrOpts as IntegrationContext).adminClient : adminClient();
  const anon = isCtx ? (ctxOrOpts as IntegrationContext).anonClient : anonClient();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    throw createErr ?? new Error("createUser returned no user");
  }

  // Belt-and-braces: ensure the profile row exists before we hand back the
  // user. Upsert via service-role (bypasses RLS) and poll for visibility to
  // avoid races between trigger commit and the next FK-bearing insert.
  const { error: upsertErr } = await admin
    .from("profiles")
    .upsert(
      { id: created.user.id, email, full_name: null },
      { onConflict: "id" },
    );
  if (upsertErr) {
    throw new Error(`profile upsert failed for ${email}: ${upsertErr.message}`);
  }

  // Poll for the profile row — should be immediate, but Postgres MVCC under
  // load with the trigger racing the upsert can briefly hide it.
  let profileReady = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("id", created.user.id)
      .maybeSingle();
    if (data?.id) {
      profileReady = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!profileReady) {
    throw new Error(`profiles row never appeared for ${email}`);
  }

  const { data: signIn, error: signInErr } =
    await anon.auth.signInWithPassword({ email, password });
  if (signInErr || !signIn.session) {
    throw signInErr ?? new Error("signIn returned no session");
  }

  return {
    userId: created.user.id,
    email,
    accessToken: signIn.session.access_token,
  };
}

export type SignedInUser = {
  accessToken: string;
  refreshToken: string;
  supabase: SupabaseClient;
};

/**
 * Signs an existing user in with the anon client and returns the tokens plus a
 * JWT-scoped client for asserting RLS from that user's perspective.
 */
export async function signInAs({
  email,
  password = "test-password-123!",
}: {
  email: string;
  password?: string;
}): Promise<SignedInUser> {
  const { data, error } = await anonClient().auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    throw error ?? new Error("signInAs returned no session");
  }
  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    supabase: clientForToken(data.session.access_token),
  };
}

const RESET_TABLES = [
  "attribution_events",
  "webhook_deliveries",
  "trials",
  "leads",
  "content",
  "profiles",
];

/**
 * Truncates all domain tables (FK order handled by CASCADE) between tests so
 * each test starts from a clean slate. Uses a direct Postgres connection
 * because PostgREST cannot run TRUNCATE. Also clears auth.users so the profile
 * trigger fires fresh on the next createUser.
 */
export async function resetDb(): Promise<void> {
  const { dbUrl } = getEnv();
  const client = new PgClient({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query(
      `truncate table ${RESET_TABLES.map((t) => `public.${t}`).join(", ")} restart identity cascade;`,
    );
    // profiles rows are removed by the cascade above via the FK from auth.users,
    // but auth.users itself must be cleared explicitly.
    await client.query("delete from auth.users;");
  } finally {
    await client.end();
  }
}

export function sign(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
}
