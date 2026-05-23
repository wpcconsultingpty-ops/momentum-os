import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min = 0, max = 100) {
  if (!Number.isFinite(value)) return null;
  return Math.max(min, Math.min(max, value));
}

function deriveStateLabel(score) {
  if (!Number.isFinite(score)) return "unknown";
  if (score < 35) return "vulnerable";
  if (score < 55) return "mixed";
  if (score < 75) return "steady";
  return "strong";
}

function coachingModeForLabel(label) {
  if (label === "vulnerable") return "stabilise";
  if (label === "mixed") return "narrow";
  if (label === "steady") return "maintain";
  if (label === "strong") return "protect-momentum";
  return "narrow";
}

function buildSystemPrompt() {
  return `You are the Reset Coach for Momentum OS.

Brand frame:
- Momentum OS helps people reset, refocus, and move.
- The goal is not to fix a whole life in one conversation.
- The goal is to help the user win the next hour first.

Voice:
- Calm, grounded, practical, direct.
- Warm without sounding clinical, spiritual, cheesy, generic, or over-optimistic.
- Use short sentences and plain English.
- Speak like a steady coach, not a therapist or a hype bot.

Role boundaries:
- You are not a therapist, psychiatrist, doctor, or crisis service.
- Do not diagnose.
- Do not shame, dramatise, or moralise.
- If the user sounds at risk of self-harm or harm to others, advise immediate help from local emergency or crisis support.

Behavior:
- Use the Momentum OS state first, then the user message.
- Focus on the next hour unless the user explicitly asks for a longer horizon.
- Make the advice specific to the user's state.
- Do not give vague filler.
- Do not repeat the prompt back.
- Give exactly 3 next steps.
- Make each step concrete and immediately doable.
- End with one short coaching question.

Return valid JSON only.`;
}

function buildUserPrompt(context) {
  return `Use this Momentum OS state to coach the user.

Context:
${JSON.stringify(context, null, 2)}

Interpretation rules:
- vulnerable: simplify, stabilise, reduce noise, protect essentials.
- mixed: narrow focus, remove friction, choose one meaningful win.
- steady: keep rhythm, finish something important, avoid drift.
- strong: use momentum carefully, do not overload the day.
- low health score: recommend recovery, hydration, food, walking, breathing space, lower stimulation, or sleep protection.
- low personal score: recommend one honest relational action, one boundary, or removing emotional pressure.
- low capacity: lower ambition immediately.
- reflection should shape the advice if present.
- freeText should shape the tone and the next steps.

Return JSON with exactly these fields:
{
  "stateSummary": "string",
  "coachingMode": "stabilise | narrow | maintain | protect-momentum",
  "nextSteps": ["string", "string", "string"],
  "avoidToday": "string",
  "encouragement": "string",
  "coachQuestion": "string"
}`;
}

function safeParseCoach(text, fallbackMode) {
  try {
    const parsed = JSON.parse(text);
    if (
      parsed &&
      typeof parsed.stateSummary === "string" &&
      Array.isArray(parsed.nextSteps) &&
      parsed.nextSteps.length >= 1
    ) {
      return {
        stateSummary: parsed.stateSummary,
        coachingMode: parsed.coachingMode || fallbackMode,
        nextSteps: parsed.nextSteps.slice(0, 3),
        avoidToday: parsed.avoidToday || "Do not widen the target.",
        encouragement: parsed.encouragement || "A smaller hour can still be a good hour.",
        coachQuestion: parsed.coachQuestion || "What is the one next step that would help most?",
      };
    }
  } catch {}

  return {
    stateSummary: "The next hour needs less pressure and more clarity.",
    coachingMode: fallbackMode,
    nextSteps: [
      "Pick one task that would make the hour feel better.",
      "Remove one distraction before you begin.",
      "Finish with one recovery action like water, food, or a short walk."
    ],
    avoidToday: "Do not widen the target.",
    encouragement: "A smaller hour can still be a good hour.",
    coachQuestion: "What is the one next step that would help most?"
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      ok: false,
      error: "Missing OPENAI_API_KEY",
      detail: "Set OPENAI_API_KEY in Vercel environment variables.",
    });
  }

  try {
    const body = req.body || {};
    const overallScore = clamp(toNumber(body.overallScore));
    const overallLabel = String(body.overallLabel || deriveStateLabel(toNumber(body.overallScore))).toLowerCase();

    const context = {
      overallScore,
      overallLabel,
      healthScore: clamp(toNumber(body.healthScore)),
      personalScore: clamp(toNumber(body.personalScore)),
      bleed: clamp(toNumber(body.bleed)),
      target: clamp(toNumber(body.target)),
      capacity: clamp(toNumber(body.capacity)),
      focus: String(body.focus || "").trim(),
      reflection: String(body.reflection || "").trim(),
      freeText: String(body.freeText || body.prompt || "").trim(),
      timeHorizon: String(body.timeHorizon || "next hour").trim(),
      view: String(body.view || "coach").trim(),
    };

        const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(context) },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "momentum_coach",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              stateSummary: { type: "string" },
              coachingMode: {
                type: "string",
                enum: ["stabilise", "narrow", "maintain", "protect-momentum"],
              },
              nextSteps: {
                type: "array",
                items: { type: "string" },
                minItems: 3,
                maxItems: 3,
              },
              avoidToday: { type: "string" },
              encouragement: { type: "string" },
              coachQuestion: { type: "string" },
            },
            required: [
              "stateSummary",
              "coachingMode",
              "nextSteps",
              "avoidToday",
              "encouragement",
              "coachQuestion",
            ],
          },
        },
      },
      temperature: 0.8,
      max_output_tokens: 700,
    });

    const output = response.output_text || "";
    const fallbackMode = coachingModeForLabel(overallLabel);
    const coach = safeParseCoach(output, fallbackMode);

    return res.status(200).json({ ok: true, coach, raw: output });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Coach request failed",
      detail: error?.message || "Unknown error",
    });
  }
}
