// Caption generator for Momentum OS Instagram drafts.
// Uses an LLM (when OPENAI_API_KEY is set) for genuinely fresh content, with a
// deterministic template library as a safe fallback. Includes a dedupe guard
// so previously-used captions are never repeated.


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

const ANGLES: Angle[] = [
  { key: "awareness-real-life", hook: "Momentum OS is built for real life - busy weeks, sick kids, travel.", body: "It is not about perfect numbers. It is about staying connected to yourself through all of it." },
  { key: "philosophy", hook: "You don't need more goals. You need better feedback.", body: "Momentum OS shows how you're really tracking - energy, consistency, direction - at a glance." },
  { key: "product-journal", hook: "A journal is useful. A journal with context is better.", body: "Your notes sit right beside your daily scores and trends, so reflection connects to your real life." },
  { key: "product-coach", hook: "You don't need another inspirational quote. You need a coach that gets your day.", body: "Momentum OS learns your patterns and meets you where you are." },
  { key: "cta-reset", hook: "Feeling scattered, stuck, or like your days blur together?", body: "Momentum OS is the simple daily system that helps you reset, reflect for a minute, and keep moving." },
  { key: "cta-signup", hook: "Small, consistent reps beat big, rare pushes.", body: "Momentum OS makes the daily rep frictionless so progress actually compounds." },
  { key: "product-history", hook: "Your memory is biased.", body: "Momentum OS keeps an honest history of your days - scores, notes, trends - so you can see how far you've come." },
  { key: "product-weekly-trend", hook: "One bad day shouldn't define your week.", body: "Momentum OS shows your weekly trend so you can zoom out and see the real pattern." },
  { key: "product-streaks", hook: "Streaks are powerful - but only when they track something that matters.", body: "Momentum OS builds streaks around real progress, not busywork." },
  { key: "mindset-reset", hook: "Losing momentum is normal. What happens next is what counts.", body: "Momentum OS is built for the reset - notice, adjust, keep going." },
  { key: "positioning-not-todo", hook: "Momentum OS is not another to-do list.", body: "It tracks how you're doing, where your energy is, and whether you're moving in the right direction." },
  { key: "awareness-origin", hook: "I built Momentum OS because I was tired of feeling busy but not actually moving.", body: "It's the daily system I wished existed - simple, honest, built around real life." },
];

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
{ role: "system", content: `Write a short Instagram caption for Momentum OS, a habit-tracking and journaling app. Voice: honest, calm, anti-hustle, real-life. 2-4 short sentences. End with exactly: ${APP_CTA} Do NOT reuse phrasing from the AVOID list.` },
{ role: "user", content: `Theme: ${angle.hook} ${angle.body}\n\nAVOID these recent captions:\n${avoidList}` },
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
if (used.has(norm(caption))) continue;
used.add(norm(caption));
seq += 1;
drafts.push({
caption,
utm_campaign: `ig-${slug(angle.key)}-${stamp}-${String(seq).padStart(2, "0")}`,
});
}
return drafts;
}
