// GET/POST /api/cron/sweep-publishing
//
// Recovers scheduled posts that got stuck in the "publishing" state. The
// /api/ig/publish route flips a row to "publishing" (optimistic lock) before
// calling the Instagram Graph API. If that serverless invocation crashes or
// times out before writing a terminal status, the row is orphaned and will
// never publish or fail on its own. This sweep marks any row that has been
// "publishing" longer than the grace period as "failed" so the owner can
// retry from /dashboard/approvals.
//
// Security model (identical to enqueue-approvals):
// - Invoked by Vercel Cron with `Authorization: Bearer ${CRON_SECRET}`.
// - Also accepts IG_PUBLISH_SECRET as a fallback for manual triggering.
// - Uses the service-role Supabase client (bypasses RLS) for the status write.
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

async function sweep() {
  const supabase = createAdminClient();
  const cutoff = stuckCutoffIso(Date.now(), DEFAULT_STUCK_AFTER_MS);

  // Any row still "publishing" whose last update predates the cutoff is stuck.
  const { data: swept, error } = await supabase
    .from("scheduled_posts")
    .update({
      status: "failed",
      error: "Publish timed out (swept by cron); please retry.",
    })
    .eq("status", "publishing")
    .lte("updated_at", cutoff)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, swept: swept?.length ?? 0, cutoff });
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 401 });
  }
  return sweep();
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 401 });
  }
  return sweep();
}
