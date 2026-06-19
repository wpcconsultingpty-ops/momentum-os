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

function describeTrend(series) {
  if (!Array.isArray(series) || series.length < 2) return "not enough data";
  const nums = series.map((v) => toNumber(v)).filter((v) => v !== null);
  if (nums.length < 2) return "not enough data";
  const first = nums[0];
  const last = nums[nums.length - 1];
  const delta = last - first;
  if (Math.abs(delta) < 3) return "holding steady";
  return delta > 0 ? `rising (+${Math.round(delta)})` : `falling (${Math.round(delta)})`;
}

function summariseTrends(recentTrends) {
  if (!recentTrends || typeof recentTrends !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(recentTrends)) {
    out[key] = Array.isArray(value) ? describeTrend(value) : toCleanString(value);
  }
  return out;
}

function countTriggers(triggers) {
  const counts = {};
  for (const t of triggers) {
    const key = t.toLowerCase();
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});
}

function capacityBand(capacity) {
  if (!Number.isFinite(capacity)) return "unknown";
  if (capacity <= 3) return "very low";
  if (capacity <= 6) return "limited";
  return "good";
}

function buildContext(body) {
  const overallScore = clamp(toNumber(body.overallScore));
  const weeklyAverage = clamp(toNumber(body.weeklyAverage));
  const scoreDelta =
    Number.isFinite(overallScore) && Number.isFinite(weeklyAverage)
      ? Math.round(overallScore - weeklyAverage)
      : null;
  const capacity = clamp(toNumber(body.capacity), 0, 10);
  const recentTriggers = toCleanArray(body.recentTriggers).slice(0, 12);
  const context = {
    overallScore,
    weeklyAverage,
    scoreDelta,
    healthScore: clamp(toNumber(body.healthScore)),
    personalScore: clamp(toNumber(body.personalScore)),
    capacity,
    capacityBand: capacityBand(capacity),
    bleed: toCleanString(body.bleed),
    target: toCleanString(body.target),
    focus: toCleanString(body.focus),
    reflection: toCleanString(body.reflection),
    freeText: toCleanString(body.freeText || body.prompt),
    trends: summariseTrends(body.recentTrends),
    recentReflections: toCleanArray(body.recentReflections).slice(0, 3),
    triggerFrequency: countTriggers(recentTriggers),
    previousCoachMessage: toCleanString(body.previousCoachMessage),
    previousUserReply: toCleanString(body.previousUserReply),
  };
  context.mood = readMood(context);
  return context;
}

function buildSystemPrompt() {
  return `You are a warm, emotionally intelligent companion inside a personal momentum app. You are not a therapist, not a life coach, not a motivational speaker. You are more like a thoughtful friend who listens well, remembers what matters, and says the right thing at the right time.

SAFETY (highest priority, overrides everything below): If the person shows any sign of being at risk of self-harm, suicide, or being in crisis, gently and directly encourage them to reach out to crisis support right now. In Australia, mention Lifeline on 13 11 14 or 000 for emergencies. Do not give any other advice in that case.

How you think before you speak (do this silently, never show it):
- Identify the single biggest lever for this person right now, given their scores, trends, capacity, stated focus and target, and what they wrote.
- Pick ONE thing worth addressing. Do not try to fix everything.
- Calibrate to their capacityBand: "very low" means only permission to rest or one tiny recovery step; "limited" means one small concrete step; "good" means one step that builds real momentum.

How you speak:
- Short paragraphs, natural pacing, like a real person talking.
- Never use labels, headers, bullet points, or numbered lists.
- Never say things like "Here are some suggestions" or "I notice a pattern".
- Weave any observations or ideas naturally into the conversation.
- Ask only one question, at the very end, and make it feel like something a real person would ask in a quiet moment together.
- Keep your entire response under 150 words.

What you do:
- Open by reflecting back what they seem to be experiencing, grounded in a SPECIFIC detail they shared (their focus, target, a recurring trigger, or a real change in their numbers). Generic openings are not allowed.
- Your suggestion must reference at least one concrete detail from their context. Never give advice that could apply to anyone.
- If their scoreDelta is clearly negative or a trend is falling, acknowledge that honestly without alarm.
- If there is a previousCoachMessage and previousUserReply, treat this as a continuing conversation and follow up on it naturally.
- Offer one practical, specific thing they could do in the next hour, woven into the conversation, not listed.
- End with a single genuine question that invites reflection.

What you never do:
- Never diagnose, pathologise, or use clinical language.
- Never sound robotic, corporate, or like a chatbot.
- Never repeat the same idea multiple ways.
- Never use filler phrases or generic empathy.

Example of the quality bar (do not copy it, match its specificity):
Input shows capacityBand "very low", focus "finish the proposal", trigger frequency dominated by "poor sleep".
Good message: "The proposal is clearly weighing on you, and running on this little sleep, pushing through it tonight probably won't get you the version you actually want. It might be kinder to let it sit until the morning and just protect the next hour for rest instead."
Good question: "What would actually help you wind down tonight?"

Return valid JSON with exactly these fields:
{
  "message": "your full conversational response, reflection and one grounded suggestion woven together naturally",
  "question": "your single closing question",
  "mood": "one word: overwhelmed, depleted, anxious, disconnected, self-critical, steady, or mixed"
}`;
}

function buildUserPrompt(context) {
  return `Here is the person's current state:\n${JSON.stringify(context, null, 2)}\n\nRespond as described. Choose one lever, ground it in their specific data, and return only valid JSON with message, question, and mood fields.`;
}

function detectCrisis(context) {
  const text = `${context.reflection} ${context.freeText}`.toLowerCase();
  return /suicid|kill myself|end my life|don'?t want to be here|hurt myself|self.?harm|no reason to live|better off dead/.test(
    text
  );
}

function crisisResponse(context) {
  return {
    message:
      "I'm really glad you said something, and I want to be honest with you: what you're carrying sounds like more than you should have to hold on your own right now. Please reach out to someone who can be with you in this. In Australia you can call Lifeline on 13 11 14 any time, or 000 if you're in immediate danger. You don't have to get through this hour alone.",
    question: "Is there someone you trust who you could reach out to right now?",
    mood: context.mood || "overwhelmed",
  };
}

function fallbackResponse(context) {
  const detail =
    context.focus || context.target || context.bleed || "what's on your plate";
  const low = context.capacityBand === "very low";
  return {
    message: low
      ? `It sounds like things are sitting heavy around ${detail} right now, and with your capacity this low, this probably isn't the moment to push harder. Sometimes the most useful thing is to let yourself take a smaller step than usual: a glass of water, a few minutes away from the screen, or just acknowledging that today is a hard one.`
      : `There seems to be a lot moving around ${detail} for you right now. Before anything else, it might help to pause and notice what you actually need, not what you think you should be doing, but what would genuinely help in the next hour.`,
    question: low
      ? "What is one thing you could take off your plate for the rest of today?"
      : "What does the next hour actually need to look like for you?",
    mood: context.mood || "mixed",
  };
}

function enforceLength(text, maxWords = 170) {
  const words = toCleanString(text).split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ").replace(/[,;:\s]+$/, "") + ".";
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

    if (detectCrisis(context)) {
      const guide = crisisResponse(context);
      return res.status(200).json({
        ok: true,
        guide: {
          reflection: guide.message,
          closingQuestion: guide.question,
          mood: guide.mood,
        },
      });
    }

    const response = await client.responses.create({
      model: "gpt-4.1",
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
      temperature: 0.7,
      max_output_tokens: 600,
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
        reflection: enforceLength(guide.message),
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
