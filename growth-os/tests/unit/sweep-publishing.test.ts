import { describe, it, expect } from "vitest";
import {
  selectStuckIds,
  stuckCutoffIso,
  DEFAULT_STUCK_AFTER_MS,
  type PublishingRow,
} from "@/lib/approvals/sweep";

const NOW = Date.parse("2025-01-01T12:00:00.000Z");
const minsAgo = (m: number) => new Date(NOW - m * 60 * 1000).toISOString();

describe("selectStuckIds", () => {
  it("flags publishing rows older than the grace period", () => {
    const rows: PublishingRow[] = [
      { id: "a", status: "publishing", updated_at: minsAgo(15) },
      { id: "b", status: "publishing", updated_at: minsAgo(5) },
    ];
    expect(selectStuckIds(rows, NOW)).toEqual(["a"]);
  });

  it("treats a row exactly at the threshold as stuck", () => {
    const rows: PublishingRow[] = [
      { id: "a", status: "publishing", updated_at: new Date(NOW - DEFAULT_STUCK_AFTER_MS).toISOString() },
    ];
    expect(selectStuckIds(rows, NOW)).toEqual(["a"]);
  });

  it("ignores rows that are not in publishing status", () => {
    const rows: PublishingRow[] = [
      { id: "a", status: "approved", updated_at: minsAgo(60) },
      { id: "b", status: "published", updated_at: minsAgo(60) },
      { id: "c", status: "failed", updated_at: minsAgo(60) },
    ];
    expect(selectStuckIds(rows, NOW)).toEqual([]);
  });

  it("treats null or invalid updated_at as stuck", () => {
    const rows: PublishingRow[] = [
      { id: "a", status: "publishing", updated_at: null },
      { id: "b", status: "publishing", updated_at: "not-a-date" },
    ];
    expect(selectStuckIds(rows, NOW)).toEqual(["a", "b"]);
  });

  it("respects a custom grace period", () => {
    const rows: PublishingRow[] = [
      { id: "a", status: "publishing", updated_at: minsAgo(2) },
    ];
    expect(selectStuckIds(rows, NOW, 60 * 1000)).toEqual(["a"]);
    expect(selectStuckIds(rows, NOW, 5 * 60 * 1000)).toEqual([]);
  });
});

describe("stuckCutoffIso", () => {
  it("returns now minus the grace period as an ISO string", () => {
    expect(stuckCutoffIso(NOW, 10 * 60 * 1000)).toBe("2025-01-01T11:50:00.000Z");
  });

  it("defaults to DEFAULT_STUCK_AFTER_MS", () => {
    const expected = new Date(NOW - DEFAULT_STUCK_AFTER_MS).toISOString();
    expect(stuckCutoffIso(NOW)).toBe(expected);
  });
});
