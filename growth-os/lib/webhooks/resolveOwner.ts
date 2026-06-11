import { getOwnerUserId } from "@/lib/supabase/env";

/**
 * Resolves the owning user for an incoming webhook. Single-tenant for now:
 * always returns OWNER_USER_ID. Multi-tenant routing (e.g. an account-mapping
 * table keyed on the payload) can replace this later — out of scope.
 */
export function resolveOwnerId(_payload: unknown): string {
  return getOwnerUserId();
}
