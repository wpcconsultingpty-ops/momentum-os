// Client-called endpoint: takes entries + streak, returns a brief.
// Shared logic lives in _lib/brief.js so the Sunday cron can reuse it.
import { generateBrief } from "./_lib/brief.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  try {
    const body = typeof req.body === "object" && req.body ? req.body : {};
    const entries = Array.isArray(body.entries) ? body.entries : [];
    const rawStreak = (body.streak && typeof body.streak === "object") ? body.streak : {};
    const streak = {
      current: Number(rawStreak.current) || 0,
      longest: Number(rawStreak.longest) || 0,
      freezeUsedThisWeek: !!rawStreak.freezeUsedThisWeek,
    };

    const brief = await generateBrief(entries, streak);
    return res.status(200).json(brief);
  } catch (err) {
    console.error("[debrief] handler failed", err);
    return res.status(500).json({ error: "debrief_failed", message: err && err.message ? err.message : "unknown" });
  }
}
