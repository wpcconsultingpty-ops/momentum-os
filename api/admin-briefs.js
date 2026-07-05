// Admin endpoint for the /admin/briefs page.
// GET  ?token=...              -> list pending briefs
// POST { token, action: 'mark_sent', id }  -> mark a brief as sent
// POST { token, action: 'skip', id }       -> mark as skipped
// POST { token, action: 'preview', id }    -> return html for preview iframe
//
// The actual send happens via the Outlook connector (invoked by Russell from
// the Perplexity chat), not from this endpoint — Outlook has no server API.

import { getAdminClient } from "./_lib/supabase-admin.js";

function verifyToken(req) {
  const token = (req.method === "GET")
    ? new URL(req.url, `http://${req.headers.host}`).searchParams.get("token")
    : (req.body && req.body.token);
  return token && token === process.env.BRIEF_ADMIN_TOKEN;
}

export default async function handler(req, res) {
  if (!verifyToken(req)) return res.status(401).json({ error: "unauthorized" });
  const supa = getAdminClient();

  if (req.method === "GET") {
    const { data, error } = await supa
      .from("pending_briefs")
      .select("id, user_id, user_email, week_of, subject, status, sent_at, error, created_at, brief_json")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ briefs: data || [] });
  }

  if (req.method === "POST") {
    const body = typeof req.body === "object" && req.body ? req.body : {};
    const action = body.action;
    const id = body.id;
    if (!action || !id) return res.status(400).json({ error: "missing action or id" });

    if (action === "preview") {
      const { data, error } = await supa
        .from("pending_briefs")
        .select("rendered_html, rendered_text, subject, user_email")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) return res.status(404).json({ error: "not_found" });
      return res.status(200).json(data);
    }

    if (action === "mark_sent") {
      const { error } = await supa
        .from("pending_briefs")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (action === "skip") {
      const { error } = await supa
        .from("pending_briefs")
        .update({ status: "skipped" })
        .eq("id", id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "unknown action" });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "method_not_allowed" });
}
