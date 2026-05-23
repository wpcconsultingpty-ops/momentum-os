import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ALLOWED_SUPPORT_STYLES = [
  "grounding",
  "simplify",
  "steady",
  "protect-energy",
];

const ALLOWED_TIME_SCOPES = [
  "next-hour",
  "today",
  "this-evening",
];

const GENERIC_PHRASES = [
  "a lot on your shoulders",
  "part of you wants clarity",
  "cleaner next step",
  "small moments of steadiness",
  "move more gently",
  "you are not failing",
  "hold space",
  "be kind to yourself",
];

function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min = 0, max = 100) {
  if (!Number.isFinite(value)) return null;
  return Math.max(min, Math.min(max, value));
}

function toCleanString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).replace(/\s+/g, " ").trim();
}

function toStringArray(value, maxItems = 7) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => toCleanString(item))
    .filter(Boolean)
    .slice(0, maxItems);
}

function toNumericArray(value, maxItems = 14) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => clamp(toNumber(item)))
    .filter((item) => Number.isFinite(item))
    .slice(0, maxItems);
}

function average(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const valid = values.filter((v) => Number.isFinite(v));
  if (!valid.length) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

function latest(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const valid = values.filter((v) => Number.isFinite(v));
  return valid.length ? valid[valid.length - 1] : null;
}

function slopeLabel(values) {
  if (!Array.isArray(values) || values.length < 2) return "unknown";
  const first = values[0];
  const last = values[values.length - 1];
  if (!Number.isFinite(first) || !Number.isFinite(last)) return "unknown";

  const delta = last - first;

  if (delta <= -12) return "falling";
  if (delta >= 12) return "rising";
  return "flat";
}

function volatilityLabel(values) {
  if (!Array.isArray(values) || values.length < 3) return "unknown";

  let totalChange = 0;
  let transitions = 0;

  for (let i = 1; i < values.length; i += 1) {
    if (Number.isFinite(values[i]) && Number.isFinite(values[i - 1])) {
      totalChange += Math.abs(values[i] - values[i - 1]);
      transitions += 1;
    }
  }

  if (!transitions) return "unknown";

  const avgChange = totalChange / transitions;

  if (avgChange >= 15) return "high";
  if (avgChange >= 7) return "moderate";
  return "low";
}

function deriveStateLabel(score) {
  if (!Number.isFinite(score)) return "unknown";
  if (score < 35) return "vulnerable";
  if (score < 55) return "mixed";
  if (score < 75) return "steady";
  return "strong";
}

function supportStyleForLabel(label) {
  if (label === "vulnerable") return "grounding";
  if (label === "mixed") return "simplify";
  if (label === "steady") return "steady";
  if (label === "strong") return "protect-energy";
  return "simplify";
}

function inferEmotionalState(context) {
  const text = `${context.reflection} ${context.freeText} ${context.recentJournalThemes.join(" ")}`
    .toLowerCase();

  if (
    text.includes("overwhelmed") ||
    text.includes("too much") ||
    text.includes("can't cope") ||
    text.includes("burnt out")
  ) {
    return "overwhelmed";
  }

  if (
    text.includes("tired") ||
    text.includes("flat") ||
    text.includes("drained") ||
    text.includes("exhausted") ||
    text.includes("low energy") ||
    text.includes("lonely")
  ) {
    return "emotionally tired";
  }

  if (
    text.includes("anxious") ||
    text.includes("stressed") ||
    text.includes("worried") ||
    text.includes("panic")
  ) {
    return "anxious";
  }

  if (
    text.includes("stuck") ||
    text.includes("lost") ||
    text.includes("disconnected") ||
    text.includes("lonely")
  ) {
    return "disconnected";
  }

  if (
    text.includes("hard on myself") ||
    text.includes("failure") ||
    text.includes("not enough")
  ) {
    return "self-critical";
  }

  return "steady";
}

function buildContext(body) {
  const overallScore = clamp(toNumber(body.overallScore));
  const healthScore = clamp(toNumber(body.healthScore));
  const personalScore = clamp(toNumber(body.personalScore));
  const capacity = clamp(toNumber(body.capacity));

  const recentHealthScores = toNumericArray(body.recentHealthScores);
  const recentPersonalScores = toNumericArray(body.recentPersonalScores);
  const recentCapacityScores = toNumericArray(body.recentCapacityScores);
  const recentOverallScores = toNumericArray(body.recentOverallScores);
  const recentJournalThemes = toStringArray(body.recentJournalThemes, 8);
  const recentJournalSnippets = toStringArray(body.recentJournalSnippets, 3);

  const overallLabel = deriveStateLabel(overallScore);

  const context = {
    overallScore,
    overallLabel,
    healthScore,
    personalScore,
    capacity,

    recentHealthScores,
    recentPersonalScores,
    recentCapacityScores,
    recentOverallScores,

    recentHealthTrend: slopeLabel(recentHealthScores),
    recentPersonalTrend: slopeLabel(recentPersonalScores),
    recentCapacityTrend: slopeLabel(recentCapacityScores),
    recentOverallTrend: slopeLabel(recentOverallScores),

    overallVolatility: volatilityLabel(recentOverallScores),

    healthAverage7d: average(recentHealthScores),
    personalAverage7d: average(recentPersonalScores),
    capacityAverage7d: average(recentCapacityScores),
    overallAverage7d: average(recentOverallScores),

    healthLatest: latest(recentHealthScores),
    personalLatest: latest(recentPersonalScores),
    capacityLatest: latest(recentCapacityScores),
    overallLatest: latest(recentOverallScores),

    bleed: toCleanString(body.bleed),
    target: toCleanString(body.target),
    focus: toCleanString(body.focus),

    reflection: toCleanString(body.reflection),
    freeText: toCleanString(body.freeText || body.prompt),

    recentJournalThemes,
    recentJournalSnippets,

    timeHorizon: normalizeTimeHorizon(body.timeHorizon),
    view: toCleanString(body.view, "reflection"),
  };

  return {
    ...context,
    emotionalState: inferEmotionalState(context),
    hasUsableData: hasUsableData(context),
  };
}

function normalizeTimeHorizon(value) {
  const raw = toCleanString(value, "today").toLowerCase();
  if (raw === "next hour" || raw === "next-hour") return "next-hour";
  if (raw === "this evening" || raw === "this-evening") return "this-evening";
  return "today";
}

function hasUsableData(context) {
  return Boolean(
    Number.isFinite(context.overallScore) ||
    Number.isFinite(context.healthScore) ||
    Number.isFinite(context.personalScore) ||
    Number.isFinite(context.capacity) ||
    context.recentOverallScores.length ||
    context.recentHealthScores.length ||
    context.recentPersonalScores.length ||
    context.recentCapacityScores.length ||
    context.reflection ||
    context.freeText ||
    context.recentJournalThemes.length ||
    context.recentJournalSnippets.length
  );
}

function buildSystemPrompt() {
  return `
You are the Reflection Guide for Momentum OS.

Your job:
- Give grounded, emotionally aware support based on the user's actual data and words.
- Sound calm, clear, and human.
- Do not sound corporate, motivational, generic, poetic, or therapist-like.
- Do not optimise for inspiration. Optimise for accuracy, steadiness, and usefulness.

Hard rules:
- Every response must refer to at least one concrete fact from the provided context.
- If trend data exists, use it carefully and plainly.
- If data is missing, say less. Do not invent patterns.
- Do not use vague comfort phrases.
- Do not repeat the same idea in reflection, observations, and suggestions.
- Suggestions must be specific and low-friction.
- Each suggestion must be realistic for the stated time horizon.
- Avoid filler encouragement.
- Avoid therapy jargon.
- Do not diagnose.

Style rules:
- Use plain English.
- Keep the reflection concise.
- Observations should sound like honest noticing, not analytics output.
- Suggestions should feel practical, not wellness-template advice.
- If the user sounds low-capacity, reduce demands immediately.
- If the user sounds emotionally tired, prioritise recovery and simplification.
- If the user sounds steady or strong, help protect energy and avoid overextension.

Safety:
- If the user appears at risk of self-harm or harm to others, advise immediate support from local emergency or crisis services.

Return valid JSON only.
`.trim();
}

function buildUserPrompt(context) {
  return `
Use this Momentum OS context.

Context:
${JSON.stringify(context, null, 2)}

Instructions:
- Start from what is actually present in the context.
- Ground the response in the user's wording, scores, and trends.
- If scores and words point in different directions, acknowledge that tension simply.
- Favour directness over warmth.
- Never give three versions of the same suggestion.
- Avoid generic advice unless the context strongly supports it.
- Keep observations specific and short.
- The closing question should help the user clarify the next step.

Return JSON with exactly this shape:
{
  "reflection": "string",
  "observations": ["string", "string"],
  "supportStyle": "grounding | simplify | steady | protect-energy",
  "suggestions": [
    {
      "action": "string",
      "why": "string",
      "timeScope": "next-hour | today | this-evening"
    },
    {
      "action": "string",
      "why": "string",
      "timeScope": "next-hour | today | this-evening"
    },
    {
      "action": "string",
      "why": "string",
      "timeScope": "next-hour | today | this-evening"
    }
  ],
  "reframe": "string",
  "closingQuestion": "string"
}
`.trim();
}

function buildEvidenceLines(context) {
  const lines = [];

  if (Number.isFinite(context.overallScore)) {
    lines.push(`Overall score is ${context.overallScore}.`);
  }
  if (Number.isFinite(context.capacity)) {
    lines.push(`Capacity is ${context.capacity}.`);
  }
  if (context.recentOverallTrend !== "unknown") {
    lines.push(`Recent overall trend is ${context.recentOverallTrend}.`);
  }
  if (context.recentHealthTrend !== "unknown") {
    lines.push(`Recent health trend is ${context.recentHealthTrend}.`);
  }
  if (context.recentPersonalTrend !== "unknown") {
    lines.push(`Recent personal trend is ${context.recentPersonalTrend}.`);
  }
  if (context.reflection) {
    lines.push(`User reflection says: "${context.reflection}".`);
  }
  if (context.freeText) {
    lines.push(`User free text says: "${context.freeText}".`);
  }
  if (context.recentJournalThemes.length) {
    lines.push(`Recent journal themes: ${context.recentJournalThemes.join(", ")}.`);
  }

  return lines;
}

function fallbackGuide(context, fallbackStyle) {
  const evidence = buildEvidenceLines(context);
  const hasLowCapacity = Number.isFinite(context.capacity) && context.capacity < 45;
  const hasLowHealth = Number.isFinite(context.healthScore) && context.healthScore < 45;

  if (context.emotionalState === "overwhelmed") {
    return {
      reflection: evidence[0]
        ? `From your input, the pressure looks high right now.`
        : `This looks like a high-pressure moment.`,
      observations: [
        evidence[0] || "Your wording suggests strain is the main issue.",
        evidence[1] || "Pushing harder is unlikely to help right now.",
      ],
      supportStyle: fallbackStyle,
      suggestions: [
        {
          action: "Drop one non-essential task for the next hour.",
          why: "Reducing load is more useful than forcing focus when pressure is high.",
          timeScope: "next-hour",
        },
        {
          action: "Put your phone away and sit somewhere quieter for 10 minutes.",
          why: "Lowering stimulation can reduce the sense of mental crowding.",
          timeScope: "next-hour",
        },
        {
          action: "Pick one task that would make today feel more under control if it were finished.",
          why: "A single useful win is better than trying to recover the whole day.",
          timeScope: "today",
        },
      ],
      reframe: "You do not need to solve the whole day at once.",
      closingQuestion: "What is creating the most pressure right now?",
    };
  }

  if (context.emotionalState === "emotionally tired" || hasLowCapacity || hasLowHealth) {
    return {
      reflection: Number.isFinite(context.capacity)
        ? `Your input points to lower energy or capacity than usual.`
        : `This sounds more like low fuel than lack of effort.`,
      observations: [
        Number.isFinite(context.capacity)
          ? `Capacity is sitting at ${context.capacity}, so a lighter approach makes more sense.`
          : "Your wording points to tiredness more than avoidance.",
        context.recentHealthTrend === "falling"
          ? "Your recent health trend is falling, which fits with feeling flat."
          : "More pressure is unlikely to improve the next hour.",
      ],
      supportStyle: fallbackStyle,
      suggestions: [
        {
          action: "Cut the next hour down to one useful task only.",
          why: "A smaller target fits better when energy is low.",
          timeScope: "next-hour",
        },
        {
          action: "Do one reset before working again: food, water, or a short walk.",
          why: "A physical reset is often more effective than trying to think your way back into energy.",
          timeScope: "next-hour",
        },
        {
          action: "Make the rest of today optional apart from one task that matters.",
          why: "That protects momentum without pretending you have full capacity.",
          timeScope: "today",
        },
      ],
      reframe: "Low energy changes the right strategy; it does not mean the day is broken.",
      closingQuestion: "What would make the next hour easier to handle?",
    };
  }

  return {
    reflection: "The picture looks mixed rather than extreme.",
    observations: [
      evidence[0] || "The signal here is not all one thing.",
      evidence[1] || "A smaller, clearer next step will probably help more than a bigger plan.",
    ],
    supportStyle: fallbackStyle,
    suggestions: [
      {
        action: "Choose one meaningful task and define what done looks like.",
        why: "A clear finish line makes it easier to start.",
        timeScope: "today",
      },
      {
        action: "Remove one distraction before you begin.",
        why: "Lower friction usually matters more than more motivation.",
        timeScope: "next-hour",
      },
      {
        action: "Write one sentence tonight about what helped and what drained you.",
        why: "That gives you a better signal for tomorrow.",
        timeScope: "this-evening",
      },
    ],
    reframe: "You may not need a reset. You may just need a narrower next step.",
    closingQuestion: "What is the most useful next step from here?",
  };
}

function normaliseSuggestion(item, fallbackTimeScope = "today") {
  return {
    action: toCleanString(item?.action),
    why: toCleanString(item?.why),
    timeScope: ALLOWED_TIME_SCOPES.includes(item?.timeScope)
      ? item.timeScope
      : fallbackTimeScope,
  };
}

function isMeaningfulSuggestion(item) {
  return item.action.length >= 12 && item.why.length >= 12;
}

function containsGenericLanguage(value) {
  const text = JSON.stringify(value).toLowerCase();
  return GENERIC_PHRASES.some((phrase) => text.includes(phrase));
}

function normaliseGuide(parsed, fallbackStyle, context) {
  const fallback = fallbackGuide(context, fallbackStyle);

  const observations = Array.isArray(parsed?.observations)
    ? parsed.observations.map((item) => toCleanString(item)).filter(Boolean).slice(0, 2)
    : [];

  while (observations.length < 2) {
    observations.push(fallback.observations[observations.length]);
  }

  const suggestions = Array.isArray(parsed?.suggestions)
    ? parsed.suggestions
        .map((item) => normaliseSuggestion(item, context.timeHorizon))
        .filter(isMeaningfulSuggestion)
        .slice(0, 3)
    : [];

  if (
    suggestions.length < 3 ||
    containsGenericLanguage(parsed) ||
    !toCleanString(parsed?.reflection)
  ) {
    return fallback;
  }

  return {
    reflection: toCleanString(parsed.reflection),
    observations,
    supportStyle: ALLOWED_SUPPORT_STYLES.includes(parsed?.supportStyle)
      ? parsed.supportStyle
      : fallbackStyle,
    suggestions,
    reframe: toCleanString(parsed?.reframe) || fallback.reframe,
    closingQuestion: toCleanString(parsed?.closingQuestion) || fallback.closingQuestion,
  };
}

function safeParseGuide(text, fallbackStyle, context) {
  try {
    const parsed = JSON.parse(text);

    if (
      parsed &&
      typeof parsed.reflection === "string" &&
      Array.isArray(parsed.observations) &&
      Array.isArray(parsed.suggestions)
    ) {
      return normaliseGuide(parsed, fallbackStyle, context);
    }
  } catch {}

  return fallbackGuide(context, fallbackStyle);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
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
    const context = buildContext(body);

    if (!context.hasUsableData) {
      return res.status(400).json({
        ok: false,
        error: "Insufficient context",
        detail: "Provide at least one score, trend, reflection, prompt, or journal signal.",
      });
    }

    const fallbackStyle = supportStyleForLabel(context.overallLabel);

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: buildSystemPrompt(),
        },
        {
          role: "user",
          content: buildUserPrompt(context),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "momentum_reflection_guide_v3",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              reflection: { type: "string" },
              observations: {
                type: "array",
                items: { type: "string" },
                minItems: 2,
                maxItems: 2,
              },
              supportStyle: {
                type: "string",
                enum: ALLOWED_SUPPORT_STYLES,
              },
              suggestions: {
                type: "array",
                minItems: 3,
                maxItems: 3,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    action: { type: "string" },
                    why: { type: "string" },
                    timeScope: {
                      type: "string",
                      enum: ALLOWED_TIME_SCOPES,
                    },
                  },
                  required: ["action", "why", "timeScope"],
                },
              },
              reframe: { type: "string" },
              closingQuestion: { type: "string" },
            },
            required: [
              "reflection",
              "observations",
              "supportStyle",
              "suggestions",
              "reframe",
              "closingQuestion",
            ],
          },
        },
      },
      temperature: 0.45,
      max_output_tokens: 450,
    });

    const output = response.output_text || "";
    const guide = safeParseGuide(output, fallbackStyle, context);

    return res.status(200).json({
      ok: true,
      guide,
      meta: {
        label: context.overallLabel,
        emotionalState: context.emotionalState,
        supportStyle: guide.supportStyle,
        trends: {
          overall: context.recentOverallTrend,
          health: context.recentHealthTrend,
          personal: context.recentPersonalTrend,
          capacity: context.recentCapacityTrend,
        },
        hasUsableData: context.hasUsableData,
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Reflection guide request failed",
      detail: error?.message || "Unknown error",
    });
  }
}
