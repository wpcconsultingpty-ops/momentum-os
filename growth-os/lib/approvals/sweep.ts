// Pure, framework-free helpers for the "sweep" of stuck Instagram publishes.
// Extracted from app/api/cron/sweep-publishing/route.ts so the logic can be
// unit-tested without Next.js or Supabase. The route imports from here.
//
// A scheduled_post can get stuck in "publishing" if the serverless function
// that called the Graph API crashed/timed out after the optimistic lock flip
// but before writing a terminal status. This sweep finds those rows and marks
// them "failed" so the owner can retry from the Approvals dashboard.

export type PublishingRow = {
  id: string;
  status: string;
  // ISO timestamp of when the row was last updated (lock flip to "publishing").
  updated_at: string | null;
};

// Default grace period: a publish attempt older than this is considered stuck.
export const DEFAULT_STUCK_AFTER_MS = 10 * 60 * 1000; // 10 minutes

// Given the candidate "publishing" rows and the current time, return the ids
// that have been stuck longer than `stuckAfterMs`. Rows with a null/invalid
// updated_at are treated as stuck (we can't prove they are healthy).
export function selectStuckIds(
  rows: PublishingRow[],
  now: number,
  stuckAfterMs: number = DEFAULT_STUCK_AFTER_MS,
): string[] {
  return rows
    .filter((r) => r.status === "publishing")
    .filter((r) => {
      if (!r.updated_at) return true;
      const ts = Date.parse(r.updated_at);
      if (Number.isNaN(ts)) return true;
      return now - ts >= stuckAfterMs;
    })
    .map((r) => r.id);
}

// The cutoff ISO string used to query Supabase directly: any "publishing" row
// with updated_at <= cutoff is stuck. Keeps the route query in sync with the
// pure selector above.
export function stuckCutoffIso(
  now: number,
  stuckAfterMs: number = DEFAULT_STUCK_AFTER_MS,
): string {
  return new Date(now - stuckAfterMs).toISOString();
}
