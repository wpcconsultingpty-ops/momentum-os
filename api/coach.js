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

const ALLOWED_SUGGESTION_TYPES = [
  "regulate",
  "reduce",
  "reconnect",
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
  return String(value).trim();
}

function toCleanArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => toCleanString(item)).filter(Boolean);
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
  const text = `${context.reflection} ${context.freeText}`.toLowerCase();

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
    text.includes("exhausted")
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

function buildSystemPrompt() {
  return `You are the Reflection Guide for Momentum OS.

Purpose:
- Help the user slow down, understand what they are feeling, and reconnect with themselves.
- The goal is not to optimise the user.
- The goal is to help them feel more grounded, clearer, and less alone in what they are carrying.

Core role:
- Respond like a calm, emotionally intelligent counsellor having a real conversation.
- Listen for the emotional reality underneath the words.
- Help the user feel understood before offering direction.
- Reduce overwhelm, shame, pressure, and emotional noise.
- Encourage reflection, steadiness, and gentle next steps.

Voice:
- Warm, calm, grounded, thoughtful, and human.
- Emotionally attuned without sounding clinical.
- Never robotic, motivational, corporate, or overly therapeutic.
- Use soft, natural language.
- Use short paragraphs and conversational pacing.
- Sound like someone emotionally safe to talk to.
- When asking questions, ask the way a real person would in a quiet conversation — not like a chatbot presenting options. Ask one thing at a time. Let the question breathe. Never list choices or use labels like 'settling vs simplifying'. Just ask what you genuinely want to know about how they are doing.

Response approach:
- Start with the person's felt experience, not the metric.
- Use concrete context from the input to support the reflection.
- Mention at least one specific signal from the provided context such as low capacity, a recent trend, a trigger, or a short phrase from reflection/freeText.
- Do not lead with score language unless it clearly helps.
- Translate score patterns into lived experience.
- If capacity is low, reduce expectations immediately.
- If health is low, lean toward rest, hydration, food, movement, or reduced stimulation.
- If personal score is low, lean toward honesty, boundaries, connection, or self-kindness.
- If the user sounds overwhelmed, make suggestions smaller and simpler.
- Keep each suggestion realistic for the next hour unless the user explicitly asks for a bigger plan.
- Do not repeat the same idea three different ways.
- Avoid vague filler or polished generic empathy.
- Do not diagnose or pathologise.

Boundaries:
- You are not a therapist, psychiatrist, doctor, or crisis service.
- If the user appears at risk of self-harm or harm to others, advise immediate support from local emergency or crisis services.

Output rules:
- Return valid JSON only.
- reflection should sound human and emotionally aware.
- observedPattern must point to something specific in the context.
- whyThisFitsNow must explain why the suggestions fit this moment.
- gentleSuggestions must contain exactly 3 distinct suggestions.
- gentleSuggestions should use these categories in this order: regulate, reduce, reconnect.
- regulate should help the nervous system settle.
- reduce should lower pressure or remove friction.
- reconnect should help the person reconnect with self, body, values, or environment.
- The closing question should invite reflection naturally, without sounding scripted.`;
}

function buildUserPrompt(context) {
  return `Use this Momentum OS state to support the user.

Context:
${JSON.stringify(context, null, 2)}

Interpretation rules:
- vulnerable: reduce overwhelm and focus on emotional steadiness.
- mixed: simplify expectations and reconnect with what matters most.
- steady: support balance, consistency, and gentle progress.
- strong: protect energy and avoid emotional overextension.
- The response must sound grounded in the actual context, not like a generic wellness script.
- Start by reflecting emotional reality in plain human language.
- Mention at least one concrete input from context in reflection or observedPattern.
- If recentTrends exist, use them when relevant.
- If recentReflections exist, you may quote a very short phrase only when useful.
- Keep suggestions specific and doable.
- Suggestions should feel invitational, not commanding.

Return JSON with exactly these fields:
{
  "reflection": "string",
  "observedPattern": "string",
  "supportStyle": "grounding | simplify | steady | protect-energy",
  "gentleSuggestions": [
    { "type": "regulate", "suggestion": "string" },
    { "type": "reduce", "suggestion": "string" },
    { "type": "reconnect", "suggestion": "string" }
  ],
  "whyThisFitsNow": "string",
  "reframe": "string",
  "encouragement": "string",
  "closingQuestion": "string"
}`;
}

function buildObservedPattern(context) {
  const bits = [];

  if (Number.isFinite(context.capacity) && context.capacity <= 4) {
    bits.push(`your capacity looks low at ${context.capacity}/10`);
  }

  if (Number.isFinite(context.healthScore) && context.healthScore < 55) {
    bits.push(`your health score is sitting on the lower side at ${context.healthScore}`);
  }

  if (Number.isFinite(context.personalScore) && context.personalScore < 55) {
    bits.push(`your personal score is also under strain at ${context.personalScore}`);
  }

  if (context.bleed && context.bleed !== "none identified") {
    bits.push(`today's pressure seems linked to ${context.bleed}`);
  }

  if (context.recentReflections?.length) {
    bits.push(`your recent notes carry a similar tone`);
  }

  return bits.length
    ? `A pattern I notice is that ${bits.slice(0, 2).join(", ")}.`
    : "A pattern I notice is that this seems like a moment for steadiness rather than more pressure.";
}

function buildWhyThisFitsNow(context) {
  if (Number.isFinite(context.capacity) && context.capacity <= 4) {
    return "These suggestions stay small because your capacity looks limited right now, so the aim is to settle and reduce pressure rather than push harder.";
  }

  if (context.emotionalState === "overwhelmed") {
    return "These suggestions focus on reducing noise first because overwhelmed moments usually respond better to less input, not more effort.";
  }

  if (
    Number.isFinite(context.healthScore) &&
    context.healthScore < 55 &&
    Number.isFinite(context.personalScore) &&
    context.personalScore < 55
  ) {
    return "These suggestions focus on steadiness because both your body and your emotional world seem to be asking for a little less pressure right now.";
  }

  return "These suggestions focus on steadiness first so you can respond to the moment you are actually in, not the one you wish you had.";
}

function fallbackGuide(context, fallbackStyle) {
  const lowCapacity = Number.isFinite(context.capacity) && context.capacity <= 4;

  return {
    reflection: lowCapacity
      ? `It makes sense if things feel harder to carry right now. Your energy for coping looks limited${Number.isFinite(context.capacity) ? ` at about ${context.capacity}/10` : ""}, so this may be a moment to scale things down rather than demand more from yourself.`
      : "It sounds like part of you wants clarity, while another part may need a little more room to breathe first.",
    observedPattern: buildObservedPattern(context),
    supportStyle: fallbackStyle,
    gentleSuggestions: [
      {
        type: "regulate",
        suggestion: "If you can, just step away from the screen for a couple of minutes. One slow breath out is enough to start.",
      },
      {
        type: "reduce",
        suggestion: "You probably don't need to do everything on your list right now. Pick the one thing that actually matters for the next hour and let the rest sit.",
      },
      {
        type: "reconnect",
        suggestion: "Before you push through anything else, just check in with yourself — are you thirsty, hungry, tired, or do you just need a few minutes of quiet?",
      },
    ],
    whyThisFitsNow: buildWhyThisFitsNow(context),
    reframe: "Looking after yourself doesn't need a perfect plan. Even small things count when you're running low.",
    encouragement: "Taking a smaller step doesn't mean you're falling behind. It means you're being honest about where you are.",
    closingQuestion: "If you could take one small thing off your plate right now, what would it be?",
  };
}

function normaliseGuide(parsed, fallbackStyle, context) {
  const provided = Array.isArray(parsed?.gentleSuggestions)
    ? parsed.gentleSuggestions
        .map((item) => ({
          type: toCleanString(item?.type),
          suggestion: toCleanString(item?.suggestion),
        }))
        .filter(
          (item) =>
            ALLOWED_SUGGESTION_TYPES.includes(item.type) && item.suggestion
        )
    : [];

  const byType = new Map(provided.map((item) => [item.type, item.suggestion]));

  const fallbackSuggestions = {
    regulate:
      "Try a couple of slower breaths and let your shoulders drop. You don't need to have it all figured out before you let yourself settle a bit.",
    reduce:
      "It's okay to lower the bar for the next little while. What's the one thing that actually needs doing? Everything else can wait.",
    reconnect:
      "Just pause for a second and notice what you actually need right now. Sometimes it's as simple as a glass of water or five minutes outside.",
  };

  const gentleSuggestions = ALLOWED_SUGGESTION_TYPES.map((type) => ({
    type,
    suggestion: byType.get(type) || fallbackSuggestions[type],
  }));

  return {
    reflection:
      toCleanString(parsed?.reflection) ||
      "It sounds like this moment needs gentleness more than pressure.",
    observedPattern:
      toCleanString(parsed?.observedPattern) || buildObservedPattern(context),
    supportStyle:
      parsed?.supportStyle &&
      ALLOWED_SUPPORT_STYLES.includes(parsed.supportStyle)
        ? parsed.supportStyle
        : fallbackStyle,
    gentleSuggestions,
    whyThisFitsNow:
      toCleanString(parsed?.whyThisFitsNow) || buildWhyThisFitsNow(context),
    reframe:
      toCleanString(parsed?.reframe) ||
      "You don't have to figure out the whole day. Just the next bit.",
    encouragement:
      toCleanString(parsed?.encouragement) ||
      "You're doing better than you think. Even just checking in like this counts for something.",
    closingQuestion:
      toCleanString(parsed?.closingQuestion) ||
      "What does the next hour actually need to look like for you?",
  };
}

function safeParseGuide(text, fallbackStyle, context) {
  try {
    const parsed = JSON.parse(text);

    if (
      parsed &&
      typeof parsed.reflection === "string" &&
      typeof parsed.observedPattern === "string" &&
      Array.isArray(parsed.gentleSuggestions) &&
      parsed.gentleSuggestions.length === 3
    ) {
      return normaliseGuide(parsed, fallbackStyle, context);
    }
  } catch {}

  return fallbackGuide(context, fallbackStyle);
}

function buildContext(body) {
  const overallScore = clamp(toNumber(body.overallScore));
  const overallLabel = deriveStateLabel(overallScore);

  const context = {
    overallScore,
    overallLabel,
    healthScore: clamp(toNumber(body.healthScore)),
    personalScore: clamp(toNumber(body.personalScore)),
    capacity: clamp(toNumber(body.capacity), 0, 10),
    bleed: toCleanString(body.bleed),
    target: toCleanString(body.target),
    focus: toCleanString(body.focus),
    reflection: toCleanString(body.reflection),
    freeText: toCleanString(body.freeText || body.prompt),
    timeHorizon: toCleanString(body.timeHorizon, "next hour"),
    view: toCleanString(body.view, "reflection"),
    recentTrends:
      body.recentTrends && typeof body.recentTrends === "object"
        ? body.recentTrends
        : {},
    recentReflections: toCleanArray(body.recentReflections).slice(0, 3),
    recentTriggers: toCleanArray(body.recentTriggers).slice(0, 5),
  };

  return {
    ...context,
    emotionalState: inferEmotionalState(context),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
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
              observedPattern: {
                type: "string",
              },
              supportStyle: {
                type: "string",
                enum: ALLOWED_SUPPORT_STYLES,
              },
              gentleSuggestions: {
                type: "array",
                minItems: 3,
                maxItems: 3,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    type: {
                      type: "string",
                      enum: ALLOWED_SUGGESTION_TYPES,
                    },
                    suggestion: {
                      type: "string",
                    },
                  },
                  required: ["type", "suggestion"],
                },
              },
              whyThisFitsNow: {
                type: "string",
              },
              reframe: {
                type: "string",
              },
              encouragement: {
                type: "string",
              },
              closingQuestion: {
                type: "string",
              },
            },
            required: [
              "reflection",
              "observedPattern",
              "supportStyle",
              "gentleSuggestions",
              "whyThisFitsNow",
              "reframe",
              "encouragement",
              "closingQuestion",
            ],
          },
        },
      },
      temperature: 0.7,
      max_output_tokens: 700,
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
