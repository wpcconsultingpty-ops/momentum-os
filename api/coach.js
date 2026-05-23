import OpenAI from "openai";
import { buildSystemPrompt, buildUserPrompt, coachResponseSchema } from "./prompts.js";

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
      text: {
        format: {
          type: "json_schema",
          name: "momentum_coach_response",
          schema: coachResponseSchema,
        },
      },
      temperature: 0.7,
      max_output_tokens: 500,
    });

    const content = response.output_text || "{}";
    const parsed = JSON.parse(content);

    return res.status(200).json({ ok: true, coach: parsed });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Coach request failed",
      detail: error?.message || "Unknown error",
    });
  }
}
