// Approvals dashboard: lists the owner's scheduled Instagram posts and lets
// them approve, reject, or approve & publish. Data is read with the
// RLS-respecting SSR client, so a user only ever sees their own rows.
import { createClient } from "@/lib/supabase/server";
import { PostActions } from "./PostActions";

export const dynamic = "force-dynamic";

interface ScheduledPost {
id: string;
caption: string;
image_url: string;
status: string;
permalink: string | null;
error: string | null;
created_at: string;
}

const PENDING = new Set(["draft", "pending_approval"]);

// Mirror the publisher's logic: derive the on-image hook from the caption
// (first sentence, capped at 160 chars) and render it via /api/og-post so the
// preview matches exactly what gets published to Instagram.
function previewImage(post: ScheduledPost): string {
const firstSentence = (post.caption || "").split(/(?<=[.!?])\s/)[0].trim();
const hook = (firstSentence || post.caption || "Momentum").slice(0, 160);
return `/api/og-post?hook=${encodeURIComponent(hook)}`;
}

export default async function ApprovalsPage() {
const supabase = createClient();
const {
data: { user },
} = await supabase.auth.getUser();

if (!user) {
return (
<main style={{ padding: 24 }}>
<h1>Approvals</h1>
<p>Please sign in to review scheduled posts.</p>
</main>
);
}

const { data, error } = await supabase
.from("scheduled_posts")
.select("id, caption, image_url, status, permalink, error, created_at")
.order("created_at", { ascending: false });

const posts = (data ?? []) as ScheduledPost[];

return (
<main style={{ padding: 24, maxWidth: 880, margin: "0 auto" }}>
<h1 style={{ marginBottom: 4 }}>Instagram Approvals</h1>
<p style={{ color: "#57606a", marginTop: 0 }}>
Review AI-drafted posts before they publish. Nothing goes live without your approval.
</p>

{error && (
<p style={{ color: "#cf222e" }}>Failed to load posts: {error.message}</p>
)}

{posts.length === 0 && !error && (
<p style={{ color: "#57606a" }}>No scheduled posts yet.</p>
)}

<ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 16 }}>
{posts.map((post) => (
<li
key={post.id}
style={{ border: "1px solid #d0d7de", borderRadius: 8, padding: 16, display: "flex", gap: 16 }}
>
{/* eslint-disable-next-line @next/next/no-img-element */}
<img
src={previewImage(post)}
alt=""
width={96}
height={96}
style={{ objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
/>
<div style={{ flex: 1 }}>
<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
<span style={{ fontSize: 12, textTransform: "uppercase", color: "#57606a" }}>{post.status}</span>
{post.permalink && (
<a href={post.permalink} target="_blank" rel="noreferrer">View on Instagram</a>
)}
</div>
<p style={{ margin: 0 }}>{post.caption}</p>
{post.error && (
<p style={{ color: "#cf222e", marginTop: 8 }}>Error: {post.error}</p>
)}
{PENDING.has(post.status) && <PostActions id={post.id} />}
</div>
</li>
))}
</ul>
</main>
);
}
