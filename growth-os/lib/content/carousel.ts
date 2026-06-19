// Carousel slide builder for Momentum OS Instagram posts.
// Turns a single generated angle/caption into an ordered set of carousel
// slides (hook -> value lines -> CTA). Kept separate from generate.ts so the
// existing single-image caption pipeline is untouched.

import type { SlideTheme } from "./generate";

export type CarouselSlide = {
  kicker: string; // e.g. "1 / 5"
  hook: string; // headline rendered on the slide
  theme: SlideTheme;
};

export interface BuildSlidesInput {
  hook: string;
  body: string;
  theme: SlideTheme;
}

// Instagram allows 2-10 carousel items. We aim for 4-5: hook, up to 3 value
// lines split from the body, then a closing CTA slide.
export const MIN_SLIDES = 2;
export const MAX_SLIDES = 10;

export function buildSlides(input: BuildSlidesInput): CarouselSlide[] {
  const lines = input.body
    .split(/(?<=[.!?])\s+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const hooks: string[] = [input.hook];
  for (const line of lines.slice(0, 3)) hooks.push(line);
  hooks.push("Link in bio to start.");

  // Clamp to the IG-supported range.
  const clamped = hooks.slice(0, MAX_SLIDES);
  while (clamped.length < MIN_SLIDES) clamped.push("Link in bio to start.");

  return clamped.map((hook, i) => ({
    kicker: `${i + 1} / ${clamped.length}`,
    hook,
    theme: input.theme,
  }));
}

// Build the og-post image URL for a single slide. Mirrors the single-image
// URL the existing pipeline builds, adding the carousel kicker.
export function slideImageUrl(baseUrl: string, slide: CarouselSlide): string {
  const u = new URL("/api/og-post", baseUrl);
  u.searchParams.set("hook", slide.hook);
  u.searchParams.set("kicker", slide.kicker);
  u.searchParams.set("theme", slide.theme);
  return u.toString();
}
