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

function buildSystemPrompt() {
  return `You are the Reset Coach for Momentum OS.

Brand frame:
- Momentum OS helps people reset, refocus, and move.
- The goal is not to fix a whole life in one conversation.
- The goal is to help the user win the next hour first.

Voice:
- Calm, grounded, practical, direct.
- Warm without sounding clinical, spiritual, cheesy, or over-optimistic.
- Use short sentences and plain English.
- Speak like a steady coach, not a hype bot.

Role boundaries:
- You are not a therapist, psychiatrist, doctor, or crisis service.
- Do not diagnose.
- Do not shame, scold, or dramatize.
- If the user sounds at risk of self-harm or harm to others, advise immediate help from local emergency or crisis support.

Behavior:
- Start by naming the user's current state in a grounded way.
- Use the Momentum OS context first, then the user's typed message.
- Focus on the next hour unless the user explicitly asks for a longer horizon.
- Give 1 to 3 concrete next steps.
- Reduce complexity when score is low or capacity is low.
- Protect momentum when score is strong.
- If signals conflict, prefer stabilising advice over ambitious advice.

Output rules:
- Return valid JSON only.
- Keep copy concise.
- Never return markdown.`;
}

function buildUserPrompt(context) {
  return `Use this Momentum OS state to coach the user.

Context:
${JSON.stringify(context, null, 2)}

Interpretation rules:
- vulnerable: simplify, stabilize, reduce noise, protect essentials.
- mixed: narrow focus, remove friction, choose one meaningful win.
- steady: keep rhythm, finish something important, avoid drift.
- strong: use momentum carefully, do not overload the day.
- low health score: recommend recovery, rest, hydration, food, walking, sleep protection, or reduced input.
- low personal score: recommend a clean relational action, honest communication, or removing emotional pressure.
- low capacity: lower ambition immediately.
- freeText should influence tone and action selection.
- reflection should be used if present.

Return a JSON object with:
- stateSummary
- coachingMode
- nextSteps
- avoidToday
- encouragement
- coachQuestion`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};

    const context = {
      overallScore: clamp(toNumber(body.overallScore)),
      overallLabel: body.overallLabel || deriveStateLabel(toNumber(body.overallScore)),
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
      temperature: 0.7,
      max_output_tokens: 500,
    });

    const text = response.output_text || "";

    return res.status(200).json({
      ok: true,
      coach: {
        stateSummary: text.split("\n")[0] || "Keep the next hour simple.",
        coachingMode: context.overallLabel === "strong" ? "protect-momentum" : context.overallLabel === "steady" ? "maintain" : context.overallLabel === "mixed" ? "narrow" : "stabilise",
        nextSteps: text
          .split("\n")
          .filter(line => /^\d+\./.test(line.trim()))
          .map(line => line.replace(/^\d+\.\s*/, "").trim())
          .slice(0, 3),
        avoidToday: "Do not widen the target.",
        encouragement: "A smaller hour can still be a good hour.",
        coachQuestion: "What is the one next step that would help most?"
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Coach request failed",
      detail: error?.message || "Unknown error",
    });
  }
}
