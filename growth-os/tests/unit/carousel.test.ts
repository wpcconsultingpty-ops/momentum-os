import { describe, it, expect } from "vitest";
import {
  buildSlides,
  slideImageUrl,
  MIN_SLIDES,
  MAX_SLIDES,
} from "../../lib/content/carousel";

describe("buildSlides", () => {
  it("produces a cover slide, feature slides, and a CTA slide", () => {
    const slides = buildSlides({
      hook: "Start with a daily check-in.",
      body: "A few honest minutes today. It changes the whole week. Stay steady.",
      theme: "light",
    });
    expect(slides.length).toBeGreaterThanOrEqual(MIN_SLIDES);
    expect(slides.length).toBeLessThanOrEqual(MAX_SLIDES);
    expect(slides[0].hook).toBe("Start with a daily check-in.");
    expect(slides[0].kind).toBe("cover");
    const last = slides[slides.length - 1];
    expect(last.kind).toBe("cta");
    expect(last.hook).toBe("Ready to take control?");
  });

  it("numbers each slide with a kicker and alternates the theme", () => {
    const slides = buildSlides({ hook: "Hook", body: "One. Two.", theme: "dark" });
    slides.forEach((s, i) => {
      expect(s.kicker).toBe(`${i + 1} / ${slides.length}`);
      expect(s.theme).toBe(i % 2 === 0 ? "dark" : "light");
    });
  });

  it("always returns at least MIN_SLIDES even for empty body", () => {
    const slides = buildSlides({ hook: "Solo hook", body: "", theme: "light" });
    expect(slides.length).toBeGreaterThanOrEqual(MIN_SLIDES);
  });

  it("never exceeds MAX_SLIDES for a very long body", () => {
    const body = Array.from({ length: 40 }, (_, i) => `Line ${i}.`).join(" ");
    const slides = buildSlides({ hook: "Hook", body, theme: "light" });
    expect(slides.length).toBeLessThanOrEqual(MAX_SLIDES);
  });
});

describe("slideImageUrl", () => {
  it("builds an og-post URL with hook, kicker, theme, kind and accent params", () => {
    const url = slideImageUrl("https://example.com", {
      kicker: "2 / 8",
      hook: "Stay steady.",
      theme: "dark",
      kind: "feature",
      accent: "steady.",
      footer: "Link in bio",
    });
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/og-post");
    expect(parsed.searchParams.get("hook")).toBe("Stay steady.");
    expect(parsed.searchParams.get("kicker")).toBe("2 / 8");
    expect(parsed.searchParams.get("theme")).toBe("dark");
    expect(parsed.searchParams.get("kind")).toBe("feature");
    expect(parsed.searchParams.get("accent")).toBe("steady.");
    expect(parsed.searchParams.get("footer")).toBe("Link in bio");
  });

  it("omits optional params when not provided", () => {
    const url = slideImageUrl("https://example.com", {
      kicker: "1 / 2",
      hook: "Hook only",
      theme: "light",
      kind: "cover",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("accent")).toBeNull();
    expect(parsed.searchParams.get("features")).toBeNull();
  });
});
