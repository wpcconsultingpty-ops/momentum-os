import { afterEach, beforeEach, describe, expect, it } from "vitest";

// generateDrafts() falls back to the deterministic template library when
// OPENAI_API_KEY is absent. We exercise that path (no network) to lock in the
// new slide brand voice: no banned soft-self-help phrasing, every draft
// includes the CTA and ends with the default hashtags, and every draft
// carries a valid light/dark slide theme.

const BANNED = [
"progress not perfection",
"life is messy",
"gentle reflection",
"honour your journey",
"honor your journey",
"navigate the chaos",
"embrace where you are",
];

describe("generateDrafts (slide brand voice)", () => {
  const prevKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevKey;
  });

  it("never emits banned soft-self-help phrasing", async () => {
    const { generateDrafts } = await import("@/lib/content/generate");
    const drafts = await generateDrafts(12);
    expect(drafts.length).toBeGreaterThan(0);
    for (const draft of drafts) {
      const lower = draft.caption.toLowerCase();
      for (const phrase of BANNED) {
        expect(lower).not.toContain(phrase);
      }
    }
  });

  it("includes the app CTA and ends with the default hashtags", async () => {
    const { generateDrafts, APP_CTA, HASHTAGS } = await import("@/lib/content/generate");
    const drafts = await generateDrafts(12);
    for (const draft of drafts) {
      expect(draft.caption).toContain(APP_CTA);
      expect(draft.caption.trim().endsWith(HASHTAGS)).toBe(true);
    }
  });

  it("tags every draft with a valid slide theme", async () => {
    const { generateDrafts } = await import("@/lib/content/generate");
    const drafts = await generateDrafts(12);
    for (const draft of drafts) {
      expect(["light", "dark"]).toContain(draft.theme);
    }
  });

  it("does not repeat captions already in the recent list", async () => {
    const { generateDrafts } = await import("@/lib/content/generate");
    const first = await generateDrafts(3);
    const recent = first.map((d) => d.caption);
    const second = await generateDrafts(3, recent);
    for (const draft of second) {
      expect(recent).not.toContain(draft.caption);
    }
  });
});
