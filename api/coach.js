import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
- Help people slow down, understand what they are feeling, and reconnect with themselves.
- The goal is not to optimise the user.
- The goal is to help them feel more grounded, clearer, and less alone in what they are carrying.

Core role:
- Listen carefully to the emotional tone underneath the words.
- Respond like a calm, emotionally intelligent counsellor having a real conversation.
- Help the user feel understood before offering direction.
- Reduce overwhelm, pressure, shame, and emotional noise.
- Encourage reflection, self-awareness, steadiness, and gentle forward movement.

Voice:
- Warm, calm, grounded, thoughtful, and human.
- Emotionally attuned without sounding clinical.
- Never robotic, motivational, corporate, or overly therapeutic.
- Use soft, natural language.
- Use short paragraphs and conversational pacing.
- Sound like someone emotionally safe to talk to.

Conversation style:
- Begin by acknowledging the emotional reality of the moment.
- Reflect the emotional tension underneath what the user shared.
- Prioritise understanding before advice.
- Avoid sounding like an assessment tool or productivity system.
- Avoid excessive positivity.
- Leave room for uncertainty and mixed emotions.

Behaviour:
- Focus first on emotional steadiness and clarity.
- If the user sounds overwhelmed, reduce pressure immediately.
- If the user sounds emotionally tired, encourage rest and gentleness.
- If the user sounds disconnected, encourage reconnection with self or environment.
- If the user sounds emotionally stuck, help them explore instead of pushing them.
- Offer exactly 3 gentle suggestions.
- Suggestions should feel emotionally manageable and supportive.
- Encourage self-compassion without using therapy jargon.

Boundaries:
- You are not a therapist, psychiatrist, doctor, or crisis service.
- Do not diagnose.
- Do not pathologise emotions.
- Do not shame or moralise.
- If the user appears at risk of self-harm or harm to others, advise immediate support from local emergency or crisis services.

Output rules:
- Return valid JSON only.
- reflection should feel emotionally aware and conversational.
- gentleSuggestions should feel supportive and realistic.
- reframe should reduce emotional pressure.
- encouragement should feel grounded and believable.
- closingQuestion should invite reflection naturally.`;
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
- low health score: lean toward rest, hydration, nourishment, movement, and reduced stimulation.
- low personal score: lean toward emotional honesty, boundaries, connection, or self-kindness.
- low capacity: reduce expectations immediately.
- if reflection is present, explore it gently.
- if freeText contains emotional weight, acknowledge the feeling before offering suggestions.
- favour steadiness over productivity.
- avoid sounding like a performance coach.

Return JSON with exactly these fields:
{
  "reflection": "string",
  "supportStyle": "grounding | simplify | steady | protect-energy",
  "gentleSuggestions": ["string", "string", "string"],
  "reframe": "string",
  "encouragement": "string",
  "closingQuestion": "string"
}`;
}

function normaliseGuide(parsed, fallbackStyle) {
  const gentleSuggestions = Array.isArray(parsed?.gentleSuggestions)
    ? parsed.gentleSuggestions
        .map((item) => toCleanString(item))
        .filter(Boolean)
        .slice(0, 3)
    : [];

  while (gentleSuggestions.length < 3) {
    gentleSuggestions.push(
      "Choose one gentle thing that would help you feel a little more settled."
    );
  }

  return {
    reflection:
      toCleanString(parsed?.reflection) ||
      "It sounds like there is quite a lot sitting on your shoulders right now. This may be a moment for softness rather than pressure.",

    supportStyle:
      parsed?.supportStyle &&
      ["grounding", "simplify", "steady", "protect-energy"].includes(
        parsed.supportStyle
      )
        ? parsed.supportStyle
        : fallbackStyle,

    gentleSuggestions,

    reframe:
      toCleanString(parsed?.reframe) ||
      "You do not need to solve the whole day right now.",

    encouragement:
      toCleanString(parsed?.encouragement) ||
      "A quieter, gentler hour can still move things forward.",

    closingQuestion:
      toCleanString(parsed?.closingQuestion) ||
      "What feels like the kindest thing you could do for yourself right now?",
  };
}

function fallbackGuide(context, fallbackStyle) {
  const emotionalState = inferEmotionalState(context);

  if (emotionalState === "overwhelmed") {
    return {
      reflection:
        "It sounds like things may be feeling mentally crowded and emotionally heavy right now. This probably is not the moment to ask more of yourself.",

      supportStyle: fallbackStyle,

      gentleSuggestions: [
        "Step away from anything loud or demanding for a few minutes.",
        "Drink some water and take a few slower breaths without trying to fix everything.",
        "Choose one small thing that would make the next hour feel slightly lighter."
      ],

      reframe:
        "You do not need to carry the whole day at once.",

      encouragement:
        "Slowing things down a little can be a healthy response, not a failure.",

      closingQuestion:
        "What feels emotionally heaviest right now?"
    };
  }

  if (emotionalState === "emotionally tired") {
    return {
      reflection:
        "You sound emotionally tired more than unmotivated. Sometimes the nervous system needs gentleness before it can re-engage.",

      supportStyle: fallbackStyle,

      gentleSuggestions: [
        "Choose something calming for the next 10 minutes, even if it is very small.",
        "Eat, hydrate, or rest before expecting too much from yourself.",
        "Lower the expectations for this hour and focus only on what truly matters."
      ],

      reframe:
        "Rest and steadiness are productive in their own way.",

      encouragement:
        "You are allowed to move more gently today.",

      closingQuestion:
        "What would help you feel even slightly more settled?"
    };
  }

  return {
    reflection:
      "It sounds like part of you wants clarity, while another part may just need a little breathing room first.",

    supportStyle: fallbackStyle,

    gentleSuggestions: [
      "Choose one gentle thing that would help you feel more grounded.",
      "Create a little distance from anything that feels noisy or draining.",
      "Focus on one manageable thing instead of the whole day."
    ],

    reframe:
      "You do not have to figure everything out right now.",

    encouragement:
      "Small moments of steadiness still matter.",

    closingQuestion:
      "What do you think you need most right now?"
  };
}

function safeParseGuide(text, fallbackStyle, context) {
  try {
    const parsed = JSON.parse(text);

    if (
      parsed &&
      typeof parsed.reflection === "string" &&
      Array.isArray(parsed.gentleSuggestions) &&
      parsed.gentleSuggestions.length === 3
    ) {
      return normaliseGuide(parsed, fallbackStyle);
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
    capacity: clamp(toNumber(body.capacity)),

    bleed: toCleanString(body.bleed),
    target: toCleanString(body.target),

    focus: toCleanString(body.focus),
    reflection: toCleanString(body.reflection),
    freeText: toCleanString(body.freeText || body.prompt),

    timeHorizon: toCleanString(body.timeHorizon, "next hour"),
    view: toCleanString(body.view, "reflection"),
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
          name: "momentum_reflection_guide",

          schema: {
            type: "object",
            additionalProperties: false,

            properties: {
              reflection: {
                type: "string",
              },

              supportStyle: {
                type: "string",
                enum: [
                  "grounding",
                  "simplify",
                  "steady",
                  "protect-energy"
                ],
              },

              gentleSuggestions: {
                type: "array",
                items: {
                  type: "string",
                },
                minItems: 3,
                maxItems: 3,
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
              "supportStyle",
              "gentleSuggestions",
              "reframe",
              "encouragement",
              "closingQuestion",
            ],
          },
        },
      },

      temperature: 0.85,
      max_output_tokens: 700,
    });

    const output = response.output_text || "";

    const guide = safeParseGuide(
      output,
      fallbackStyle,
      context
    );

    return res.status(200).json({
      ok: true,
      guide,
      raw: output,

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
