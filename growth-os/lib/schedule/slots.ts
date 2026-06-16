// Pure helpers for assigning Instagram post times to the next 6am / 6pm
// Brisbane slot. Brisbane (AEST) is UTC+10 year-round (no DST), so the slots
// map to fixed UTC instants: 6am Brisbane = 20:00 UTC (previous day),
// 6pm Brisbane = 08:00 UTC (same day). Framework-free so it can be unit-tested
// without Next.js or Supabase (mirrors lib/approvals/sweep.ts).

export const BRISBANE_UTC_OFFSET_HOURS = 10;

// Local wall-clock hours (Brisbane) we publish at.
export const SLOT_HOURS_LOCAL = [6, 18] as const;

// Given "now" (ms epoch), return the next 6am or 6pm Brisbane slot as a UTC
// ISO string. If both of today's slots have passed, rolls to 6am tomorrow.
export function nextSlotIso(now: number): string {
  const offsetMs = BRISBANE_UTC_OFFSET_HOURS * 60 * 60 * 1000;
  // Shift into Brisbane local time to reason about the wall clock.
  const local = new Date(now + offsetMs);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();

  for (const hour of SLOT_HOURS_LOCAL) {
    const slotUtcMs = Date.UTC(y, m, d, hour, 0, 0) - offsetMs;
    if (slotUtcMs > now) return new Date(slotUtcMs).toISOString();
  }
  const tomorrow = Date.UTC(y, m, d + 1, SLOT_HOURS_LOCAL[0], 0, 0) - offsetMs;
  return new Date(tomorrow).toISOString();
}

// Spread a batch across consecutive slots so multiple drafts enqueued at once
// don't all land on the same time (6am, then 6pm, then next 6am, ...).
export function assignSlots(now: number, count: number): string[] {
  const out: string[] = [];
  let cursor = now;
  for (let i = 0; i < count; i++) {
    const iso = nextSlotIso(cursor);
    out.push(iso);
    cursor = Date.parse(iso) + 60_000;
  }
  return out;
}
