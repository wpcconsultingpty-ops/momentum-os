// Sunday cron target: for every subscribed user with 7+ days logged,
// generate a brief and queue it in pending_briefs.
//
// Called by Vercel cron once daily. We check each user's local timezone to see
// if it's currently between Sat 22:00 and Sun 10:00 local — that's their window.
// This lets the cron fire hourly-ish while only generating on Sundays per user.

import { getAdminClient } from "./_lib/supabase-admin.js";
import { generateBrief, getStreakStats, rowToEntry } from "./_lib/brief.js";
import { renderBriefEmail } from "./_lib/render-email.js";

function isSundayLocalWindow(tz) {
  // Cron fires once (Sat 21:00 UTC = Sun 7am AEST). We check that in the user's
  // local tz it's currently Saturday evening through Sunday morning — if it's
  // still Friday for them, defer. If it's already Sunday afternoon, skip.
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", hour12: false });
    const parts = fmt.formatToParts(now);
    const wd = parts.find(p => p.type === "weekday")?.value || "";
    const hr = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
    if (wd === "Sun" && hr < 18) return true;      // Sunday before 6pm local
    if (wd === "Sat" && hr >= 20) return true;     // Late Saturday (Australia, NZ)
    return false;
  } catch (e) {
    return false;
  }
}

function unsubscribeUrl(token) {
  const base = process.env.SITE_URL || "https://momentum-os-two.vercel.app";
  return `${base}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

function currentSundayISO() {
  const d = new Date();
  const day = d.getUTCDay();
  if (day !== 0) d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  // Auth: either CRON_SECRET header (Vercel cron) or BRIEF_ADMIN_TOKEN (manual trigger)
  const auth = req.headers["authorization"] || "";
  const cronSecret = process.env.CRON_SECRET;
  const adminToken = process.env.BRIEF_ADMIN_TOKEN;
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const isCron = cronSecret && bearer === cronSecret;
  const isAdmin = adminToken && bearer === adminToken;
  if (!isCron && !isAdmin) return res.status(401).json({ error: "unauthorized" });

  // Optional flags
  const url = new URL(req.url, `http://${req.headers.host}`);
  const force = url.searchParams.get("force") === "1"; // ignore Sun-window check
  const dryRun = url.searchParams.get("dry_run") === "1";
  const onlyUserId = url.searchParams.get("user_id") || null; // debug: single user

  const supa = getAdminClient();

  // Fetch eligible users: subscribed, with >=7 unique days in last 14 days
  const fourteenAgo = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);

  let userQuery = supa
    .from("user_prefs")
    .select("user_id, timezone, brief_subscribed, unsubscribe_token")
    .eq("brief_subscribed", true);
  if (onlyUserId) userQuery = userQuery.eq("user_id", onlyUserId);
  const { data: prefs, error: prefsErr } = await userQuery;
  if (prefsErr) return res.status(500).json({ error: "prefs_query_failed", detail: prefsErr.message });

  const weekOf = currentSundayISO();
  const results = [];

  for (const p of prefs || []) {
    if (!force && !isSundayLocalWindow(p.timezone || "UTC")) {
      results.push({ user_id: p.user_id, skipped: "not_in_local_sunday_window" });
      continue;
    }

    // Already queued this week?
    const { data: existing } = await supa
      .from("pending_briefs")
      .select("id, status")
      .eq("user_id", p.user_id)
      .eq("week_of", weekOf)
      .maybeSingle();
    if (existing) {
      results.push({ user_id: p.user_id, skipped: "already_queued", status: existing.status });
      continue;
    }

    // Fetch entries + email
    const { data: entriesRaw } = await supa
      .from("daily_entries")
      .select("*")
      .eq("user_id", p.user_id)
      .gte("entry_date", fourteenAgo)
      .order("entry_date", { ascending: true });

    const entries = (entriesRaw || []).map(rowToEntry);
    const uniqueDays = new Set(entries.map(e => e.date)).size;
    if (uniqueDays < 7) {
      results.push({ user_id: p.user_id, skipped: `only_${uniqueDays}_days_logged` });
      continue;
    }

    // Fetch user email from auth.users via admin
    const { data: authUser, error: authErr } = await supa.auth.admin.getUserById(p.user_id);
    if (authErr || !authUser?.user?.email) {
      results.push({ user_id: p.user_id, skipped: "no_email" });
      continue;
    }
    const email = authUser.user.email;

    // Generate brief
    const streak = getStreakStats(entries);
    let brief;
    try {
      brief = await generateBrief(entries, streak);
    } catch (e) {
      results.push({ user_id: p.user_id, error: "generate_failed", detail: e.message });
      continue;
    }

    const { html, text } = renderBriefEmail(brief, {
      unsubscribeUrl: unsubscribeUrl(p.unsubscribe_token),
      isSample: false,
    });

    const subject = `The Brief — week of ${new Date(brief.date + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;

    if (dryRun) {
      results.push({ user_id: p.user_id, email, subject, would_queue: true, headline: brief.headline });
      continue;
    }

    const { error: insertErr } = await supa.from("pending_briefs").insert({
      user_id: p.user_id,
      user_email: email,
      week_of: weekOf,
      brief_json: brief,
      rendered_html: html,
      rendered_text: text,
      subject,
      status: "pending",
    });

    if (insertErr) {
      results.push({ user_id: p.user_id, error: "insert_failed", detail: insertErr.message });
    } else {
      results.push({ user_id: p.user_id, email, subject, queued: true });
    }
  }

  return res.status(200).json({ weekOf, total: results.length, results });
}
