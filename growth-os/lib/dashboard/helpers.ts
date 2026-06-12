export type TimeWindow = "7d" | "30d" | "all";

export type DateRange = {
  // ISO strings (or null for the "all" lower bound) describing the current
  // window and the prior period of equal length immediately before it.
  currentStart: string | null;
  currentEnd: string;
  priorStart: string | null;
  priorEnd: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const WINDOW_DAYS: Record<Exclude<TimeWindow, "all">, number> = {
  "7d": 7,
  "30d": 30,
};

export function parseWindow(raw: string | undefined): TimeWindow {
  return raw === "7d" || raw === "all" ? raw : "30d";
}

/**
 * Resolve a window into current + prior ISO boundaries. `all` has no lower
 * bound and therefore no comparable prior period. `now` is injectable for tests.
 */
export function windowToRange(window: TimeWindow, now: number = Date.now()): DateRange {
  const currentEnd = new Date(now).toISOString();

  if (window === "all") {
    return {
      currentStart: null,
      currentEnd,
      priorStart: null,
      priorEnd: null,
    };
  }

  const spanMs = WINDOW_DAYS[window] * DAY_MS;
  const currentStartMs = now - spanMs;
  const priorStartMs = currentStartMs - spanMs;

  return {
    currentStart: new Date(currentStartMs).toISOString(),
    currentEnd,
    priorStart: new Date(priorStartMs).toISOString(),
    priorEnd: new Date(currentStartMs).toISOString(),
  };
}

/** Trial-start → converted-to-paid rate, 1 decimal. "n/a" when no trials. */
export function formatConversionRate(conversions: number, trials: number): string {
  if (trials <= 0) return "n/a";
  return `${((conversions / trials) * 100).toFixed(1)}%`;
}

export type Delta = {
  label: string;
  direction: "up" | "down" | "flat";
};

/**
 * Percent change of `current` vs `prior` for the equal-length prior period.
 * Returns null when there is no prior period to compare against (e.g. window=all).
 */
export function computeDelta(
  current: number,
  prior: number | null,
  windowLabel: string,
): Delta | null {
  if (prior === null) return null;

  if (prior === 0) {
    // No baseline: any growth is "new", otherwise flat.
    if (current === 0) {
      return { label: `0% vs prev ${windowLabel}`, direction: "flat" };
    }
    return { label: `new vs prev ${windowLabel}`, direction: "up" };
  }

  const pct = ((current - prior) / prior) * 100;
  const direction: Delta["direction"] = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  const sign = pct > 0 ? "+" : "";
  return { label: `${sign}${pct.toFixed(0)}% vs prev ${windowLabel}`, direction };
}

/** Compact relative time: "5m ago", "2h ago", "3d ago", "just now". */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = now - then;
  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** Drop-off from previous funnel stage, e.g. "↓ 65% from previous". */
export function formatDropOff(current: number, previous: number | null): string | null {
  if (previous === null) return null;
  if (previous === 0) return null;
  const dropPct = ((previous - current) / previous) * 100;
  if (dropPct <= 0) return null;
  return `↓ ${dropPct.toFixed(0)}% from previous`;
}

export const WINDOW_LABELS: Record<TimeWindow, string> = {
  "7d": "7d",
  "30d": "30d",
  all: "all time",
};
