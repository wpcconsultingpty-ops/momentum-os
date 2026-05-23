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
    text.includes("low energy")
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
    text.includes("disconnected")
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

    timeHorizon: toCleanString(body.timeHorizon, "today"),
    view: toCleanString(body.view, "reflection"),
  };

  return {
    ...context,
    emotionalState: inferEmotionalState(context),
  };
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
- Do not use vague comfort phrases like "a lot on your shoulders" unless the user's own words support that.
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
- Avoid generic advice like "hydrate, move, sleep better" unless the context strongly supports it.
- Keep observations specific and short.
- The closing question should help the user clarify the next step, not open a vague emotional spiral.

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

function fallbackGuide(context, fallbackStyle) {
  const emotionalState = context.emotionalState;

  if (emotionalState === "overwhelmed") {
    return {
      reflection:
        "You sound overloaded right now, so this is probably a moment to reduce pressure rather than push harder.",
      observations: [
        "Your words suggest things feel mentally crowded.",
        "This looks more like strain than a motivation problem.",
      ],
      supportStyle: fallbackStyle,
      suggestions: [
        {
          action: "Drop one non-essential task for the next hour.",
          why: "Reducing the load is likely to help more than forcing focus.",
          timeScope: "next-hour",
        },
        {
          action: "Step away from screens or noise for 10 minutes.",
          why: "A short reset can lower the sense of mental crowding.",
          timeScope: "next-hour",
        },
        {
          action: "Choose one task that would make today feel lighter if it were done.",
          why: "One clear win is more useful than trying to recover everything at once.",
          timeScope: "today",
        },
      ],
      reframe:
        "You do not need to carry the whole day at once.",
      closingQuestion:
        "What is the one thing creating the most pressure right now?",
    };
  }

  if (emotionalState === "emotionally tired") {
    return {
      reflection:
        "This sounds more like low emotional fuel than lack of discipline.",
      observations: [
        "Your wording points to tiredness rather than avoidance.",
        "A gentler pace may fit better than more pressure.",
      ],
      supportStyle: fallbackStyle,
      suggestions: [
        {
          action: "Make the next hour lighter by cutting the task list in half.",
          why: "Lowering demand usually works better than pushing through when energy is low.",
          timeScope: "next-hour",
        },
        {
          action: "Do one easy reset before your next task: water, food, or a short walk.",
          why: "A small physical reset can make the next task more manageable.",
          timeScope: "next-hour",
        },
        {
          action: "Pick one useful task for today and let the rest become optional.",
          why: "This protects momentum without pretending you have full capacity.",
          timeScope: "today",
        },
      ],
      reframe:
        "Low energy changes the right strategy; it does not mean you are failing.",
      closingQuestion:
        "What would make the next hour feel easier, not bigger?",
    };
  }

  return {
    reflection:
      "There is probably a mix here: part of you wants clarity, and part of you may need less pressure.",
    observations: [
      "The signal is mixed rather than extreme.",
      "A simpler next step is likely to help more than a bigger plan.",
    ],
    supportStyle: fallbackStyle,
    suggestions: [
      {
        action: "Choose one meaningful task and define a small finish line.",
        why: "A narrow target is easier to trust and complete.",
        timeScope: "today",
      },
      {
        action: "Remove one distraction before you start.",
        why: "Less friction usually matters more than more motivation.",
        timeScope: "next-hour",
      },
      {
        action: "Check back in tonight with one sentence about what helped.",
        why: "That gives you a clearer signal for tomorrow.",
        timeScope: "this-evening",
      },
    ],
    reframe:
      "You do not need a complete reset. You may just need a cleaner next step.",
    closingQuestion:
      "What is the smallest useful step from here?",
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
  return item.action.length >= 8 && item.why.length >= 8;
}

function normaliseGuide(parsed, fallbackStyle, context) {
  const observations = Array.isArray(parsed?.observations)
    ? parsed.observations.map((item) => toCleanString(item)).filter(Boolean).slice(0, 2)
    : [];

  while (observations.length < 2) {
    if (observations.length === 0) {
      observations.push("Your input gives a partial picture, not a full one.");
    } else {
      observations.push("The best next step is probably smaller than the whole problem.");
    }
  }

  let suggestions = Array.isArray(parsed?.suggestions)
    ? parsed.suggestions
        .map((item) => normaliseSuggestion(item, context.timeHorizon === "next hour" ? "next-hour" : "today"))
        .filter(isMeaningfulSuggestion)
        .slice(0, 3)
    : [];

  if (suggestions.length < 3) {
    return fallbackGuide(context, fallbackStyle);
  }

  return {
    reflection:
      toCleanString(parsed?.reflection) ||
      fallbackGuide(context, fallbackStyle).reflection,

    observations,

    supportStyle:
      ALLOWED_SUPPORT_STYLES.includes(parsed?.supportStyle)
        ? parsed.supportStyle
        : fallbackStyle,

    suggestions,

    reframe:
      toCleanString(parsed?.reframe) ||
      "You do not need to solve all of this at once.",

    closingQuestion:
      toCleanString(parsed?.closingQuestion) ||
      "What is the clearest next step from here?",
  };
}

function safeParseGuide(text, fallbackStyle, context) {
  try {
    const parsed = JSON.parse(text);

    if (
      parsed &&
      typeof parsed.reflection === "string" &&
      Array.isArray(parsed.observations) &&
      Array.isArray(parsed.suggestions) &&
      parsed.suggestions.length === 3
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
          name: "momentum_reflection_guide_v2",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              reflection: {
                type: "string",
              },
              observations: {
                type: "array",
                items: {
                  type: "string",
                },
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
                    action: {
                      type: "string",
                    },
                    why: {
                      type: "string",
                    },
                    timeScope: {
                      type: "string",
                      enum: ALLOWED_TIME_SCOPES,
                    },
                  },
                  required: ["action", "why", "timeScope"],
                },
              },
              reframe: {
                type: "string",
              },
              closingQuestion: {
                type: "string",
              },
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
      temperature: 0.6,
      max_output_tokens: 500,
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
