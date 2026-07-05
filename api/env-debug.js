export default function handler(req, res) {
  const token = new URL(req.url, `http://${req.headers.host}`).searchParams.get("token");
  if (token !== process.env.BRIEF_ADMIN_TOKEN) return res.status(403).json({ error: "forbidden" });
  const keys = Object.keys(process.env).filter(k =>
    k.startsWith("SUPABASE") || k.startsWith("NEXT_PUBLIC") || k === "CRON_SECRET" || k === "BRIEF_ADMIN_TOKEN" || k === "SITE_URL" || k === "OPENAI_API_KEY" || k === "NODE_VERSION" || k === "VERCEL_ENV"
  ).sort();
  const out = {};
  for (const k of keys) {
    const v = process.env[k] || "";
    out[k] = v ? `len=${v.length}` : "(empty)";
  }
  return res.status(200).json({ node: process.version, keys: out });
}
