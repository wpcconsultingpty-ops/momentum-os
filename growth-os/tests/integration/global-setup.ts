import { Client as PgClient } from "pg";
import { getEnv } from "./setup";

/**
 * Vitest globalSetup for integration mode. Runs once before the integration
 * suite: confirms the required env is present and the local Supabase Postgres
 * is reachable, failing fast with a clear message instead of letting every test
 * time out against a dead stack. Only registered when RUN_INTEGRATION_TESTS=1.
 */
export default async function setup() {
  const { url, anonKey, serviceRoleKey, dbUrl } = getEnv();

  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) {
    throw new Error(
      `Integration tests require: ${missing.join(", ")}. ` +
        "Run `supabase start` and export its keys, or rely on the local CLI defaults.",
    );
  }

  const client = new PgClient({ connectionString: dbUrl });
  try {
    await client.connect();
    await client.query("select 1;");
  } catch (err) {
    throw new Error(
      `Could not reach local Supabase Postgres at ${dbUrl}. ` +
        "Is `supabase start` running? " +
        `Underlying error: ${(err as Error).message}`,
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}
