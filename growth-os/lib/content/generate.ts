// Caption generator for Momentum OS Instagram drafts.
// Uses an LLM (when OPENAI_API_KEY is set) for genuinely fresh content, with a
// deterministic template library as a safe fallback. Includes a dedupe guard
// so previously-used captions are never repeated.
// Voice + visuals follow the Momentum OS slide system: grounded, masculine,
// practical copy for men over 40, on a forest-green / warm-stone / sage palette.

export const APP_CTA = "Start here: https://story-survey.vercel.app/";

// Default hashtag set appended to every generated draft caption.
export const HASHTAGS = "#HabitTracking #DailyCheckIn #PersonalGrowth #MindfulHabits #MomentumOS";

// Brand palette mirrored from the Momentum OS slide deck. Light slides use a
// warm off-white base with deep green type; dark slides use a forest gradient
// with warm white type and glassy green CTAs.
export const MOMENTUM_BRAND = {
  light: {
    bg: "#F3F0E8",
    surface: "#EEE9DF",
    surfaceSoft: "#E6E2D7",
    text: "#1C2A22",
    textMuted: "#5F6C62",
    textSoft: "#8A948C",
    primary: "#1E4A38",
    primaryAlt: "#315E49",
    sage: "#A8B39E",
    line: "#D8D2C6",
    ctaText: "#F3F1E8",
  },
  dark: {
    bg: "#0F211B",
    bgAlt: "#132A22",
    surface: "#173126",
    surfaceSoft: "#214034",
    text: "#F3F1E8",
    textMuted: "#C8CDC3",
    textSoft: "#AAB2A4",
    primary: "#4D7A61",
    primaryAlt: "#6C9276",
    sage: "#A8B39E",
    line: "rgba(243, 241, 232, 0.14)",
    ctaGlass: "rgba(61, 94, 73, 0.72)",
  },
  gradients: {
    heroDark: "linear-gradient(180deg, #0B1914 0%, #123126 55%, #0D211A 100%)",
    ctaDark: "linear-gradient(135deg, rgba(42,72,57,0.92) 0%, rgba(25,55,43,0.92) 100%)",
    ctaLight: "linear-gradient(135deg, #2D5C46 0%, #1F4535 100%)",
  },
} as const;

export type SlideTheme = "light" | "dark";

export type GeneratedDraft = {
  caption: string;
  utm_campaign: string;
  theme: SlideTheme;
};

type Angle = {
  key: string;
  theme: SlideTheme;
  hook: string;
  body: string;
};

const ANGLES: Angle[] = [
  { key: "hero-momentum-life", theme: "dark", hook: "Your Momentum. Your Life.", body: "Track your health. Build better habits. Get support. Live with purpose." },
  { key: "daily-checkin", theme: "light", hook: "Start with a daily check-in.", body: "A few honest minutes today can change how the whole week goes." },
  { key: "progress-visualised", theme: "dark", hook: "See your progress. Stay motivated.", body: "Momentum OS shows what is actually improving so you keep moving." },
  { key: "triggers-recovery", theme: "light", hook: "Understand your triggers. Build your recovery.", body: "Recognise what affects you, act with intention, and recover stronger each time." },
  { key: "support-available", theme: "light", hook: "You do not have to do it alone.", body: "Support is here when you need it, the moment you need it." },
  { key: "ai-coach", theme: "dark", hook: "Your AI coach. Always in your corner.", body: "Practical guidance and personalised support, available whenever you need it." },
  { key: "deeper-checkin", theme: "light", hook: "A deeper check-in. For real insight.", body: "Track what drives your day so you understand yourself and move forward." },
  { key: "men-over-40", theme: "dark", hook: "Better habits. Stronger mind. More life.", body: "Built for men over 40 who want to take back control of their health and habits." },
  { key: "not-a-todo-list", theme: "light", hook: "This is not another to-do list.", body: "Momentum OS shows how you are actually doing, not just what you ticked off." },
  { key: "real-support", theme: "dark", hook: "Clarity when you need it most.", body: "Daily check-ins, progress tracking, AI coaching, and support in one system." },
  { key: "reset-with-purpose", theme: "light", hook: "Reset with purpose.", body: "When things slip, check in, tell the truth, and take the next right step." },
  { key: "built-for-real-life", theme: "dark", hook: "Built for real life.", body: "For men carrying work, family, health, and pressure who still want to stay steady." },
];

const SYSTEM_PROMPT = [
"Write an Instagram caption for Momentum OS.",
"Audience: men over 40 who want more control over their health, habits, mindset, and daily life.",
"Voice: grounded, masculine, calm, supportive, practical, credible. Not hypey, not therapy-speak, not soft self-help cliches.",
"Banned phrases: progress not perfection, life is messy, gentle reflection, honour your journey, navigate the chaos, embrace where you are.",
"Style: lead with a strong headline or opening line, focus on practical outcomes (check-ins, progress tracking, AI coaching, support, recovery, better decisions), short sentences, sound like a trusted guide not an influencer.",
  "Spelling: write for an Australian audience using Australian/UK English spelling and punctuation; never use US spellings such as personalized, optimize, visualized, or color; prefer personalised, optimise, visualised, and colour.",
"Format: 3 to 6 short lines, no emojis, no hashtags, no quotation marks.",
`End with exactly: ${APP_CTA}`,
"Do NOT reuse phrasing from the AVOID list.",
].join(" ");

function slug(s: string): string {
return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function composeCaption(angle: Angle): string {
return `${angle.hook}\n\n${angle.body}\n\n${APP_CTA}`;
}

function shuffle<T>(arr: T[]): T[] {
const a = [...arr];
for (let i = a.length - 1; i > 0; i--) {
const j = Math.floor(Math.random() * (i + 1));
[a[i], a[j]] = [a[j], a[i]];
}
return a;
}

function norm(s: string): string {
return s.toLowerCase().replace(/https?:\/\/\S+/g, "").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

async function llmCaption(angle: Angle, avoid: string[]): Promise<string> {
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("missing OPENAI_API_KEY");
const avoidList = avoid.slice(0, 15).map((c) => `- ${c}`).join("\n") || "(none)";
const res = await fetch("https://api.openai.com/v1/chat/completions", {
method: "POST",
headers: {
"Content-Type": "application/json",
Authorization: `Bearer ${apiKey}`,
},
body: JSON.stringify({
model: "gpt-4o-mini",
temperature: 0.9,
presence_penalty: 0.6,
frequency_penalty: 0.4,
messages: [
{ role: "system", content: SYSTEM_PROMPT },
{ role: "user", content: `Theme (${angle.theme} slide): ${angle.hook} ${angle.body}\n\nAVOID these recent captions:\n${avoidList}` },
],
}),
});
if (!res.ok) throw new Error(`openai ${res.status}`);
const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
const out = data.choices?.[0]?.message?.content?.trim();
if (!out) throw new Error("empty completion");
return out;
}

export async function generateDrafts(count: number, recentCaptions: string[] = []): Promise<GeneratedDraft[]> {
const safeCount = Math.max(1, Math.min(count, ANGLES.length * 3));
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const used = new Set(recentCaptions.map(norm));
const useLLM = Boolean(process.env.OPENAI_API_KEY);
const drafts: GeneratedDraft[] = [];
const pool = shuffle(ANGLES);
let seq = 0;
for (const angle of pool) {
if (drafts.length >= safeCount) break;
let caption: string;
try {
caption = useLLM ? await llmCaption(angle, recentCaptions) : composeCaption(angle);
} catch {
caption = composeCaption(angle);
}
        caption = `${caption}\n\n${HASHTAGS}`;
if (used.has(norm(caption))) continue;
used.add(norm(caption));
seq += 1;
drafts.push({
      caption,
      utm_campaign: `ig-${slug(angle.key)}-${stamp}-${String(seq).padStart(2, "0")}`,theme: angle.theme,
});
}
return drafts;
}
