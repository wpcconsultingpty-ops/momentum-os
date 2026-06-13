// POST /api/generate
// Generates an AI Instagram caption and creates a DRAFT in `content` plus a
// matching DRAFT in `scheduled_posts` so it flows into the Approvals queue.
//
// Security model:
// - Protected by a shared secret (GENERATE_SECRET) sent as a Bearer token,
//   mirroring the /api/ig/publish route. Uses the service-role Supabase client.
// - Never publishes to Instagram; the human Approvals gate still applies.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateCaption } from "@/lib/instagram/caption";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  owner_id: z.string().uuid(),
  topic: z.string().trim().min(1),
  tone: z.string().trim().optional(),
  hashtags: z.array(z.string().trim()).optional(),
  utm_campaign: z.string().trim().optional(),
});

// Derive the on-image hook from the caption: first sentence, capped at 100 chars
// (mirrors the content server action and the og-post preview).
function deriveHook(caption: string): string {
  const firstSentence = caption.split(/(?<=[.!?])\s/)[0] ?? caption;
  return firstSentence.slice(0, 100);
}

export async function POST(req: NextRequest) {
  const secret = process.env.GENERATE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { owner_id, topic, tone, hashtags, utm_campaign } = parsed.data;

  let caption: string;
  try {
    caption = await generateCaption({ topic, tone, hashtags });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Caption generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const supabase = createAdminClient();

  const { data: inserted, error: contentErr } = await supabase
    .from("content")
    .insert({
      owner_id,
      platform: "instagram",
      caption,
      utm_campaign: utm_campaign ?? null,
      status: "draft",
    })
    .select("id")
    .single();

  if (contentErr || !inserted) {
    return NextResponse.json(
      { error: contentErr?.message ?? "Failed to create content" },
      { status: 500 },
    );
  }

  const { data: sched, error: schedErr } = await supabase
    .from("scheduled_posts")
    .insert({
      owner_id,
      content_id: inserted.id,
      caption,
      image_url: `/api/og-post?hook=${encodeURIComponent(deriveHook(caption))}`,
      utm_campaign: utm_campaign ?? null,
      status: "draft",
    })
    .select("id")
    .single();

  // Failure to create the scheduled row is non-fatal; the content draft exists.
  if (schedErr) {
    return NextResponse.json(
      { content_id: inserted.id, scheduled_post_id: null, caption, warning: schedErr.message },
      { status: 207 },
    );
  }

  return NextResponse.json(
    { content_id: inserted.id, scheduled_post_id: sched?.id ?? null, caption },
    { status: 201 },
  );
}
