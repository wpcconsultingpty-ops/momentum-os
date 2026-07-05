import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- Utility helpers -------------------------------------------------------

function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toCleanString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

// Fields we track and the direction that means "trouble".
// positive: higher = better (mood, energy, sleep, exercise, etc)
// inverse: higher = worse (stress, urge)
const POSITIVE_FIELDS = ["mood", "energy", "sleepQuality", "exercise", "nutrition", "hydration", "recovery", "connection", "control", "desire"];
const INVERSE_FIELDS = ["stress", "urge"];
const ALL_TRACKED = [...POSITIVE_FIELDS, ...INVERSE_FIELDS];

function niceLabel(key) {
  return ({
    mood: "mood",
    energy: "energy",
    sleepQuality: "sleep quality",
    exercise: "exercise",
    nutrition: "nutrition",
    hydration: "hydration",
    recovery: "recovery",
    connection: "connection",
    control: "control",
    desire: "desire",
    stress: "stress",
    urge: "urge",
  })[key] || key;
}

// ---- Week summarisation ---------------------------------------------------

function summariseWeek(entries) {
  // Split into most recent 7 days ("this week") vs previous 7 days ("last week")
  const sorted = entries.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  const thisWeek = sorted.slice(-7);
  const lastWeek = sorted.slice(-14, -7);

  const stats = {};
  for (const f of ALL_TRACKED) {
    const thisVals = thisWeek.map(e => toNumber(e[f])).filter(v => v !== null);
    const lastVals = lastWeek.map(e => toNumber(e[f])).filter(v => v !== null);
    const thisAvg = thisVals.length ? avg(thisVals) : null;
    const lastAvg = lastVals.length ? avg(lastVals) : null;
    stats[f] = {
      thisAvg,
      lastAvg,
      delta: (thisAvg !== null && lastAvg !== null) ? +(thisAvg - lastAvg).toFixed(2) : null,
      thisCount: thisVals.length,
      lastCount: lastVals.length,
    };
  }

  const daysLogged = new Set(thisWeek.map(e => (e.date || "").slice(0, 10))).size;

  // Compute moved / held / wentDark
  const moved = [];
  const held = [];
  const wentDark = [];

  for (const f of ALL_TRACKED) {
    const s = stats[f];
    const isInverse = INVERSE_FIELDS.includes(f);
    const label = niceLabel(f);
    // Went dark = logged less than half the days this week AND was logged more prior
    if (s.thisCount < Math.ceil(daysLogged / 2) && s.lastCount >= Math.ceil(daysLogged / 2)) {
      wentDark.push(`${label}: stopped logging (was ${s.lastCount}/7 days, now ${s.thisCount}/7)`);
    }
    if (s.delta === null) continue;
    const abs = Math.abs(s.delta);
    // Moved: >=1.0 delta
    if (abs >= 1.0) {
      const dir = isInverse ? (s.delta > 0 ? "climbed" : "dropped") : (s.delta > 0 ? "climbed" : "dropped");
      const badnews = isInverse ? s.delta > 0 : s.delta < 0;
      const arrow = badnews ? "↓" : "↑";
      moved.push(`${arrow} ${label} ${dir} ${s.delta > 0 ? "+" : ""}${s.delta.toFixed(1)} (now avg ${s.thisAvg.toFixed(1)})`);
    } else if (abs < 0.5 && s.thisCount >= 4) {
      // Held: <0.5 delta and consistently logged
      held.push(`${label} held at ${s.thisAvg.toFixed(1)}`);
    }
  }

  // Sort moved so the biggest movers show first
  moved.sort((a, b) => Math.abs(parseFloat(b.match(/[-+]?\d+\.\d+/) || 0)) - Math.abs(parseFloat(a.match(/[-+]?\d+\.\d+/) || 0)));

  // Aggregate triggers
  const triggerCounts = {};
  for (const e of thisWeek) {
    if (Array.isArray(e.triggers)) {
      for (const t of e.triggers) {
        const k = toCleanString(t).toLowerCase();
        if (!k) continue;
        triggerCounts[k] = (triggerCounts[k] || 0) + 1;
      }
    }
  }
  const topTriggers = Object.entries(triggerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([trigger, count]) => ({ trigger, count }));

  const journalNotes = thisWeek
    .map(e => toCleanString(e.journalNote))
    .filter(Boolean)
    .slice(-5);

  return {
    daysLogged,
    thisWeekEntries: thisWeek.length,
    lastWeekEntries: lastWeek.length,
    stats,
    moved: moved.slice(0, 5),
    held: held.slice(0, 3),
    wentDark: wentDark.slice(0, 3),
    topTriggers,
    journalNotes,
  };
}

function avg(arr) {
  if (!arr.length) return null;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

// ---- System prompt --------------------------------------------------------

function buildSystemPrompt(summary, streak) {
  return `You are the writer of "The Brief" — Momentum OS's weekly Sunday debrief for a self-tracking user (a professional man in his 40s-50s who logs mood, energy, sleep, stress, exercise etc daily).

VOICE:
- Terse. Scoreboard-style. Not therapy-style.
- Direct, respectful, no fluff. No exclamation marks.
- Frame the week as a debrief on an operation, not a wellness check-in.
- Never guilt-trip about missed days. Note gaps as facts.
- Use the user's actual numbers when they add signal. Never fabricate numbers.

CONTEXT PROVIDED:
- Streak stats (current, longest, freeze usage)
- Week summary: what moved (deltas ≥1.0), what held, what went dark
- Top triggers logged this week
- Recent journal snippets

OUTPUT SHAPE (JSON):
- title: short brief title (e.g. "Week 27 debrief")
- headline: 2-3 sentence opener that reads like an ops report
- moved: array of short bullet strings for movers (echo the summary but rewrite for readability, e.g. "Sleep dropped 1.8 points to 5.2 — 4 rough nights, one solid.")
- held: array of short bullet strings for what stayed steady
- wentDark: array of short bullet strings for fields the user stopped logging
- tryThese: array of exactly 3 items, each { action: short imperative, why: one sentence tied to this week's data }
- askCoach: array of exactly 3 items, each { context: one-sentence explaining the pattern, prompt: exact question the user could paste into Coach }
  - Prompts must be concrete and copy-pasteable
  - Prompts should each target a different pattern from this week
- streak: pass through { current, longest, freezeUsedThisWeek } unchanged

Do not invent metrics that weren't in the summary. If the week was quiet or thin on data, keep the brief short and honest.`;
}

const BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "headline", "moved", "held", "wentDark", "tryThese", "askCoach"],
  properties: {
    title: { type: "string" },
    headline: { type: "string" },
    moved: { type: "array", items: { type: "string" } },
    held: { type: "array", items: { type: "string" } },
    wentDark: { type: "array", items: { type: "string" } },
    tryThese: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action", "why"],
        properties: {
          action: { type: "string" },
          why: { type: "string" },
        },
      },
    },
    askCoach: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["context", "prompt"],
        properties: {
          context: { type: "string" },
          prompt: { type: "string" },
        },
      },
    },
  },
};

// ---- Fallback (used if LLM call fails) ------------------------------------

function fallbackBrief(summary, streak) {
  const moved = summary.moved.length ? summary.moved : ["Not enough movement to call out — a quieter week."];
  const held = summary.held.length ? summary.held : ["Nothing held long enough to name."];
  const wentDark = summary.wentDark;

  const tryThese = [];
  if (summary.stats.sleepQuality && summary.stats.sleepQuality.thisAvg !== null && summary.stats.sleepQuality.thisAvg < 6) {
    tryThese.push({ action: "Pick one non-negotiable sleep window", why: `Sleep is averaging ${summary.stats.sleepQuality.thisAvg.toFixed(1)}. A fixed lights-out beats a fixed alarm.` });
  }
  if (summary.stats.exercise && summary.stats.exercise.thisAvg !== null && summary.stats.exercise.thisAvg < 5) {
    tryThese.push({ action: "Book two 20-minute sessions", why: `Exercise averaged ${summary.stats.exercise.thisAvg.toFixed(1)}. Two short sessions beats one hero session that never happens.` });
  }
  if (summary.stats.stress && summary.stats.stress.thisAvg !== null && summary.stats.stress.thisAvg > 6) {
    tryThese.push({ action: "Name the trigger before Monday", why: `Stress ran high (${summary.stats.stress.thisAvg.toFixed(1)}). If it hit twice, it will hit again — plan for it.` });
  }
  while (tryThese.length < 3) {
    tryThese.push({ action: "Log one full day this week", why: "Cleanest signal comes from unbroken data. One complete day is enough to see patterns." });
  }

  const askCoach = [];
  if (summary.topTriggers.length) {
    const t = summary.topTriggers[0];
    askCoach.push({ context: `"${t.trigger}" showed up ${t.count} times this week.`, prompt: `You logged "${t.trigger}" ${t.count} times this week — how do I handle it differently next week?` });
  }
  if (summary.stats.sleepQuality && summary.stats.sleepQuality.delta !== null && summary.stats.sleepQuality.delta < -0.5) {
    askCoach.push({ context: `Sleep dropped by ${Math.abs(summary.stats.sleepQuality.delta).toFixed(1)} vs last week.`, prompt: "Sleep dropped this week. What's my Sunday reset look like?" });
  }
  if (summary.wentDark.length) {
    askCoach.push({ context: "Some fields went dark this week.", prompt: "What did I stop logging this week and why does it matter?" });
  }
  while (askCoach.length < 3) {
    askCoach.push({ context: "General direction check.", prompt: "Looking at this week, what's the single change that would move the most needles?" });
  }

  return {
    title: "Weekly brief",
    headline: `You logged ${summary.daysLogged} of 7 days. ${moved.length ? "Some things moved." : "The week held steady."} ${streak.current ? `Streak: ${streak.current}.` : ""}`.trim(),
    moved,
    held,
    wentDark,
    tryThese: tryThese.slice(0, 3),
    askCoach: askCoach.slice(0, 3),
  };
}

// ---- Handler --------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  try {
    const body = typeof req.body === "object" && req.body ? req.body : {};
    const entries = Array.isArray(body.entries) ? body.entries : [];
    const streak = (body.streak && typeof body.streak === "object") ? {
      current: toNumber(body.streak.current, 0) || 0,
      longest: toNumber(body.streak.longest, 0) || 0,
      freezeUsedThisWeek: !!body.streak.freezeUsedThisWeek,
    } : { current: 0, longest: 0, freezeUsedThisWeek: false };

    const summary = summariseWeek(entries);
    const briefDate = new Date();
    // "Week of" = the most recent Sunday (today if it's Sunday, otherwise last Sunday)
    const day = briefDate.getDay();
    if (day !== 0) briefDate.setDate(briefDate.getDate() - day);
    const dateStr = briefDate.getFullYear() + "-" + String(briefDate.getMonth() + 1).padStart(2, "0") + "-" + String(briefDate.getDate()).padStart(2, "0");
    const id = "brief-" + dateStr;

    let llmBrief = null;
    if (process.env.OPENAI_API_KEY) {
      try {
        const response = await client.responses.create({
          model: "gpt-4.1",
          input: [
            { role: "system", content: buildSystemPrompt(summary, streak) },
            { role: "user", content: JSON.stringify({ summary, streak }) },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "weekly_brief",
              schema: BRIEF_SCHEMA,
              strict: true,
            },
          },
          temperature: 0.5,
          max_output_tokens: 1200,
        });
        const raw = response.output_text || (response.output && response.output[0] && response.output[0].content && response.output[0].content[0] && response.output[0].content[0].text) || "";
        if (raw) llmBrief = JSON.parse(raw);
      } catch (llmErr) {
        console.error("[debrief] LLM call failed, using fallback", llmErr);
      }
    }

    const briefBody = llmBrief || fallbackBrief(summary, streak);
    const brief = {
      id,
      date: dateStr,
      generatedAt: new Date().toISOString(),
      title: briefBody.title || "Weekly brief",
      headline: briefBody.headline || "",
      moved: briefBody.moved || [],
      held: briefBody.held || [],
      wentDark: briefBody.wentDark || [],
      tryThese: briefBody.tryThese || [],
      askCoach: briefBody.askCoach || [],
      streak,
      meta: {
        daysLogged: summary.daysLogged,
        thisWeekEntries: summary.thisWeekEntries,
        lastWeekEntries: summary.lastWeekEntries,
      },
    };

    return res.status(200).json(brief);
  } catch (err) {
    console.error("[debrief] handler failed", err);
    return res.status(500).json({ error: "debrief_failed", message: err && err.message ? err.message : "unknown" });
  }
}
