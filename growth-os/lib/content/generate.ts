// Caption generator for Momentum OS Instagram drafts.
// Default mode is a deterministic template library (no external API needed) so
// generation works out-of-the-box. If OPENAI_API_KEY is set, the action layer
// may swap in an LLM call; this module always provides a safe fallback.

export const APP_CTA = "Start here: https://momentum-os-two.vercel.app/";

export type GeneratedDraft = {
  caption: string;
  utm_campaign: string;
};

type Angle = {
  key: string;
  hook: string;
  body: string;
};

// Brand-aligned angles mirroring the existing ig-* campaign taxonomy.
const ANGLES: Angle[] = [
  {
    key: "awareness-real-life",
    hook: "Momentum OS is built for real life - busy weeks, sick kids, travel.",
    body: "It is not about perfect numbers. It is about staying connected to yourself through all of it.",
  },
  {
    key: "philosophy",
    hook: "You don't need more goals. You need better feedback.",
    body: "Momentum OS shows how you're really tracking - energy, consistency, direction - at a glance.",
  },
  {
    key: "product-journal",
    hook: "A journal is useful. A journal with context is better.",
    body: "Your notes sit right beside your daily scores and trends, so reflection connects to your real life.",
  },
  {
    key: "product-coach",
    hook: "You don't need another inspirational quote. You need a coach that gets your day.",
    body: "Momentum OS learns your patterns and meets you where you are.",
  },
  {
    key: "cta-reset",
    hook: "Feeling scattered, stuck, or like your days blur together?",
    body: "Momentum OS is the simple daily system that helps you reset, reflect for a minute, and keep moving.",
  },
  {
    key: "cta-signup",
    hook: "Small, consistent reps beat big, rare pushes.",
    body: "Momentum OS makes the daily rep frictionless so progress actually compounds.",
  },
];

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Build a single brand-aligned Instagram caption ending with the standard CTA.
function composeCaption(angle: Angle): string {
  return `${angle.hook}\n\n${angle.body}\n\n${APP_CTA}`;
}

// Generate `count` brand-aligned Instagram drafts from the template library.
// Rotates through angles and tags each with a unique ig-* UTM campaign.
export function generateDrafts(count: number): GeneratedDraft[] {
  const safeCount = Math.max(1, Math.min(count, ANGLES.length * 3));
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const drafts: GeneratedDraft[] = [];

  for (let i = 0; i < safeCount; i++) {
    const angle = ANGLES[i % ANGLES.length];
    const seq = String(i + 1).padStart(2, "0");
    drafts.push({
      caption: composeCaption(angle),
      utm_campaign: `ig-${slug(angle.key)}-${stamp}-${seq}`,
    });
  }

  return drafts;
}
