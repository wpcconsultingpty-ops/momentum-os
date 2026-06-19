import { describe, it, expect } from "vitest";
import {
  buildSlides,
  slideImageUrl,
  MIN_SLIDES,
  MAX_SLIDES,
} from "../../lib/content/carousel";

describe("buildSlides", () => {
  it("produces a hook slide, body slides, and a CTA slide", () => {
    const slides = buildSlides({
      hook: "Start with a daily check-in.",
      body: "A few honest minutes today. It changes the whole week. Stay steady.",
      theme: "light",
    });
    expect(slides.length).toBeGreaterThanOrEqual(MIN_SLIDES);
    expect(slides.length).toBeLessThanOrEqual(MAX_SLIDES);
    expect(slides[0].hook).toBe("Start with a daily check-in.");
    expect(slides[slides.length - 1].hook).toBe("Link in bio to start.");
  });

  it("numbers each slide with a kicker and carries the theme", () => {
    const slides = buildSlides({ hook: "Hook", body: "One. Two.", theme: "dark" });
    slides.forEach((s, i) => {
      expect(s.kicker).toBe(`${i + 1} / ${slides.length}`);
      expect(s.theme).toBe("dark");
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
  it("builds an og-post URL with hook, kicker and theme params", () => {
    const url = slideImageUrl("https://example.com", {
      kicker: "2 / 5",
      hook: "Stay steady.",
      theme: "dark",
    });
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/og-post");
    expect(parsed.searchParams.get("hook")).toBe("Stay steady.");
    expect(parsed.searchParams.get("kicker")).toBe("2 / 5");
    expect(parsed.searchParams.get("theme")).toBe("dark");
  });
});
