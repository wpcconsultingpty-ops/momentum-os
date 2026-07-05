// One-click unsubscribe. Link in every brief footer.
export default async function handler(req, res) {
  try {
    const { getAdminClient } = await import("./_lib/supabase-admin.js");
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get("token");
    if (!token) return res.status(400).send("Missing token.");

    const supa = getAdminClient();
    const { data, error } = await supa
      .from("user_prefs")
      .update({ brief_subscribed: false })
      .eq("unsubscribe_token", token)
      .select("user_id")
      .maybeSingle();

    if (error) {
      console.error("[unsubscribe] update failed", error);
      return res.status(500).send("Something went wrong. Reply to this email and we'll fix it manually.");
    }

    if (!data) return res.status(404).send("Unsubscribe link not recognised.");

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Unsubscribed</title><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f7f8f4;padding:60px 24px;margin:0;color:#2f3a31;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:36px;border:1px solid #e6ebe0;text-align:center;">
<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:#0c6a6f;font-weight:700;">Momentum OS</div>
<h1 style="font-size:22px;margin:12px 0 8px;">You're unsubscribed.</h1>
<p style="font-size:15px;line-height:1.55;color:#6e776f;margin:0 0 24px;">No more Sunday briefs. You can re-enable them anytime in Settings.</p>
<a href="${process.env.SITE_URL || 'https://momentum-os-two.vercel.app'}" style="display:inline-block;padding:10px 20px;background:#0c6a6f;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Open Momentum</a>
</div></body></html>`);
  } catch (e) {
    console.error("[unsubscribe] FATAL", e);
    return res.status(500).json({
      error: "unsubscribe_crashed",
      message: String(e && e.message || e),
      stack: String(e && e.stack || "").split("\n").slice(0, 8),
    });
  }
}
