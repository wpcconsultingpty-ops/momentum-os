import { describe, expect, it } from "vitest";

import {
  computeDelta,
  formatConversionRate,
  formatDropOff,
  formatRelativeTime,
  parseWindow,
  windowToRange,
} from "@/lib/dashboard/helpers";

const NOW = Date.UTC(2026, 5, 12, 12, 0, 0); // 2026-06-12T12:00:00Z
const DAY = 24 * 60 * 60 * 1000;

describe("parseWindow", () => {
  it("defaults to 30d for unknown/missing values", () => {
    expect(parseWindow(undefined)).toBe("30d");
    expect(parseWindow("nonsense")).toBe("30d");
  });

  it("accepts the three known windows", () => {
    expect(parseWindow("7d")).toBe("7d");
    expect(parseWindow("30d")).toBe("30d");
    expect(parseWindow("all")).toBe("all");
  });
});

describe("windowToRange", () => {
  it("builds current + equal-length prior boundaries for 7d", () => {
    const range = windowToRange("7d", NOW);
    expect(range.currentEnd).toBe(new Date(NOW).toISOString());
    expect(range.currentStart).toBe(new Date(NOW - 7 * DAY).toISOString());
    expect(range.priorEnd).toBe(range.currentStart);
    expect(range.priorStart).toBe(new Date(NOW - 14 * DAY).toISOString());
  });

  it("has no lower bound or prior period for 'all'", () => {
    const range = windowToRange("all", NOW);
    expect(range.currentStart).toBeNull();
    expect(range.priorStart).toBeNull();
    expect(range.priorEnd).toBeNull();
    expect(range.currentEnd).toBe(new Date(NOW).toISOString());
  });
});

describe("formatConversionRate", () => {
  it("returns n/a when there are no trials", () => {
    expect(formatConversionRate(0, 0)).toBe("n/a");
    expect(formatConversionRate(5, 0)).toBe("n/a");
  });

  it("formats a 1-decimal percentage", () => {
    expect(formatConversionRate(1, 4)).toBe("25.0%");
    expect(formatConversionRate(1, 3)).toBe("33.3%");
    expect(formatConversionRate(3, 3)).toBe("100.0%");
  });
});

describe("computeDelta", () => {
  it("returns null when there is no prior period", () => {
    expect(computeDelta(10, null, "all time")).toBeNull();
  });

  it("marks growth from a zero baseline as new/up", () => {
    expect(computeDelta(4, 0, "30d")).toEqual({ label: "new vs prev 30d", direction: "up" });
    expect(computeDelta(0, 0, "30d")).toEqual({ label: "0% vs prev 30d", direction: "flat" });
  });

  it("computes signed percentage change with direction", () => {
    expect(computeDelta(112, 100, "30d")).toEqual({ label: "+12% vs prev 30d", direction: "up" });
    expect(computeDelta(80, 100, "30d")).toEqual({ label: "-20% vs prev 30d", direction: "down" });
    expect(computeDelta(100, 100, "30d")).toEqual({ label: "0% vs prev 30d", direction: "flat" });
  });
});

describe("formatRelativeTime", () => {
  it("renders minutes, hours, and days ago", () => {
    expect(formatRelativeTime(new Date(NOW - 5 * 60 * 1000).toISOString(), NOW)).toBe("5m ago");
    expect(formatRelativeTime(new Date(NOW - 2 * 60 * 60 * 1000).toISOString(), NOW)).toBe("2h ago");
    expect(formatRelativeTime(new Date(NOW - 3 * DAY).toISOString(), NOW)).toBe("3d ago");
  });

  it("renders 'just now' for sub-minute and future times", () => {
    expect(formatRelativeTime(new Date(NOW - 10 * 1000).toISOString(), NOW)).toBe("just now");
    expect(formatRelativeTime(new Date(NOW + 5000).toISOString(), NOW)).toBe("just now");
  });
});

describe("formatDropOff", () => {
  it("returns null for the first stage or no drop", () => {
    expect(formatDropOff(100, null)).toBeNull();
    expect(formatDropOff(100, 100)).toBeNull();
    expect(formatDropOff(120, 100)).toBeNull();
  });

  it("reports drop-off from the previous stage", () => {
    expect(formatDropOff(35, 100)).toBe("↓ 65% from previous");
  });
});
