// Carousel slide builder for Momentum OS Instagram posts.
// Turns a single generated angle/caption into an ordered, branded set of
// carousel slides (cover -> feature slides -> CTA). Kept separate from
// generate.ts so the existing single-image caption pipeline is untouched.

import type { SlideTheme } from "./generate";

export type SlideKind = "cover" | "feature" | "cta";

export type CarouselSlide = {
  kicker: string; // e.g. "1 / 8"
  hook: string; // headline rendered on the slide
  theme: SlideTheme;
  kind: SlideKind;
  accent?: string; // phrase within hook rendered in the accent colour
  sub?: string; // supporting subhead line
  features?: string[]; // badge rows
  footer?: string; // footer / CTA pill text
};

export interface BuildSlidesInput {
  hook: string;
  body: string;
  theme: SlideTheme;
}

// Instagram allows 2-10 carousel items. We aim for an 8-slide branded deck.
export const MIN_SLIDES = 2;
export const MAX_SLIDES = 10;
export const TARGET_SLIDES = 8;

// Pick the last 1-2 words of a headline to highlight in the accent colour.
function pickAccent(headline: string): string {
  const words = headline.trim().split(/\s+/);
  if (words.length <= 2) return words[words.length - 1] ?? "";
  return words.slice(-2).join(" ");
}

export function buildSlides(input: BuildSlidesInput): CarouselSlide[] {
  const lines = input.body
    .split(/(?<=[.!?])\s+/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Up to 5 feature/value lines become the middle slides.
  const valueLines = lines.slice(0, 5);

  const raw: Array<Omit<CarouselSlide, "kicker" | "theme">> = [];

  // 1. Cover slide.
  raw.push({
    kind: "cover",
    hook: input.hook,
    accent: pickAccent(input.hook),
    sub: "The operating system for building momentum.",
    footer: "Swipe to see how \u2192",
  });

  // 2..n. Feature slides, one per value line.
  for (const line of valueLines) {
    raw.push({
      kind: "feature",
      hook: line,
      accent: pickAccent(line),
      features: [],
    });
  }

  // Final CTA slide.
  raw.push({
    kind: "cta",
    hook: "Ready to take control?",
    accent: "take control?",
    sub: "You've got this. We've got you.",
    footer: "Start today \u2014 link in bio",
  });

  // Clamp to the IG-supported range.
  const clamped = raw.slice(0, MAX_SLIDES);
  while (clamped.length < MIN_SLIDES) {
    clamped.push({ kind: "cta", hook: "Link in bio to start.", footer: "Link in bio" });
  }

  // Assign alternating themes + the running counter.
  return clamped.map((slide, i) => ({
    ...slide,
    kicker: `${i + 1} / ${clamped.length}`,
    theme: (i % 2 === 0 ? "dark" : "light") as SlideTheme,
  }));
}

// Build the og-post image URL for a single slide, passing all branded params.
export function slideImageUrl(baseUrl: string, slide: CarouselSlide): string {
  const u = new URL("/api/og-post", baseUrl);
  u.searchParams.set("hook", slide.hook);
  u.searchParams.set("kicker", slide.kicker);
  u.searchParams.set("theme", slide.theme);
  u.searchParams.set("kind", slide.kind);
  if (slide.accent) u.searchParams.set("accent", slide.accent);
  if (slide.sub) u.searchParams.set("sub", slide.sub);
  if (slide.footer) u.searchParams.set("footer", slide.footer);
  if (slide.features && slide.features.length) {
    u.searchParams.set("features", slide.features.join("|"));
  }
  return u.toString();
}
