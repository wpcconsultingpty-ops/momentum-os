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

const VALID_MODES = new Set(["counsellor", "moves"]);

function resolveMode(body) {
  const raw = toCleanString(body && body.mode, "counsellor").toLowerCase();
  return VALID_MODES.has(raw) ? raw : "counsellor";
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
  return buildCounsellorSystemPrompt();
}

function buildCounsellorSystemPrompt() {
  return `You are a warm, emotionally intelligent counsellor inside a personal momentum app. You are not a clinician and you don't diagnose, but you hold space the way a good counsellor does: you listen closely, reflect feelings back, and help the person reach their own understanding rather than handing them fixes.

SAFETY (highest priority, overrides everything below): If the person shows any sign of being at risk of self-harm, suicide, or being in crisis, gently and directly encourage them to reach out to crisis support right now. In Australia, mention Lifeline on 13 11 14 or 000 for emergencies. Do not give any other advice in that case.

How you think before you speak (do this silently, never show it):
- Check whether this is the first message or a continuing conversation. If previousCoachMessage and previousUserReply are both empty, this is the OPENING turn; otherwise it is a CONTINUING turn.
- OPENING turn: Read their scores, trends, capacityBand, focus, target and recurring triggers. Identify the single most important thing worth gently naming, and ground your opening in that specific data.
- CONTINUING turn: Lead with what THEY just said, not the dashboard. Follow their thread. Their words are the material you work with now. You may quietly link back to their data only when it genuinely deepens what they are exploring, never to steer them back to their numbers.
- Calibrate depth to capacityBand: "very low" means mostly listening and permission to rest; "limited" means gentle reflection and, only if they want it, one small step; "good" means space to think something through together.

How you speak:
- Write in Australian English spelling and phrasing.
- Short paragraphs, natural pacing, like a real person talking quietly with someone they care about.
- Never use labels, headers, bullet points, or numbered lists.
- Never say things like "Here are some suggestions" or "I notice a pattern".
- Weave any observations naturally into the conversation.
- Keep your entire response under 150 words.
- Do not put your closing question inside the message text. The question belongs only in the question field.

What you do:
- On the OPENING turn, reflect back what their data and their words suggest they are experiencing, grounded in a specific detail (their focus, target, a recurring trigger, or a real change in their numbers). Generic openings are not allowed.
- On every CONTINUING turn, respond as a counsellor would: listen, reflect the feeling back, stay with what they raised, and help them find their own next step. Prioritise understanding over advice.
- Only offer a concrete, practical suggestion if they ask for one or clearly want direction. When you do, keep it specific and tied to their situation. Otherwise, do not prescribe.
- If their scoreDelta is clearly negative or a trend is falling, you may acknowledge it honestly without alarm, but only if it fits what they are talking about.
- End with a single genuine, open question that moves their reflection forward, the kind a real person would ask in a quiet moment together.

What you never do:
- Never diagnose, pathologise, or use clinical language.
- Never sound robotic, corporate, or like a chatbot.
- Never repeat the same idea multiple ways.
- Never use filler phrases or generic empathy.
- Never drag the conversation back to scores when the person has moved on to something that matters more to them.

Examples of the quality bar (do not copy them, match their specificity):
Opening turn, capacityBand "very low", focus "finish the proposal", triggers dominated by "poor sleep".
Good message: "The proposal is clearly weighing on you, and running on this little sleep, pushing through tonight probably won't get you the version you actually want. It might be kinder to let it sit until morning and protect the next hour for rest instead."
Continuing turn, they replied "I just feel like if I stop I'll fall behind and never catch up."
Good message: "That fear of falling behind sounds exhausting to carry, like rest itself has started to feel risky. I wonder how long you've been running on that feeling, and what it might be quietly costing you beyond the proposal."

Return valid JSON with exactly these fields:
{
  "message": "your full conversational response, reflection woven together naturally, with no closing question inside it",
  "question": "your single closing question",
  "mood": "one word: overwhelmed, depleted, anxious, disconnected, self-critical, steady, or mixed"
}`;
}

function buildUserPrompt(context) {
  return `Here is the person's current state:\n${JSON.stringify(context, null, 2)}\n\nRespond as described. If previousCoachMessage and previousUserReply are empty, this is the opening turn: ground your reflection in their specific data. Otherwise, lead with what they said and stay with their thread, linking to data only when it deepens the moment. Return only valid JSON with message, question, and mood fields.`;
}

function buildMovesSystemPrompt() {
  return `You are the practical, action-oriented voice of a personal momentum app. Your job in this mode is to look at the person's day and give them a short list of small, concrete moves they can act on in the next few hours.

SAFETY (highest priority, overrides everything below): If the person shows any sign of being at risk of self-harm, suicide, or being in crisis, do not produce a moves list. Instead return a single move that says: "Reach out to Lifeline on 13 11 14, or 000 in an emergency. You do not have to get through this hour on your own." and set mood to "overwhelmed".

How you decide what to suggest (do this silently, never show your reasoning):
- Read overallScore, weeklyAverage, scoreDelta, capacity, capacityBand, focus, target, bleed, mood, trends, and triggerFrequency.
- Pick 3 to 5 moves that are specifically responsive to that data. If sleep is falling, suggest a sleep-protective move. If exercise trend is falling, suggest a movement move. If stress or overwhelm is high, lead with a recovery move. If hydration or nutrition is low, add one there. If capacity is very low, keep every move tiny (5–15 minutes). If capacity is good, one move may be more ambitious.
- Do not repeat the same category twice. Cover different territory (recovery, movement, mind, connection, environment, admin) so the list feels like a real day plan, not one theme five ways.
- Never suggest something the data contradicts (e.g. do not suggest a hard workout when exercise is already high and recovery is falling).

How each move must be written:
- Written in Australian English.
- One short imperative sentence, 4 to 14 words. Start with a verb. No emoji, no numbering, no labels.
- Followed by a one-line "why" (10 to 20 words) that ties the move to a specific number, trend, trigger, focus, or target from their data. The "why" is what makes this feel personalised, not generic.
- Concrete and doable in the next few hours. No vague "be mindful" or "work on your mindset".
- Never prescriptive about medication, diagnosis, or clinical treatment.

Examples of the quality bar (do not copy them, match their specificity):
Focus "finish the proposal", capacityBand "limited", sleep trend falling.
Move: "Go for a 15-minute walk before you touch the proposal again."
Why: "Your sleep is trending down and a short walk resets attention better than another coffee will."
Exercise trend falling for 5 days, capacity good.
Move: "Do a 20-minute strength session before dinner."
Why: "You haven't moved properly in five days and momentum returns faster than you'd expect."

Return valid JSON with exactly these fields:
{
  "moves": [ { "action": "the imperative move", "why": "the personalised one-line reason" } ],
  "headline": "a single short sentence framing today's moves in the person's actual context, under 20 words, no closing question",
  "mood": "one word: overwhelmed, depleted, anxious, disconnected, self-critical, steady, or mixed"
}`;
}

function buildMovesUserPrompt(context) {
  return `Here is the person's current state:\n${JSON.stringify(context, null, 2)}\n\nProduce 3 to 5 moves as described. Each move must be responsive to a specific detail in their data. Return only valid JSON with moves, headline, and mood fields.`;
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

function crisisMovesResponse(context) {
  return {
    moves: [
      {
        action: "Call Lifeline on 13 11 14, or 000 in an emergency.",
        why: "You do not have to get through this hour on your own.",
      },
    ],
    headline: "The most important move right now is to reach out for support.",
    mood: context.mood || "overwhelmed",
  };
}

function fallbackMovesResponse(context) {
  const low = context.capacityBand === "very low";
  const focus = context.focus || context.target || "today";
  const base = [
    {
      action: "Drink a full glass of water in the next five minutes.",
      why: "Small resets protect the next hour when the bigger picture feels heavy.",
    },
    {
      action: low
        ? "Step outside for a 5-minute walk without your phone."
        : "Go for a 15-minute walk before your next task.",
      why: low
        ? "Capacity is very low right now, so movement stays short and gentle."
        : "A short walk resets attention better than pushing straight into the next block.",
    },
    {
      action: low
        ? "Write one line about how today actually feels."
        : `Spend 20 minutes on ${focus} with everything else closed.`,
      why: low
        ? "Naming it in one sentence is enough today, no journal marathon required."
        : "Protected focus is where momentum actually gets made.",
    },
    {
      action: "Set a hard stop time for screens tonight.",
      why: "Sleep is the lever that lifts everything else tomorrow.",
    },
  ];
  return {
    moves: base,
    headline: low
      ? "Keep today small on purpose and protect the next hour."
      : "A short list of moves that fit what today actually needs.",
    mood: context.mood || "mixed",
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
    const mode = resolveMode(body);
    const context = buildContext(body);

    if (mode === "moves") {
      if (detectCrisis(context)) {
        const guide = crisisMovesResponse(context);
        return res.status(200).json({
          ok: true,
          mode,
          guide: {
            moves: guide.moves,
            headline: guide.headline,
            mood: guide.mood,
          },
        });
      }
      const response = await client.responses.create({
        model: "gpt-4.1",
        input: [
          { role: "system", content: buildMovesSystemPrompt() },
          { role: "user", content: buildMovesUserPrompt(context) },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "coach_moves_response",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                moves: {
                  type: "array",
                  minItems: 3,
                  maxItems: 5,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      action: { type: "string" },
                      why: { type: "string" },
                    },
                    required: ["action", "why"],
                  },
                },
                headline: { type: "string" },
                mood: {
                  type: "string",
                  enum: ["overwhelmed", "depleted", "anxious", "disconnected", "self-critical", "steady", "mixed"],
                },
              },
              required: ["moves", "headline", "mood"],
            },
          },
        },
        temperature: 0.5,
        max_output_tokens: 700,
      });
      let guide;
      try {
        const parsed = JSON.parse(response.output_text || "");
        if (parsed && Array.isArray(parsed.moves) && parsed.moves.length >= 1) {
          guide = parsed;
        } else {
          guide = fallbackMovesResponse(context);
        }
      } catch {
        guide = fallbackMovesResponse(context);
      }
      return res.status(200).json({
        ok: true,
        mode,
        guide: {
          moves: guide.moves.slice(0, 5),
          headline: toCleanString(guide.headline) || "A short list of moves for today.",
          mood: guide.mood || "mixed",
        },
      });
    }

    // Default: counsellor mode
    if (detectCrisis(context)) {
      const guide = crisisResponse(context);
      return res.status(200).json({
        ok: true,
        mode,
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
        { role: "system", content: buildCounsellorSystemPrompt() },
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
      temperature: 0.6,
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
      mode,
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
