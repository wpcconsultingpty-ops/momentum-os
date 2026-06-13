// POST /api/ig/publish
// Publishes an APPROVED scheduled post to Instagram via the Graph API.
//
// Security model:
//  - Protected by a shared secret (IG_PUBLISH_SECRET) sent as Bearer token.
//  - Uses the service-role Supabase client (bypasses RLS) for status writes.
//  - Hard gate: a row will ONLY be published if its status === "approved".
//    This enforces the owner-approval requirement at the server boundary.
//
// This route never publishes on its own; it must be invoked with a postId
// for a row the owner has already approved in the Approvals dashboard.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublishSecret } from "@/lib/instagram/env";
import { publishImagePost } from "@/lib/instagram/publish";

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
.select("id, status, caption, image_url")
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

// 5) Publish via Graph API (container -> publish -> permalink).
try {
      // Derive a short hook from the first sentence of the caption for the on-image text.
    const firstSentence = (post.caption || "").split(/(?<=[.!?])\s/)[0].trim();
    const hook = (firstSentence || post.caption || "Momentum").slice(0, 160);
    // Render the branded text-on-image via our og-post route (absolute URL so IG can fetch it).
    const origin = new URL(req.url).origin;
    const ogImageUrl = `${origin}/api/og-post?hook=${encodeURIComponent(hook)}`;
const result = await publishImagePost({
            imageUrl: ogImageUrl,
      caption: post.caption,
});

await supabase
.from("scheduled_posts")
.update({
status: "published",
creation_id: result.creationId,
ig_media_id: result.mediaId,
permalink: result.permalink,
published_at: new Date().toISOString(),
error: null,
})
.eq("id", postId);

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
