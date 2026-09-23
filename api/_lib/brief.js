// Shared brief-generation logic — used by /api/debrief.js and /api/generate-briefs-queue.js
import OpenAI from "openai";

function toNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toCleanString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

export const POSITIVE_FIELDS = ["mood", "energy", "sleepQuality", "exercise", "nutrition", "hydration", "recovery", "discipline", "control", "desire"];
export const INVERSE_FIELDS = ["stress"];
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
    discipline: "discipline (follow-through)",
    control: "control",
    desire: "drive",
    stress: "stress",
  })[key] || key;
}

function avg(arr) {
  if (!arr.length) return null;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export function summariseWeek(entries, profile = null) {
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

  const moved = [];
  const held = [];
  const wentDark = [];

  for (const f of ALL_TRACKED) {
    const s = stats[f];
    const isInverse = INVERSE_FIELDS.includes(f);
    const label = niceLabel(f);
    if (s.thisCount < Math.ceil(daysLogged / 2) && s.lastCount >= Math.ceil(daysLogged / 2)) {
      wentDark.push(`${label}: stopped logging (was ${s.lastCount}/7 days, now ${s.thisCount}/7)`);
    }
    if (s.delta === null) continue;
    const abs = Math.abs(s.delta);
    if (abs >= 1.0) {
      const dir = s.delta > 0 ? "climbed" : "dropped";
      const badnews = isInverse ? s.delta > 0 : s.delta < 0;
      const arrow = badnews ? "↓" : "↑";
      moved.push(`${arrow} ${label} ${dir} ${s.delta > 0 ? "+" : ""}${s.delta.toFixed(1)} (now avg ${s.thisAvg.toFixed(1)})`);
    } else if (abs < 0.5 && s.thisCount >= 4) {
      held.push(`${label} held at ${s.thisAvg.toFixed(1)}`);
    }
  }

  moved.sort((a, b) => Math.abs(parseFloat(b.match(/[-+]?\d+\.\d+/) || 0)) - Math.abs(parseFloat(a.match(/[-+]?\d+\.\d+/) || 0)));

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

  // ---- Physical metrics: weight trend + BMI + alcohol correlation --------
  const physical = summarisePhysical(thisWeek, lastWeek, profile);

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
    physical,
  };
}

// ---- Physical metrics (weight, BMI, alcohol) ---------------------------------

export function summarisePhysical(thisWeek, lastWeek, profile) {
  const out = {
    weight: null,     // { thisAvg, lastAvg, delta, latest, bmi }
    alcohol: null,    // { total, drinkingDays, correlation }
  };

  // Weight — average of logged values in each 7-day window
  const thisWeights = thisWeek.map(e => toNumber(e.weightKg)).filter(v => v !== null && v > 0);
  const lastWeights = lastWeek.map(e => toNumber(e.weightKg)).filter(v => v !== null && v > 0);
  if (thisWeights.length) {
    const thisAvg = avg(thisWeights);
    const lastAvg = lastWeights.length ? avg(lastWeights) : null;
    // Latest = last logged value in the week
    const withDates = thisWeek
      .map(e => ({ d: e.date, w: toNumber(e.weightKg) }))
      .filter(x => x.w !== null && x.w > 0)
      .sort((a, b) => new Date(a.d) - new Date(b.d));
    const latest = withDates.length ? withDates[withDates.length - 1].w : thisAvg;

    const heightCm = profile && toNumber(profile.height_cm);
    let bmi = null;
    if (heightCm && heightCm > 50) {
      const m = heightCm / 100;
      bmi = latest / (m * m);
    }

    out.weight = {
      thisAvg: +thisAvg.toFixed(1),
      lastAvg: lastAvg !== null ? +lastAvg.toFixed(1) : null,
      delta: lastAvg !== null ? +(thisAvg - lastAvg).toFixed(1) : null,
      latest: +latest.toFixed(1),
      bmi: bmi !== null ? +bmi.toFixed(1) : null,
      daysLogged: thisWeights.length,
    };
  }

  // Alcohol — total drinks + correlation with sleep on drinking days
  const withAlcohol = thisWeek.map(e => ({
    drinks: toNumber(e.alcoholDrinks),
    sleep: toNumber(e.sleepQuality),
    mood: toNumber(e.mood),
  })).filter(x => x.drinks !== null);

  if (withAlcohol.length) {
    const total = withAlcohol.reduce((s, x) => s + x.drinks, 0);
    const drinkingDays = withAlcohol.filter(x => x.drinks > 0);
    const dryDays = withAlcohol.filter(x => x.drinks === 0);

    let correlation = null;
    if (drinkingDays.length >= 2 && dryDays.length >= 2) {
      const dSleep = drinkingDays.map(x => x.sleep).filter(v => v !== null);
      const dryS = dryDays.map(x => x.sleep).filter(v => v !== null);
      if (dSleep.length && dryS.length) {
        const dSleepAvg = avg(dSleep);
        const drySAvg = avg(dryS);
        const gap = +(drySAvg - dSleepAvg).toFixed(1);
        if (Math.abs(gap) >= 0.8) {
          correlation = {
            metric: "sleep",
            drinkingAvg: +dSleepAvg.toFixed(1),
            dryAvg: +drySAvg.toFixed(1),
            gap,
            drinkingDayCount: drinkingDays.length,
            dryDayCount: dryDays.length,
          };
        }
      }
    }

    out.alcohol = {
      total,
      drinkingDays: drinkingDays.length,
      dryDays: dryDays.length,
      daysLogged: withAlcohol.length,
      correlation,
    };
  }

  return out;
}

// ---- Streak stats (server-side twin of client getStreakStats) -------------

export function getStreakStats(entries) {
  if (!entries || !entries.length) return { current: 0, longest: 0, freezeUsedThisWeek: false };
  const dateKeys = new Set(entries.map(e => (e.date || "").slice(0, 10)).filter(Boolean));
  const sorted = [...dateKeys].sort();

  // Longest
  let longest = 0;
  let run = 0;
  let prev = null;
  let freezeUsedInRun = false;
  let runWeekMonday = null;
  const mondayOf = (dateStr) => {
    const d = new Date(dateStr + "T00:00:00Z");
    const dow = d.getUTCDay(); // 0=Sun
    const diff = dow === 0 ? -6 : 1 - dow;
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString().slice(0, 10);
  };
  for (const k of sorted) {
    if (!prev) { run = 1; runWeekMonday = mondayOf(k); freezeUsedInRun = false; }
    else {
      const prevD = new Date(prev + "T00:00:00Z");
      const curD = new Date(k + "T00:00:00Z");
      const gap = Math.round((curD - prevD) / 86400000);
      const curMonday = mondayOf(k);
      if (curMonday !== runWeekMonday) { freezeUsedInRun = false; runWeekMonday = curMonday; }
      if (gap === 1) { run += 1; }
      else if (gap === 2 && !freezeUsedInRun) { run += 1; freezeUsedInRun = true; }
      else { longest = Math.max(longest, run); run = 1; freezeUsedInRun = false; runWeekMonday = curMonday; }
    }
    prev = k;
  }
  longest = Math.max(longest, run);

  // Current
  const today = new Date().toISOString().slice(0, 10);
  const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  let cursor = dateKeys.has(today) ? today : (dateKeys.has(yest) ? yest : null);
  let current = 0;
  let freezeUsedThisWeek = false;
  const currentWeekMonday = mondayOf(today);
  if (cursor) {
    current = 1;
    while (true) {
      const cd = new Date(cursor + "T00:00:00Z");
      cd.setUTCDate(cd.getUTCDate() - 1);
      const prevKey = cd.toISOString().slice(0, 10);
      if (dateKeys.has(prevKey)) { current += 1; cursor = prevKey; continue; }
      // Missed one — allow single freeze inside current ISO week
      const cd2 = new Date(cursor + "T00:00:00Z");
      cd2.setUTCDate(cd2.getUTCDate() - 2);
      const prevPrevKey = cd2.toISOString().slice(0, 10);
      const missMonday = mondayOf(prevKey);
      if (!freezeUsedThisWeek && missMonday === currentWeekMonday && dateKeys.has(prevPrevKey)) {
        freezeUsedThisWeek = true;
        current += 1;
        cursor = prevPrevKey;
        continue;
      }
      break;
    }
  }

  return { current, longest, freezeUsedThisWeek };
}

// ---- LLM ------------------------------------------------------------------

function buildSystemPrompt() {
  return `You are the writer of "The Brief" — Momentum OS's weekly Sunday debrief for a self-tracking user (a professional man in his 40s-50s who logs mood, energy, sleep, stress, exercise etc daily).

VOICE:
- Terse. Scoreboard-style. Not therapy-style.
- Direct, respectful, no fluff. No exclamation marks.
- Frame the week as a debrief on an operation, not a wellness check-in.
- Never guilt-trip about missed days. Note gaps as facts.
- Use the user's actual numbers when they add signal. Never fabricate numbers.
- If physical metrics are present (weight/BMI/alcohol), weave them into the moved or held bullets naturally. If alcohol correlated with worse sleep, name it. If weight moved meaningfully, name it in kg.

OUTPUT SHAPE (JSON):
- title: short brief title (e.g. "Week 27 debrief")
- headline: 2-3 sentence opener that reads like an ops report
- moved: array of short bullet strings for movers
- held: array of short bullet strings for what stayed steady
- wentDark: array of short bullet strings for fields the user stopped logging
- tryThese: array of exactly 3 items, each { action, why }
- askCoach: array of exactly 3 items, each { context, prompt }

Do not invent metrics that weren't in the summary. If the week was quiet, keep the brief short and honest.`;
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
      type: "array", minItems: 3, maxItems: 3,
      items: { type: "object", additionalProperties: false, required: ["action", "why"], properties: { action: { type: "string" }, why: { type: "string" } } },
    },
    askCoach: {
      type: "array", minItems: 3, maxItems: 3,
      items: { type: "object", additionalProperties: false, required: ["context", "prompt"], properties: { context: { type: "string" }, prompt: { type: "string" } } },
    },
  },
};

export function fallbackBrief(summary, streak) {
  const moved = summary.moved.slice();
  const held = summary.held.length ? summary.held : ["Nothing held long enough to name."];
  const wentDark = summary.wentDark;

  // Inject physical-metrics bullets into moved/held
  const phys = summary.physical || {};
  if (phys.weight) {
    const w = phys.weight;
    if (w.delta !== null && Math.abs(w.delta) >= 0.3) {
      const dir = w.delta > 0 ? "up" : "down";
      const arrow = w.delta > 0 ? "↑" : "↓";
      moved.unshift(`${arrow} weight ${dir} ${w.delta > 0 ? "+" : ""}${w.delta.toFixed(1)}kg (now ${w.latest}kg${w.bmi ? `, BMI ${w.bmi}` : ""})`);
    } else if (w.delta !== null) {
      held.unshift(`weight held at ${w.latest}kg${w.bmi ? ` (BMI ${w.bmi})` : ""}`);
    } else {
      held.unshift(`weight ${w.latest}kg${w.bmi ? ` (BMI ${w.bmi})` : ""}`);
    }
  }
  if (phys.alcohol && phys.alcohol.daysLogged >= 3) {
    const a = phys.alcohol;
    const label = a.total === 0
      ? `0 drinks logged across ${a.daysLogged}/7 days`
      : `${a.total} drink${a.total === 1 ? "" : "s"} across ${a.drinkingDays}/${a.daysLogged} day${a.daysLogged === 1 ? "" : "s"}`;
    if (a.correlation) {
      const c = a.correlation;
      moved.unshift(`alcohol ${label}. Sleep averaged ${c.drinkingAvg} on drinking days vs ${c.dryAvg} on dry days.`);
    } else if (a.total > 0) {
      held.unshift(`alcohol: ${label}`);
    } else {
      held.unshift(`alcohol: ${label}`);
    }
  }

  const movedFinal = moved.length ? moved : ["Not enough movement to call out — a quieter week."];

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
  while (tryThese.length < 3) tryThese.push({ action: "Log one full day this week", why: "Cleanest signal comes from unbroken data. One complete day is enough to see patterns." });

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
  while (askCoach.length < 3) askCoach.push({ context: "General direction check.", prompt: "Looking at this week, what's the single change that would move the most needles?" });

  // Alcohol-specific try-these + ask-coach
  if (phys.alcohol && phys.alcohol.correlation) {
    const c = phys.alcohol.correlation;
    if (c.gap > 0) {
      tryThese.unshift({ action: "Pick two dry nights before Friday", why: `Sleep ran ${c.gap} points lower on drinking days (${c.drinkingAvg} vs ${c.dryAvg}). Two locked-in dry nights lifts the weekly floor.` });
    }
    askCoach.unshift({ context: `Sleep dropped ${c.gap} on drinking days.`, prompt: `Alcohol correlated with worse sleep this week. What's a realistic weekly cap I should try?` });
  }
  if (phys.weight && phys.weight.delta !== null && phys.weight.delta > 0.5) {
    askCoach.unshift({ context: `Weight climbed ${phys.weight.delta.toFixed(1)}kg this week.`, prompt: `Weight is trending up. Where's the leak — food, alcohol, or step count?` });
  }

  return {
    title: "Weekly brief",
    headline: `You logged ${summary.daysLogged} of 7 days. ${moved.length ? "Some things moved." : "The week held steady."} ${streak.current ? `Streak: ${streak.current}.` : ""}`.trim(),
    moved: movedFinal, held, wentDark,
    tryThese: tryThese.slice(0, 3),
    askCoach: askCoach.slice(0, 3),
  };
}

export async function generateBrief(entries, streak, profile = null) {
  const summary = summariseWeek(entries, profile);
  const briefDate = new Date();
  const day = briefDate.getUTCDay();
  if (day !== 0) briefDate.setUTCDate(briefDate.getUTCDate() - day);
  const dateStr = briefDate.toISOString().slice(0, 10);
  const id = "brief-" + dateStr;

  let llmBrief = null;
  if (process.env.OPENAI_API_KEY) {
    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await client.responses.create({
        model: "gpt-4.1",
        input: [
          { role: "system", content: buildSystemPrompt() },
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
      console.error("[brief] LLM call failed, using fallback", llmErr);
    }
  }

  const briefBody = llmBrief || fallbackBrief(summary, streak);
  return {
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
}

// Map Supabase row (snake_case) -> client entry shape (camelCase)
export function rowToEntry(row) {
  return {
    date: row.entry_date,
    mood: row.mood, energy: row.energy, sleepQuality: row.sleep_quality,
    exercise: row.exercise, nutrition: row.nutrition, hydration: row.hydration,
    recovery: row.recovery, discipline: row.discipline, control: row.control,
    desire: row.desire, stress: row.stress,
    healthScore: row.health_score, personalScore: row.personal_score, overallScore: row.overall_score,
    notes: row.notes, tomorrowFocus: row.tomorrow_focus,
    weightKg: row.weight_kg, alcoholDrinks: row.alcohol_drinks,
  };
}
