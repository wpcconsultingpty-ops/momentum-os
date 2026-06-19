// POST /api/ig/publish
// Publishes an APPROVED scheduled post to Instagram via the Graph API.
//
// Security model:
// - Protected by a shared secret (IG_PUBLISH_SECRET) sent as Bearer token.
// - Uses the service-role Supabase client (bypasses RLS) for status writes.
// - Hard gate: a row will ONLY be published if its status === "approved".
//   This enforces the owner-approval requirement at the server boundary.
//
// On success it also upserts the linked `content` ledger row so the
// Attribution surfaces (UTM campaign, permalink, external id) stay accurate.
//
// Supports two media types via scheduled_posts.media_type:
// - 'IMAGE' (default): single branded image rendered from the caption hook.
// - 'CAROUSEL': 2-10 slides (stored in scheduled_posts.slides) rendered
//   individually and published as one carousel post.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublishSecret } from "@/lib/instagram/env";
import { publishImagePost } from "@/lib/instagram/publish";
import { publishCarouselPost } from "@/lib/instagram/carousel-publish";
import { slideImageUrl, type CarouselSlide } from "@/lib/content/carousel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

export async function POST(req: NextRequest) {
  // 1) Authenticate the caller via shared secret.
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token !== getPublishSecret()) {
    return unauthorized("Forbidden");
  }

  // 2) Parse input.
  let postId: string | undefined;
  try {
    const body = await req.json();
    postId = body?.postId;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!postId) {
    return NextResponse.json({ error: "postId is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 3) Load the post and enforce the approval gate.
  const { data: post, error: loadError } = await supabase
    .from("scheduled_posts")
    .select("id, status, caption, image_url, content_id, utm_campaign, owner_id, theme, media_type, slides")
    .eq("id", postId)
    .single();
  if (loadError || !post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  if (post.status !== "approved") {
    return NextResponse.json(
      { error: `Post is not approved (status: ${post.status})` },
      { status: 409 },
    );
  }

  // 4) Mark as publishing (optimistic lock: only transition from "approved").
  const { data: locked, error: lockError } = await supabase
    .from("scheduled_posts")
    .update({ status: "publishing" })
    .eq("id", postId)
    .eq("status", "approved")
    .select("id")
    .maybeSingle();
  if (lockError || !locked) {
    return NextResponse.json(
      { error: "Post is no longer in an approved state" },
      { status: 409 },
    );
  }

  // 5) Publish via Graph API. Branch on media_type: carousel vs single image.
  try {
    const origin = new URL(req.url).origin;
    const isCarousel = post.media_type === "CAROUSEL";

    let result;
    if (isCarousel) {
      // Carousel: render each stored slide spec into a branded og-post image,
      // then publish them together as one carousel (IG allows 2-10 items).
      const slides = (post.slides ?? []) as CarouselSlide[];
      if (!Array.isArray(slides) || slides.length < 2) {
        throw new Error("Carousel post requires at least 2 slides");
      }
      const imageUrls = slides.map((slide) => slideImageUrl(origin, slide));
      result = await publishCarouselPost({
        imageUrls,
        caption: post.caption,
      });
    } else {
      // Single image: derive a short hook from the first sentence of the caption.
      const firstSentence = (post.caption || "").split(/(?<=[.!?])\s/)[0].trim();
      const hook = (firstSentence || post.caption || "Momentum").slice(0, 160);
      const theme = post.theme === "dark" ? "dark" : "light";
      const ogImageUrl = `${origin}/api/og-post?hook=${encodeURIComponent(hook)}&theme=${theme}`;
      result = await publishImagePost({
        imageUrl: ogImageUrl,
        caption: post.caption,
      });
    }

    const publishedAt = new Date().toISOString();
    await supabase
      .from("scheduled_posts")
      .update({
        status: "published",
        creation_id: result.creationId,
        ig_media_id: result.mediaId,
        permalink: result.permalink,
        published_at: publishedAt,
        error: null,
      })
      .eq("id", postId);

    // 6) Upsert the linked `content` ledger row so Attribution stays accurate.
    // If the scheduled post is already linked to a content row, update it;
    // otherwise insert a new content row and back-link it via content_id.
    const contentRow = {
      owner_id: post.owner_id,
      platform: "instagram",
      external_id: result.mediaId,
      permalink: result.permalink,
      caption: post.caption,
      utm_campaign: post.utm_campaign ?? null,
      status: "published",
      published_at: publishedAt,
    };
    if (post.content_id) {
      await supabase
        .from("content")
        .update(contentRow)
        .eq("id", post.content_id);
    } else {
      const { data: inserted } = await supabase
        .from("content")
        .insert(contentRow)
        .select("id")
        .maybeSingle();
      if (inserted?.id) {
        await supabase
          .from("scheduled_posts")
          .update({ content_id: inserted.id })
          .eq("id", postId);
      }
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown publish error";
    await supabase
      .from("scheduled_posts")
      .update({ status: "failed", error: message })
      .eq("id", postId);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
