// GET/POST /api/cron/enqueue-approvals
//
// Promotes Instagram content drafts into the Approvals queue. For every
// `content` row with platform = 'instagram' and status = 'draft' that does not
// yet have a linked `scheduled_posts` row, this inserts a scheduled_posts row
// in `pending_approval` status so it appears on /dashboard/approvals for the
// owner to approve or reject. Nothing is published here — the owner-approval
// gate at /api/ig/publish is preserved.
//
// Security model:
// - Invoked by Vercel Cron, which sends `Authorization: Bearer ${CRON_SECRET}`
//   when the CRON_SECRET env var is set. We also accept IG_PUBLISH_SECRET as a
//   fallback for manual/server-side triggering. No secrets are ever exposed to
//   the browser.
// - Uses the service-role Supabase client (bypasses RLS) for the cross-row
//   read + insert, scoped strictly to the owner_id carried on each draft.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_STUCK_AFTER_MS, stuckCutoffIso } from "@/lib/approvals/sweep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const cronSecret = process.env.CRON_SECRET;
  const publishSecret = process.env.IG_PUBLISH_SECRET;
  if (cronSecret && token === cronSecret) return true;
  if (publishSecret && token === publishSecret) return true;
  return false;
}

// Derive the on-image hook the same way the Approvals preview does: first
// sentence of the caption, capped at 160 chars, rendered via /api/og-post.
function previewImage(caption: string): string {
  const firstSentence = (caption || "").split(/(?<=[.!?])\s/)[0].trim();
  const hook = (firstSentence || caption || "Momentum").slice(0, 160);
  return `/api/og-post?hook=${encodeURIComponent(hook)}`;
}

// Make sure every queued post ends with a clear call-to-action. Upstream
// drafts should already include one, but this is a safety net so future posts
// never reach the queue without a CTA. If the caption has no DM/Comment prompt,
// we append one derived from the utm_campaign keyword (or a generic fallback).
function ctaKeyword(campaign: string | null): string {
const slug = (campaign || "").toLowerCase();
if (slug.includes("journal")) return "JOURNAL";
if (slug.includes("dashboard")) return "DASHBOARD";
if (slug.includes("coach")) return "COACH";
if (slug.includes("streak")) return "STREAK";
if (slug.includes("trend") || slug.includes("weekly")) return "TREND";
if (slug.includes("health")) return "HEALTH";
if (slug.includes("origin")) return "ORIGIN";
if (slug.includes("busy")) return "BUSY";
if (slug.includes("reset")) return "RESET";
return "MOMENTUM";
}

function ensureCta(caption: string, campaign: string | null): string {
const text = (caption || "").trim();
// Already has a DM/Comment-style CTA somewhere in the copy? Leave it alone.
const hasCta = /\b(DM|Comment|Reply)\b\s+[A-Z][A-Z]+/.test(text);
if (hasCta) return text;
const keyword = ctaKeyword(campaign);
const cta = `DM ${keyword} and I'll send you the details.`;
return text ? `${text}\n\n${cta}` : cta;
}

async function enqueue() {
const supabase = createAdminClient();

const { data: drafts, error: draftsError } = await supabase
.from("content")
.select("id, owner_id, caption, utm_campaign")
.eq("platform", "instagram")
.eq("status", "draft");
if (draftsError) {
return NextResponse.json({ error: draftsError.message }, { status: 500 });
}

const { data: linked, error: linkedError } = await supabase
.from("scheduled_posts")
.select("content_id")
.not("content_id", "is", null);
if (linkedError) {
return NextResponse.json({ error: linkedError.message }, { status: 500 });
}

const alreadyQueued = new Set((linked ?? []).map((r) => r.content_id));
const pending = (drafts ?? []).filter((d) => !alreadyQueued.has(d.id));

if (pending.length === 0) {
return NextResponse.json({ ok: true, enqueued: 0 });
}

const rows = pending.map((d) => {
const caption = ensureCta(d.caption ?? "", d.utm_campaign ?? null);
return {
owner_id: d.owner_id,
content_id: d.id,
caption,
image_url: previewImage(caption),
utm_campaign: d.utm_campaign ?? null,
status: "pending_approval",
};
});

const { data: inserted, error: insertError } = await supabase
.from("scheduled_posts")
.insert(rows)
.select("id");
if (insertError) {
return NextResponse.json({ error: insertError.message }, { status: 500 });
}

return NextResponse.json({ ok: true, enqueued: inserted?.length ?? 0 });
}

// Recover any scheduled_posts stuck in "publishing" past the grace period.
// Runs alongside the daily enqueue so the single Hobby-plan cron slot covers
// both jobs. Best-effort: errors are swallowed so they never block enqueue.
async function sweepStuck(): Promise<void> {
try {
const supabase = createAdminClient();
const cutoff = stuckCutoffIso(Date.now(), DEFAULT_STUCK_AFTER_MS);
await supabase
.from("scheduled_posts")
.update({ status: "failed", error: "Publish timed out (swept by cron); please retry." })
.eq("status", "publishing")
.lte("updated_at", cutoff);
} catch {
// Non-fatal: the dedicated /api/cron/sweep-publishing route can also run.
}
}

export async function GET(req: NextRequest) {
if (!authorized(req)) {
return NextResponse.json({ error: "Forbidden" }, { status: 401 });
}
await sweepStuck();
return enqueue();
}

export async function POST(req: NextRequest) {
if (!authorized(req)) {
return NextResponse.json({ error: "Forbidden" }, { status: 401 });
}
await sweepStuck();
return enqueue();
}
