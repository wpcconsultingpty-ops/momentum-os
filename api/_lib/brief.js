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

export const POSITIVE_FIELDS = ["mood", "energy", "sleepQuality", "exercise", "nutrition", "hydration", "discipline", "control", "desire"];
export const INVERSE_FIELDS = ["stress"];
const ALL_TRACKED = [...POSITIVE_FIELDS, ...INVERSE_FIELDS];
// Evening tap questions: reported as day counts (scorecard), never as averages.
export const TAP_FIELDS = ["discipline", "exercise", "nutrition"];

// Bucket a 0-10 value into the tap answer it represents. Tap answers save as
// discipline 9/5/2, exercise 9/6/2, nutrition 9/5/2; older dial values map to
// the nearest bucket.
function tapBucket(field, v) {
  if (v === null || v === undefined) return null;
  if (field === "exercise") return v >= 8 ? "trained" : v >= 5 ? "light" : "none";
  if (field === "discipline") return v >= 8 ? "yes" : v >= 4 ? "partly" : "no";
  return v >= 8 ? "on" : v >= 4 ? "mixed" : "off";
}

function tallyTop(list, n = 3) {
  const counts = {};
  for (const d of list) {
    const k = toCleanString(d).split(" · ")[0];
    if (k) counts[k] = (counts[k] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n).map(([detail, count]) => ({ detail, count }));
}

function tapWeek(week) {
  const out = {
    followThrough: { yes: 0, partly: 0, no: 0, days: 0, blockers: [] },
    movement: { trained: 0, light: 0, none: 0, days: 0, activities: [], blockers: [] },
    eating: { on: 0, mixed: 0, off: 0, days: 0, misses: [] },
  };
  const dBlock = [], mDid = [], mBlock = [], eMiss = [];
  for (const e of week) {
    const d = tapBucket("discipline", toNumber(e.discipline));
    if (d) { out.followThrough[d] += 1; out.followThrough.days += 1; if (d !== "yes" && e.disciplineBlocker) dBlock.push(e.disciplineBlocker); }
    const m = tapBucket("exercise", toNumber(e.exercise));
    if (m) {
      out.movement[m] += 1; out.movement.days += 1;
      if (e.exerciseDetail) (m === "none" ? mBlock : mDid).push(e.exerciseDetail);
    }
    const n = tapBucket("nutrition", toNumber(e.nutrition));
    if (n) { out.eating[n] += 1; out.eating.days += 1; if (n !== "on" && e.nutritionDetail) eMiss.push(e.nutritionDetail); }
  }
  out.followThrough.blockers = tallyTop(dBlock);
  out.movement.activities = tallyTop(mDid);
  out.movement.blockers = tallyTop(mBlock);
  out.eating.misses = tallyTop(eMiss);
  return out;
}

const topStr = (list) => list.length ? `${list[0].detail} (${list[0].count})` : "";

// Plain-English scorecard lines, e.g. "Followed through 4 of 6 days".
// Goes to moved (with arrow) when good days shifted by 2+ vs last week, else held.
function scorecardLines(thisTap, lastTap) {
  const moved = [];
  const held = [];
  // main: the count sentence without a full stop; extras: follow-up detail sentences
  const place = (main, extras, goodNow, goodLast, lastDays) => {
    const tail = extras.length ? " " + extras.join(" ") : "";
    if (lastDays >= 3 && Math.abs(goodNow - goodLast) >= 2) {
      moved.push(`${goodNow > goodLast ? "↑" : "↓"} ${main}, up from ${goodLast} last week.${tail}`.replace(", up from", goodNow > goodLast ? ", up from" : ", down from"));
    } else {
      held.push(`${main}.${tail}`);
    }
  };
  const ft = thisTap.followThrough, ftL = lastTap.followThrough;
  if (ft.days) {
    const extra = [ft.partly ? `partly ${ft.partly}` : "", ft.no ? `missed ${ft.no}` : ""].filter(Boolean).join(", ");
    const main = `Followed through on your focus ${ft.yes} of ${ft.days} days${extra ? ` (${extra})` : ""}`;
    const extras = ft.blockers.length ? [`Main blocker: ${topStr(ft.blockers)}.`] : [];
    place(main, extras, ft.yes, ftL.yes, ftL.days);
  }
  const mv = thisTap.movement, mvL = lastTap.movement;
  if (mv.days) {
    const active = mv.trained + mv.light;
    const main = `Moved ${active} of ${mv.days} days (trained ${mv.trained}, light ${mv.light})`;
    const extras = [];
    if (mv.activities.length) extras.push(`Mostly ${topStr(mv.activities)}.`);
    if (mv.blockers.length) extras.push(`Stopped by: ${topStr(mv.blockers)}.`);
    place(main, extras, active, mvL.trained + mvL.light, mvL.days);
  }
  const ea = thisTap.eating, eaL = lastTap.eating;
  if (ea.days) {
    const extra = [ea.mixed ? `mixed ${ea.mixed}` : "", ea.off ? `off track ${ea.off}` : ""].filter(Boolean).join(", ");
    const main = `Ate on point ${ea.on} of ${ea.days} days${extra ? ` (${extra})` : ""}`;
    const extras = ea.misses.length ? [`What threw it: ${topStr(ea.misses)}.`] : [];
    place(main, extras, ea.on, eaL.on, eaL.days);
  }
  return { moved, held };
}

function niceLabel(key) {
  return ({
    mood: "mood",
    energy: "energy",
    sleepQuality: "sleep quality",
    exercise: "movement",
    nutrition: "nutrition",
    hydration: "hydration",
    discipline: "follow-through",
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
    if (TAP_FIELDS.includes(f)) continue;
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

  // Evening tap questions: day counts + follow-up details for this and last week
  const tap = tapWeek(thisWeek);
  const tapLast = tapWeek(lastWeek);
  const scorecard = scorecardLines(tap, tapLast);

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
    moved: [...scorecard.moved, ...moved].slice(0, 6),
    held: [...scorecard.held, ...held].slice(0, 5),
    wentDark: wentDark.slice(0, 3),
    topTriggers,
    tap,
    tapLastWeek: tapLast,
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
  return `You are the writer of "The Brief" — Momentum OS's weekly Sunday debrief for a self-tracking user (a professional man in his 40s-50s).

WHAT HE LOGS:
- Morning: mood, energy, sleep quality (dials), optional stress and hydration, weight and alcohol, and a written focus for the day.
- Evening: three tap questions plus two dials.
  - Follow-through: did he do what his morning focus said? Yes / Partly / No, with what got in the way.
  - Movement: Trained / Light / Nothing, with what he did or what stopped him.
  - Nutrition: On point / Mixed / Off track, with what threw it (e.g. Takeaway, Snacking, Alcohol).
  - Drive (ambition, hunger to get things done) and Control (mental clarity) as 0-10 dials.
- There is no recovery, connection, desire or urge metric. Never mention them.

VOICE:
- Terse. Scoreboard-style. Not therapy-style.
- Direct, respectful, no fluff. No exclamation marks.
- Frame the week as a debrief on an operation, not a wellness check-in.
- Never guilt-trip about missed days. Note gaps as facts.
- Use the user's actual numbers when they add signal. Never fabricate numbers.
- If physical metrics are present (weight/BMI/alcohol), weave them into the moved or held bullets naturally. If alcohol correlated with worse sleep, name it. If weight moved meaningfully, name it in kg.
- Report follow-through, movement and nutrition as day counts from summary.tap (compare with summary.tapLastWeek), never as averages or scores out of 10. Write them like: "Followed through on your focus 4 of 6 days", "Trained 3 days, light 2, nothing 2", "Ate on point 3 of 6 days".
- Name the top follow-up detail when it repeats: the main follow-through blocker, what threw eating, or what he mostly did for movement. Quote the pick as logged (e.g. Energy, Snacking, Gym).
- Use "drive" (never "desire") and "movement" for exercise. Use Australian English.
- At least one tryThese item should target the most repeated blocker or miss, when one exists.

OUTPUT SHAPE (JSON):
- title: short brief title (e.g. "Week 27 debrief")
- headline: 2-3 sentence opener that reads like an ops report
- moved: array of short bullet strings for movers
- held: array of short bullet strings for what stayed steady
- wentDark: array of short bullet strings for fields the user stopped logging
- tryThese: array of exactly 3 items, each { action, why }
- askCoach: array of exactly 3 items, each { context, prompt }. context is a short factual line addressed to him ("Energy got in the way 3 times."). prompt is written in HIS voice, first person, as the question he taps to ask the Coach (e.g. "Energy keeps getting in the way of my focus. How do I plan around it next week?"). Never write prompt as a question to him.

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
  const tap = summary.tap || null;
  if (tap && tap.followThrough.days >= 3 && tap.followThrough.yes < Math.ceil(tap.followThrough.days / 2)) {
    const ft = tap.followThrough;
    const b = ft.blockers[0];
    tryThese.push({ action: "Shrink tomorrow's focus to one thing", why: `You followed through ${ft.yes} of ${ft.days} days${b ? `, and ${b.detail} got in the way ${b.count} time${b.count === 1 ? "" : "s"}` : ""}. A smaller promise you keep beats a big one you don't.` });
  }
  if (tap && tap.movement.days >= 3 && (tap.movement.trained + tap.movement.light) < 3) {
    const mv = tap.movement;
    const b = mv.blockers[0];
    tryThese.push({ action: "Book two 20-minute sessions", why: `You moved ${mv.trained + mv.light} of ${mv.days} days${b ? `; ${b.detail} stopped you ${b.count} time${b.count === 1 ? "" : "s"}` : ""}. Two short sessions beat one big session that never happens.` });
  }
  if (tap && tap.eating.misses.length && tap.eating.misses[0].count >= 2) {
    const m = tap.eating.misses[0];
    tryThese.push({ action: `Plan around ${m.detail.toLowerCase()} before it happens`, why: `${m.detail} threw your eating ${m.count} times this week. Decide the swap in advance, not in the moment.` });
  }
  if (summary.stats.stress && summary.stats.stress.thisAvg !== null && summary.stats.stress.thisAvg > 6) {
    tryThese.push({ action: "Name the trigger before Monday", why: `Stress ran high (${summary.stats.stress.thisAvg.toFixed(1)}). If it hit twice, it will hit again — plan for it.` });
  }
  const fillers = [
    { action: "Log every evening this week", why: "Your evening answers are what the Coach reads to spot patterns. Seven nights gives it a full picture." },
    { action: "Copy your best day", why: "Pick the day that went best this week and repeat its first two hours on Monday." },
    { action: "Log one full day this week", why: "Cleanest signal comes from unbroken data. One complete day is enough to see patterns." },
  ];
  for (const f of fillers) { if (tryThese.length >= 3) break; if (!tryThese.some(t => t.action === f.action)) tryThese.push(f); }

  const askCoach = [];
  if (tap && tap.followThrough.blockers.length) {
    const b = tap.followThrough.blockers[0];
    askCoach.push({ context: `${b.detail} got in the way of your focus ${b.count} time${b.count === 1 ? "" : "s"}.`, prompt: `${b.detail} keeps getting in the way of what I set out to do. How do I plan around it next week?` });
  }
  if (tap && tap.eating.misses.length) {
    const m = tap.eating.misses[0];
    askCoach.push({ context: `${m.detail} threw your eating ${m.count} time${m.count === 1 ? "" : "s"}.`, prompt: `${m.detail} is what knocks my eating off track. What's a realistic fix for next week?` });
  }
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
    discipline: row.discipline, disciplineBlocker: row.discipline_blocker, exerciseDetail: row.exercise_detail, nutritionDetail: row.nutrition_detail, control: row.control,
    desire: row.desire, stress: row.stress,
    healthScore: row.health_score, personalScore: row.personal_score, overallScore: row.overall_score,
    notes: row.notes, tomorrowFocus: row.tomorrow_focus,
    weightKg: row.weight_kg, alcoholDrinks: row.alcohol_drinks,
  };
}
