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
// One place to change the model. gpt-4o reads warmer than gpt-4.1 and is
// widely available; swap to gpt-5 / gpt-5-mini later if you have access.
const COACH_MODEL = process.env.COACH_MODEL || "gpt-4o";

function resolveMode(body) {
  const raw = toCleanString(body && body.mode, "counsellor").toLowerCase();
  return VALID_MODES.has(raw) ? raw : "counsellor";
}

// A real conversation is more than the previous turn. The client sends the
// last N exchanges as an array so the model actually has continuity. We cap
// it here defensively to keep the token budget sane.
function sanitiseConversation(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const turn of raw.slice(-12)) {
    if (!turn || typeof turn !== "object") continue;
    const role = turn.role === "assistant" ? "assistant" : turn.role === "user" ? "user" : null;
    const content = toCleanString(turn.content).slice(0, 1200);
    if (role && content) out.push({ role, content });
  }
  return out;
}

// Whether the client wants a full guidance card (message + closing question +
// three things to try) or a plain conversational reply. Default is chat-only:
// the card is the exception, not the rule, and that alone stops the coach
// feeling like a form you fill in.
function resolveWantsCard(body) {
  if (body && typeof body.wantsCard === "boolean") return body.wantsCard;
  if (body && typeof body.chatOnly === "boolean") return !body.chatOnly;
  return false;
}

function bmiBand(bmi) {
  if (!Number.isFinite(bmi)) return null;
  if (bmi < 18.5) return "underweight";
  if (bmi < 25) return "healthy";
  if (bmi < 30) return "overweight";
  return "obese";
}

export function sanitisePhysicalSignals(raw) {
  if (!raw || typeof raw !== "object") return null;
  const num = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const out = { weight: null, alcohol: null };

  if (raw.weight && typeof raw.weight === "object") {
    const w = raw.weight;
    const bmi = num(w.bmi);
    out.weight = {
      thisAvg: num(w.thisAvg),
      lastAvg: num(w.lastAvg),
      delta: num(w.delta),
      latest: num(w.latest),
      bmi,
      bmiBand: bmiBand(bmi),
      daysLogged: num(w.daysLogged) || 0,
    };
  }

  if (raw.alcohol && typeof raw.alcohol === "object") {
    const a = raw.alcohol;
    let correlation = null;
    if (a.correlation && typeof a.correlation === "object") {
      correlation = {
        metric: toCleanString(a.correlation.metric) || "sleep",
        drinkingAvg: num(a.correlation.drinkingAvg),
        dryAvg: num(a.correlation.dryAvg),
        gap: num(a.correlation.gap),
        drinkingDayCount: num(a.correlation.drinkingDayCount) || 0,
        dryDayCount: num(a.correlation.dryDayCount) || 0,
      };
    }
    out.alcohol = {
      total: num(a.total) || 0,
      drinkingDays: num(a.drinkingDays) || 0,
      dryDays: num(a.dryDays) || 0,
      daysLogged: num(a.daysLogged) || 0,
      correlation,
    };
  }

  if (!out.weight && !out.alcohol) return null;
  return out;
}

function sanitiseHistorySignals(raw) {
  if (!raw || typeof raw !== "object") return null;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const arr = (v) => (Array.isArray(v) ? v : []);
  const safe = {
    entriesCount: num(raw.entriesCount) || 0,
    daysCovered: num(raw.daysCovered) || 0,
    averages: (raw.averages && typeof raw.averages === "object") ? raw.averages : {},
    lowFields: arr(raw.lowFields).slice(0, 8).map((f) => ({
      field: toCleanString(f && f.field),
      avg: num(f && f.avg),
      daysLogged: num(f && f.daysLogged),
      note: toCleanString(f && f.note),
    })).filter((f) => f.field),
    missingFields: arr(raw.missingFields).slice(0, 8).map((f) => ({
      field: toCleanString(f && f.field),
      daysLogged: num(f && f.daysLogged),
      daysInWindow: num(f && f.daysInWindow),
    })).filter((f) => f.field),
    fallingFields: arr(raw.fallingFields).slice(0, 8).map((f) => ({
      field: toCleanString(f && f.field),
      olderAvg: num(f && f.olderAvg),
      newerAvg: num(f && f.newerAvg),
      delta: num(f && f.delta),
    })).filter((f) => f.field),
    recentTriggers: arr(raw.recentTriggers).slice(0, 5).map((t) => ({
      trigger: toCleanString(t && t.trigger),
      count: num(t && t.count),
    })).filter((t) => t.trigger),
    recentJournalSnippets: arr(raw.recentJournalSnippets).slice(0, 3).map((s) => toCleanString(s).slice(0, 240)).filter(Boolean),
    note: toCleanString(raw.note),
  };
  return safe;
}

export function buildContext(body) {
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
    historySignals: sanitiseHistorySignals(body.historySignals),
    physicalSignals: sanitisePhysicalSignals(body.physicalSignals),
    previousCoachMessage: toCleanString(body.previousCoachMessage),
    previousUserReply: toCleanString(body.previousUserReply),
    conversation: sanitiseConversation(body.conversation),
  };
  context.mood = readMood(context);
  return context;
}

function buildSystemPrompt() {
  return buildCounsellorSystemPrompt();
}

// Executive-coach chat prompt. Direct, substantive, answers first. This is
// the voice a busy professional wants when they open the coach: they asked
// a question, they want an actual answer, and one sharp follow-up question
// only if it genuinely moves the thinking forward.
export function buildChatSystemPrompt() {
  return `You are a sharp, experienced executive coach embedded in a personal momentum app. Your users are working professionals — founders, operators, senior managers — who don't have time for platitudes. They came here to think more clearly and get real answers, not to be soothed.

SAFETY (highest priority, overrides everything below): If the person shows any sign of being at risk of self-harm, suicide, or being in crisis, direct them to Lifeline on 13 11 14 (or 000 for emergencies). Do not give any other advice in that case.

HOW YOU RESPOND — the rules that override everything else:

1. ANSWER FIRST. If they asked a question, the first sentence of your reply is the answer. Not a preamble, not a reflection back, not "it sounds like". If they asked "how's my sleep trending", start with the trend. If they asked "what should I do about X", start with what you'd actually do.

2. NO THERAPIST OPENERS. These openers are BANNED and will make your response wrong:
   - "Sounds like you've got a lot on your plate"
   - "It sounds like..."
   - "That makes sense"
   - "I hear you"
   - "I can imagine that..."
   - "How are you feeling about..."
   - "What's coming up for you..."
   - Any variant of these. If you catch yourself writing one, delete it and start with the substantive answer instead.

3. ONE QUESTION MAXIMUM, and only if it genuinely sharpens their thinking. Most replies should end on a statement or a specific next step, not a question. If you do ask a question, it must be pointed and useful — "Which of the three is the highest-leverage one this week?" not "How are you feeling about that?".

4. USE THE CONVERSATION. If there is prior turn history, you already know what they're working on. Do not re-ask what they told you. Do not restart the conversation each reply. Build on what was said.

5. MATCH THE QUESTION TYPE:
   - Analytical question ("how's my sleep", "what's driving my score"): give the analysis. Reference specific numbers from their data. Be direct.
   - Decision question ("should I do X", "how do I prioritise"): give a recommendation with your reasoning, not a set of options.
   - Situational share ("I'm stuck on the proposal"): name what you're seeing, then offer a specific angle or next move. Not empathy — traction.
   - Emotional share ("I feel overwhelmed", "I'm exhausted"): acknowledge it briefly (one line), then move to what would actually help. Don't dwell.

VOICE:
- Australian English.
- Direct, warm-but-not-soft, substantive. Think good McKinsey partner or a senior board mentor — not a therapist, not a life coach.
- Short. 40–120 words usually. Never over 180.
- Concrete language. Specific over abstract. No filler.
- You may use their data (focus, capacity, scores, trends) when it strengthens the answer, but at most one data reference per reply and only when it's the strongest evidence.
- Plain prose. No bullet points, no numbered lists, no headers.

What you never do:
- Never open with a reflection or restatement of what they said.
- Never end with "Any particular part you're drawn to?" or similar vague probes.
- Never diagnose, pathologise, or use clinical language.
- Never lecture. Never pad. Never repeat.

Return plain text only, ready to display. No JSON, no formatting.`;
}

export function buildCounsellorSystemPrompt() {
  return `You are a warm, emotionally intelligent counsellor inside a personal momentum app. You are not a clinician and you don't diagnose, but you hold space the way a good counsellor does: you listen closely, reflect feelings back, and help the person reach their own understanding rather than handing them fixes.

SAFETY (highest priority, overrides everything below): If the person shows any sign of being at risk of self-harm, suicide, or being in crisis, gently and directly encourage them to reach out to crisis support right now. In Australia, mention Lifeline on 13 11 14 or 000 for emergencies. Do not give any other advice in that case.

How you think before you speak (do this silently, never show it):
- Check whether this is the first message or a continuing conversation. If previousCoachMessage and previousUserReply are both empty, this is the OPENING turn; otherwise it is a CONTINUING turn.
- OPENING turn: Read their scores, trends, capacityBand, focus, target, recurring triggers, and physicalSignals (weight trend, BMI band, alcohol pattern, alcohol-sleep gap). Identify the single most important thing worth gently naming, and ground your opening in that specific data. A meaningful weight change or alcohol-sleep correlation is fair game to name, always neutrally, never as judgement.
- CONTINUING turn: Lead with what THEY just said, not the dashboard. Follow their thread. Their words are the material you work with now. You may quietly link back to their data only when it genuinely deepens what they are exploring, never to steer them back to their numbers.
- Calibrate depth to capacityBand: "very low" means mostly listening and permission to rest; "limited" means gentle reflection and, only if they want it, one small step; "good" means space to think something through together.

How you speak (this applies ONLY to the 'message' field, not the tryThese bullets below):
- Write in Australian English spelling and phrasing.
- Short paragraphs, natural pacing, like a real person talking quietly with someone they care about.
- In the 'message' field, never use labels, headers, bullet points, or numbered lists. Bullets belong only in the 'tryThese' field.
- Never say things like "Here are some suggestions" or "I notice a pattern".
- Weave any observations naturally into the conversation.
- Keep your 'message' under 150 words.
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

Three things to try (the 'tryThese' field — always exactly 3 bullets):
- Each bullet is a small, concrete action they can try in the next day or two. Not vague, not abstract, not a mindset shift.
- The bullets are the ONE place where you may offer direction. This overrides the 'never prescribe' rule above. You are giving them 3 practical options, not making them ask.
- Each bullet must clearly link back to what THEY asked about in freeText or previousUserReply. If they asked about sleep, all 3 bullets should touch sleep (from different angles). If they asked how to feel less stuck, all 3 bullets should be about getting unstuck.
- Ground the bullets in their historySignals. Prioritise lowFields (things averaging below 5, or above 6 for stress/urge), missingFields (things they have stopped logging — those are often the real gap), and fallingFields (things trending the wrong way). Reference the specific field or number in the 'why' so it feels grounded, not generic. Example why: "Sleep quality is averaging 4.3 over the last 7 days."
- Also read physicalSignals when present. It can contain weight (thisAvg, lastAvg, delta, latest, bmi, bmiBand, daysLogged) and alcohol (total drinks in the last 7 days, drinkingDays, dryDays, and a correlation object showing how sleep changes on drinking vs dry days). Reference these directly when they meaningfully connect to what the person is asking about — for example, a rising weight trend, a BMI outside the healthy band, a heavy drinking week, or a clear sleep gap between drinking and dry days. Never mention BMI as a judgement — only ever as a neutral data point tied to what they raised.
- If physicalSignals.alcohol.correlation exists and the gap is meaningful (>= 0.8 sleep points), that is often the single most useful thing to name when they are asking about sleep, energy, mood or recovery.
- If they have no history yet (historySignals.entriesCount is 0), keep the bullets sensible and general, and tie them to the question rather than data. Do not fabricate numbers.
- Never fabricate physical metrics. If physicalSignals is null or a specific field (weight, alcohol, bmi) is null, do not mention it.
- Do not repeat the same idea three ways. Cover different angles.
- Each bullet has a short imperative 'action' (4–14 words, starts with a verb) and a one-line 'why' (10–25 words) tying it to their question and, where possible, a specific number, missing field, or falling trend.
- Never suggest something the data contradicts (e.g. do not tell them to exercise more if exercise is already high and recovery is falling).

Return valid JSON with exactly these fields:
{
  "message": "your full conversational response, reflection woven together naturally, with no closing question and no bullets inside it",
  "question": "your single closing question",
  "tryThese": [
    { "action": "short imperative move", "why": "one-line reason tying it to their question and their history" },
    { "action": "...", "why": "..." },
    { "action": "...", "why": "..." }
  ],
  "mood": "one word: overwhelmed, depleted, anxious, disconnected, self-critical, steady, or mixed"
}`;
}

function buildUserPrompt(context) {
  // Strip conversation from the JSON dump — it goes into the message array as
  // real turns instead. Same for the redundant previous* fields.
  const { conversation: _c, previousCoachMessage: _p1, previousUserReply: _p2, ...rest } = context;
  const isContinuing = context.conversation && context.conversation.length > 0;
  return `Here is the person's current state:\n${JSON.stringify(rest, null, 2)}\n\n${isContinuing ? "This is a CONTINUING conversation — the prior turns are in the message history above. Lead with what they just said. Do not re-anchor to their dashboard. Do not restate what they told you earlier." : "This is the OPENING turn. Ground your reflection in one specific detail from their data (focus, target, a real change, a recurring trigger), and do it once."}\n\nThen produce exactly 3 bullets in tryThese, grounded in what they asked AND their historySignals (lowFields, missingFields, fallingFields). Reference a specific field or number in the 'why' where possible. If historySignals.entriesCount is 0, keep the bullets general and tied to their question — do not invent numbers.\n\nReturn only valid JSON with message, question, tryThese, and mood fields.`;
}

function buildChatUserPrompt(context) {
  const { conversation: _c, previousCoachMessage: _p1, previousUserReply: _p2, ...rest } = context;
  const isContinuing = context.conversation && context.conversation.length > 0;
  // Compact, high-signal data block — what an executive coach would actually
  // glance at before answering. Full context is available if they ask for it.
  const hs = rest.historySignals || {};
  const dataBlock = `Their current state (reference at most one number in your reply, only if it strengthens the answer):\n${JSON.stringify({
    focus: rest.focus,
    capacity: rest.capacity,
    capacityBand: rest.capacityBand,
    overallScore: rest.overallScore,
    weeklyAverage: rest.weeklyAverage,
    scoreDelta: rest.scoreDelta,
    healthScore: rest.healthScore,
    personalScore: rest.personalScore,
    mood: rest.mood,
    trends: rest.trends,
    lowFields: (hs.lowFields || []).slice(0, 4),
    fallingFields: (hs.fallingFields || []).slice(0, 4),
    daysCovered: hs.daysCovered,
  }, null, 2)}`;
  return `${dataBlock}\n\n${isContinuing ? "CONTINUING CONVERSATION. The prior turns are in the message history above. Build on them. Do not re-ask what they already told you. Do not restart." : "OPENING TURN. This is the first thing they've said. Answer directly."}\n\nRemember: answer first (their question deserves a real answer), no therapist openers, one pointed question maximum only if it sharpens their thinking, and never open with \"Sounds like...\" or \"It sounds like...\".`;
}

export function buildMovesSystemPrompt() {
  return `You are the practical, action-oriented voice of a personal momentum app. Your job in this mode is to look at the person's day and give them a short list of small, concrete moves they can act on in the next few hours.

SAFETY (highest priority, overrides everything below): If the person shows any sign of being at risk of self-harm, suicide, or being in crisis, do not produce a moves list. Instead return a single move that says: "Reach out to Lifeline on 13 11 14, or 000 in an emergency. You do not have to get through this hour on your own." and set mood to "overwhelmed".

How you decide what to suggest (do this silently, never show your reasoning):
- Read overallScore, weeklyAverage, scoreDelta, capacity, capacityBand, focus, target, bleed, mood, trends, triggerFrequency, historySignals, and physicalSignals.
- Pick 3 to 5 moves that are specifically responsive to that data. If sleep is falling, suggest a sleep-protective move. If exercise trend is falling, suggest a movement move. If stress or overwhelm is high, lead with a recovery move. If hydration or nutrition is low, add one there. If capacity is very low, keep every move tiny (5–15 minutes). If capacity is good, one move may be more ambitious.
- Also read physicalSignals when present. It can contain weight (thisAvg, lastAvg, delta, bmi, bmiBand, daysLogged) and alcohol (total, drinkingDays, dryDays, correlation with sleep). Use these directly: a rising weight trend or a bmiBand outside "healthy" is a signal for a movement, sleep, or nutrition move. A heavy drinking week or a clear alcohol-sleep correlation gap is a signal for a hydration, sleep, or drink-swap move. Reference the specific number or delta in the 'why'.
- Never mention BMI as a judgement, only as a neutral data point. Never fabricate physical metrics: if physicalSignals or a specific field is null, do not mention it.
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
    tryThese: [
      { action: "Call Lifeline on 13 11 14 right now.", why: "They are free, 24/7, and will stay on the line with you." },
      { action: "Message one person you trust and tell them what's happening.", why: "You do not have to explain the whole story — just that you need someone with you." },
      { action: "If you are in immediate danger, call 000.", why: "Emergency services can help you get to a safe place tonight." },
    ],
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

export function buildFallbackTryThese(context) {
  const hs = context.historySignals || {};
  const ps = context.physicalSignals || {};
  const low = Array.isArray(hs.lowFields) ? hs.lowFields : [];
  const missing = Array.isArray(hs.missingFields) ? hs.missingFields : [];
  const falling = Array.isArray(hs.fallingFields) ? hs.fallingFields : [];

  const suggestionFor = (field, avg) => {
    switch (field) {
      case "sleepQuality":
        return { action: "Set a hard lights-out time tonight and hold it.", why: `Sleep quality is averaging ${avg ?? "low"} lately, and everything else lifts when sleep does.` };
      case "exercise":
        return { action: "Go for a 20-minute walk before your next meal.", why: `Exercise has been sitting around ${avg ?? "low"} — short movement now beats a perfect session you never do.` };
      case "hydration":
        return { action: "Drink a full glass of water in the next five minutes.", why: `Hydration is averaging ${avg ?? "low"} — the smallest move that actually changes how you feel.` };
      case "nutrition":
        return { action: "Plan one protein-forward meal today, not all of them.", why: `Nutrition is averaging ${avg ?? "low"} — one deliberate meal is more useful than a full overhaul.` };
      case "energy":
        return { action: "Step outside for 10 minutes without your phone.", why: `Energy is averaging ${avg ?? "low"} — daylight and quiet reset it faster than caffeine will.` };
      case "mood":
        return { action: "Message one person you actually like today.", why: `Mood is averaging ${avg ?? "low"} — connection is the lever that shifts it, not more thinking.` };
      case "recovery":
        return { action: "Book a genuine rest block into today.", why: `Recovery is averaging ${avg ?? "low"} — rest scheduled in advance is more likely to actually happen.` };
      case "connection":
        return { action: "Reach out to one person today, not to catch up, just to say hello.", why: `Connection is averaging ${avg ?? "low"} — a small check-in counts as connection.` };
      case "control":
        return { action: "Pick the single most important thing for today and start there.", why: `Sense of control is averaging ${avg ?? "low"} — one clear next step returns it faster than a plan.` };
      case "stress":
        return { action: "Take five slow breaths before the next task.", why: `Stress is averaging ${avg ?? "high"} — a five-breath pause changes the physiology before it changes the story.` };
      case "urge":
        return { action: "Name the urge out loud and delay acting for 10 minutes.", why: `Urge intensity is averaging ${avg ?? "high"} — naming and delaying breaks the automatic loop.` };
      case "desire":
        return { action: "Write down one thing that would make today feel meaningful.", why: `Desire is averaging ${avg ?? "low"} — clarity on what you actually want is the first move.` };
      default:
        return null;
    }
  };

  const bullets = [];
  const used = new Set();

  // Physical signals first — highest signal-to-noise when present
  if (ps.alcohol && ps.alcohol.correlation && Math.abs(ps.alcohol.correlation.gap || 0) >= 0.8) {
    const c = ps.alcohol.correlation;
    bullets.push({
      action: "Pick two dry nights this week and note how you sleep.",
      why: `Sleep averages ${c.dryAvg} on dry nights vs ${c.drinkingAvg} on drinking nights over the last week — a ${Math.abs(c.gap).toFixed(1)}-point gap.`,
    });
    used.add("alcohol");
  }
  if (bullets.length < 3 && ps.weight && Number.isFinite(ps.weight.delta) && Math.abs(ps.weight.delta) >= 0.7) {
    const d = ps.weight.delta;
    bullets.push({
      action: d > 0
        ? "Add a 20-minute walk after your biggest meal."
        : "Add a protein-forward snack between your two biggest meals.",
      why: d > 0
        ? `Weight is up ${d.toFixed(1)} kg vs last week — a post-meal walk is the cheapest lever to nudge that back.`
        : `Weight is down ${Math.abs(d).toFixed(1)} kg vs last week — a small extra protein anchor keeps that healthy rather than accidental.`,
    });
    used.add("weight");
  }

  // Pick from lowFields next
  low.forEach((f) => {
    if (bullets.length >= 3) return;
    const s = suggestionFor(f.field, f.avg);
    if (s && !used.has(f.field)) { bullets.push(s); used.add(f.field); }
  });
  // Then missingFields (things they stopped logging)
  missing.forEach((f) => {
    if (bullets.length >= 3) return;
    if (used.has(f.field)) return;
    bullets.push({
      action: `Log ${f.field} tonight, even if the answer is boring.`,
      why: `You have only logged ${f.field} on ${f.daysLogged || 0} of the last ${f.daysInWindow || 7} days — the gap itself is data.`,
    });
    used.add(f.field);
  });
  // Then fallingFields
  falling.forEach((f) => {
    if (bullets.length >= 3) return;
    if (used.has(f.field)) return;
    const s = suggestionFor(f.field, f.newerAvg);
    if (s) { bullets.push(s); used.add(f.field); }
  });

  // Generic top-ups
  const generics = [
    { action: "Go for a 15-minute walk before your next block of work.", why: "Movement resets attention better than pushing straight into the next thing." },
    { action: "Drink a full glass of water in the next five minutes.", why: "Smallest possible reset when the bigger picture feels heavy." },
    { action: "Set a hard stop time for screens tonight.", why: "Sleep is the lever that lifts almost every other number tomorrow." },
  ];
  for (const g of generics) {
    if (bullets.length >= 3) break;
    bullets.push(g);
  }

  return bullets.slice(0, 3);
}

function fallbackResponse(context) {
  const detail =
    context.focus || context.target || context.bleed || "what's on your plate";
  const low = context.capacityBand === "very low";
  return {
    message: low
      ? `Things sound heavy around ${detail} right now, and with capacity this low, pushing harder probably isn't it. A glass of water, a few minutes away from the screen, or just naming that today is a hard one — any of those count.`
      : `There's a lot moving around ${detail} for you. Before anything else, it might help to notice what you actually need in the next hour — not what you think you should be doing.`,
    question: low
      ? "What's one thing you could take off your plate for the rest of today?"
      : "What does the next hour actually need to look like?",
    tryThese: buildFallbackTryThese(context),
    mood: context.mood || "mixed",
  };
}

function fallbackChatResponse(context) {
  const detail =
    context.focus || context.target || context.bleed || "what's on your plate";
  return context.capacityBand === "very low"
    ? `That sounds heavy. With ${detail} sitting on top of low capacity, maybe the next hour doesn't need to be productive — it needs to be kinder than usual.`
    : `Sounds like there's a lot around ${detail} right now. What's actually the hardest bit of it?`;
}

// Detect the therapist-cliché openers the model keeps producing despite the
// prompt saying not to. When we spot one, we regenerate with a stronger
// system message. Keep this list tight — false positives are worse than
// letting one through occasionally.
const BANNED_OPENERS = [
  /^\s*sounds like\b/i,
  /^\s*it sounds like\b/i,
  /^\s*that makes sense\b/i,
  /^\s*i hear you\b/i,
  /^\s*i can imagine\b/i,
  /^\s*how are you feeling\b/i,
  /^\s*what'?s coming up\b/i,
  /^\s*i can see (that|why)\b/i,
];

function hasBannedOpener(text) {
  const t = toCleanString(text);
  return BANNED_OPENERS.some((re) => re.test(t));
}

// Soft trim: drop only whole sentences past the limit, never mid-sentence.
// Mid-sentence truncation is one of the things that makes replies feel robotic.
function softTrim(text, maxWords = 200) {
  const clean = toCleanString(text);
  const words = clean.split(/\s+/);
  if (words.length <= maxWords) return clean;
  // Walk back to the last sentence boundary that fits under the budget.
  const sentences = clean.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [clean];
  let out = "";
  for (const s of sentences) {
    const candidate = (out + s).trim();
    if (candidate.split(/\s+/).length > maxWords) break;
    out = candidate + " ";
  }
  return (out.trim() || clean.split(/\s+/).slice(0, maxWords).join(" ")).trim();
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
        model: COACH_MODEL,
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
          tryThese: guide.tryThese,
          mood: guide.mood,
        },
      });
    }

    const wantsCard = resolveWantsCard(body);
    const conversationTurns = context.conversation || [];

    // CHAT MODE — executive-coach voice, answers first. If the model still
    // opens with a therapist cliché (it sometimes does under pressure), we
    // retry once with a stronger corrective system message.
    if (!wantsCard) {
      const runChat = async (extraSystem) => {
        const systemContent = extraSystem
          ? `${buildChatSystemPrompt()}\n\nCRITICAL CORRECTION: ${extraSystem}`
          : buildChatSystemPrompt();
        return client.responses.create({
          model: COACH_MODEL,
          input: [
            { role: "system", content: systemContent },
            ...conversationTurns,
            { role: "user", content: buildChatUserPrompt(context) },
          ],
          temperature: 0.6,
          max_output_tokens: 400,
        });
      };

      let response = await runChat();
      let text = toCleanString(response.output_text);

      if (hasBannedOpener(text) || !text) {
        // One retry with an explicit correction, colder temperature.
        response = await runChat(
          `Your previous attempt started with a banned therapist cliché ("Sounds like..." / "It sounds like..." / "How are you feeling..." / etc). Do NOT do that. Start with the substantive answer to what they asked. If they asked a question, the first sentence IS the answer. If they shared a situation, the first sentence names the strongest angle or next move.`
        );
        text = toCleanString(response.output_text);
      }

      const message = softTrim(text || fallbackChatResponse(context), 200);
      // Structured log so we can debug voice + memory issues in Vercel logs
      // without shipping user content anywhere else.
      try {
        console.log(JSON.stringify({
          coach_debug: true,
          mode: "chat",
          turns_received: conversationTurns.length,
          reply_first_words: message.split(/\s+/).slice(0, 6).join(" "),
          reply_word_count: message.split(/\s+/).length,
        }));
      } catch (_) { /* logging must never break the response */ }

      return res.status(200).json({
        ok: true,
        mode,
        chat: true,
        guide: {
          reflection: message,
          closingQuestion: "",
          tryThese: [],
          mood: context.mood || "mixed",
        },
      });
    }

    // CARD MODE — user explicitly asked for something to try. Keep the full
    // structured response (message + closing question + 3 bullets).
    const response = await client.responses.create({
      model: COACH_MODEL,
      input: [
        { role: "system", content: buildCounsellorSystemPrompt() },
        ...conversationTurns,
        { role: "user", content: buildUserPrompt(context) },
      ],
      // Plain JSON, not strict schema — strict schema mode dampens voice.
      // We validate and fall back if the model deviates.
      text: { format: { type: "json_object" } },
      temperature: 0.75,
      max_output_tokens: 900,
    });
    let guide;
    try {
      const parsed = JSON.parse(response.output_text || "");
      if (parsed && parsed.message && parsed.question) {
        guide = parsed;
        if (!Array.isArray(guide.tryThese) || guide.tryThese.length < 3) {
          guide.tryThese = buildFallbackTryThese(context);
        } else {
          guide.tryThese = guide.tryThese.slice(0, 3);
        }
      } else {
        guide = fallbackResponse(context);
      }
    } catch {
      guide = fallbackResponse(context);
    }
    return res.status(200).json({
      ok: true,
      mode,
      chat: false,
      guide: {
        reflection: softTrim(guide.message, 200),
        closingQuestion: guide.question,
        tryThese: guide.tryThese || buildFallbackTryThese(context),
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
