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

function toCleanArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => toCleanString(item)).filter(Boolean);
}

function readMood(context) {
  const text = `${context.reflection} ${context.freeText}`.toLowerCase();
  if (/overwhelm|too much|can'?t cope|burnt out|burning out/.test(text)) return "overwhelmed";
  if (/tired|flat|drained|exhausted|no energy/.test(text)) return "depleted";
  if (/anxious|stressed|worried|panic|racing/.test(text)) return "anxious";
  if (/stuck|lost|disconnected|numb|empty/.test(text)) return "disconnected";
  if (/hard on myself|failure|not enough|worthless|useless/.test(text)) return "self-critical";
  if (/good|great|strong|clear|motivated|hopeful/.test(text)) return "steady";
  return "mixed";
}

function buildContext(body) {
  const overallScore = clamp(toNumber(body.overallScore));
  const context = {
    overallScore,
    healthScore: clamp(toNumber(body.healthScore)),
    personalScore: clamp(toNumber(body.personalScore)),
    capacity: clamp(toNumber(body.capacity), 0, 10),
    bleed: toCleanString(body.bleed),
    target: toCleanString(body.target),
    focus: toCleanString(body.focus),
    reflection: toCleanString(body.reflection),
    freeText: toCleanString(body.freeText || body.prompt),
    recentTrends: body.recentTrends && typeof body.recentTrends === "object" ? body.recentTrends : {},
    recentReflections: toCleanArray(body.recentReflections).slice(0, 3),
    recentTriggers: toCleanArray(body.recentTriggers).slice(0, 5),
  };
  context.mood = readMood(context);
  return context;
}

function buildSystemPrompt() {
  return `You are a warm, emotionally intelligent companion inside a personal momentum app. You are not a therapist, not a life coach, not a motivational speaker. You are more like a thoughtful friend who listens well and says the right thing at the right time.

How you speak:
- Short paragraphs, natural pacing, like a real person talking.
- Never use labels, headers, bullet points, or numbered lists.
- Never say things like "Here are some suggestions" or "I notice a pattern".
- Weave any observations or ideas naturally into the conversation.
- Ask only one question, at the very end, and make it feel like something a real person would ask in a quiet moment together.
- Keep your entire response under 150 words.

What you do:
- Start by reflecting back what the person seems to be experiencing, grounded in the specific context they have shared.
- If their capacity is low or they sound overwhelmed, keep things very small and gentle.
- If they sound steady or strong, support their momentum without adding pressure.
- Offer one or two practical, specific things they could do in the next hour, woven naturally into the conversation, not listed.
- End with a single genuine question that invites them to reflect.

What you never do:
- Never diagnose, pathologise, or use clinical language.
- Never sound robotic, corporate, or like a chatbot.
- Never repeat the same idea multiple ways.
- Never use filler phrases or generic empathy.
- If someone appears at risk of self-harm, gently direct them to local emergency or crisis services.

Return valid JSON with exactly these fields:
{
  "message": "your full conversational response including reflection, observations, and gentle suggestions woven together naturally",
  "question": "your single closing question",
  "mood": "one word: overwhelmed, depleted, anxious, disconnected, self-critical, steady, or mixed"
}`;
}

function buildUserPrompt(context) {
  return `Here is the person's current state:\n${JSON.stringify(context, null, 2)}\n\nRespond as described. Return only valid JSON with message, question, and mood fields.`;
}

function fallbackResponse(context) {
  const low = Number.isFinite(context.capacity) && context.capacity <= 4;
  return {
    message: low
      ? `It sounds like things are sitting heavy right now${Number.isFinite(context.capacity) ? `, and with your capacity around ${context.capacity} out of 10` : ""}, this probably isn't the moment to push harder. Sometimes the most useful thing is just to let yourself take a smaller step than usual. A glass of water, a few minutes away from the screen, or even just acknowledging that today is a hard one can be enough.`
      : "It sounds like there is a lot moving around for you right now. Before anything else, it might help to just pause for a second and notice what you actually need, not what you think you should be doing, but what would genuinely help right now.",
    question: low
      ? "What is one thing you could take off your plate for the rest of today?"
      : "What does the next hour actually need to look like for you?",
    mood: context.mood || "mixed",
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
    const context = buildContext(body);

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(context) },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "coach_response",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              message: { type: "string" },
              question: { type: "string" },
              mood: {
                type: "string",
                enum: ["overwhelmed", "depleted", "anxious", "disconnected", "self-critical", "steady", "mixed"],
              },
            },
            required: ["message", "question", "mood"],
          },
        },
      },
      temperature: 0.8,
      max_output_tokens: 500,
    });

    let guide;
    try {
      const parsed = JSON.parse(response.output_text || "");
      if (parsed && parsed.message && parsed.question) {
        guide = parsed;
      } else {
        guide = fallbackResponse(context);
      }
    } catch {
      guide = fallbackResponse(context);
    }

    return res.status(200).json({
      ok: true,
      guide: {
        reflection: guide.message,
        closingQuestion: guide.question,
        mood: guide.mood || "mixed",
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Coach request failed",
      detail: error?.message || "Unknown error",
    });
  }
}
