// AI caption generation for outbound Instagram posts.
// Uses the OpenAI Chat Completions REST API directly (no SDK dependency).
// Server-only: reads OPENAI_API_KEY. Never import from a client component.

export interface CaptionInput {
// Short description of the post topic / source content.
topic: string;
// Optional brand voice / tone guidance.
tone?: string;
// Optional hashtags the owner wants included.
hashtags?: string[];
}

const SYSTEM_PROMPT =
"You are a social media copywriter for Momentum, a wellness and productivity brand. " +
"Write a single Instagram caption: punchy, authentic, no clickbait. " +
"Keep it under 2200 characters. Use at most 5 relevant hashtags. " +
"Return only the caption text, no preamble.";

function getOpenAiKey(): string {
const key = process.env.OPENAI_API_KEY;
if (!key) throw new Error("Missing required environment variable: OPENAI_API_KEY");
return key;
}

function getModel(): string {
return process.env.OPENAI_CAPTION_MODEL ?? "gpt-4o-mini";
}

export async function generateCaption(input: CaptionInput): Promise<string> {
const hashtagLine = input.hashtags?.length
? `\nPreferred hashtags to include where natural: ${input.hashtags.join(" ")}`
: "";
const userPrompt =
`Topic: ${input.topic}\nTone: ${input.tone ?? "warm, motivating, grounded"}${hashtagLine}`;

const res = await fetch("https://api.openai.com/v1/chat/completions", {
method: "POST",
headers: {
"Content-Type": "application/json",
Authorization: `Bearer ${getOpenAiKey()}`,
},
body: JSON.stringify({
model: getModel(),
temperature: 0.8,
messages: [
{ role: "system", content: SYSTEM_PROMPT },
{ role: "user", content: userPrompt },
],
}),
cache: "no-store",
});

const json = await res.json();
if (!res.ok || json.error) {
const message = json?.error?.message ?? `OpenAI error (${res.status})`;
throw new Error(message);
}
const caption = json?.choices?.[0]?.message?.content?.trim();
if (!caption) throw new Error("OpenAI returned an empty caption");
return caption as string;
}
