import { createClient } from "@/lib/supabase/server";

/**
 * Returns the authenticated user's id, or null if not signed in.
 * Server-action / server-component use only.
 */
export async function getUserId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
