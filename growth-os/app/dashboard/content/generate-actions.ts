"use server";

// On-demand content generation for the Content dashboard.
// Mirrors createContent in ./actions.ts: inserts brand-aligned Instagram
// drafts into `content`, then bridges each into `scheduled_posts` so they
// surface in /dashboard/approvals. The daily enqueue-approvals cron remains a
// backstop. Nothing is published here - the owner-approval gate is preserved.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import { generateDrafts } from "@/lib/content/generate";

type ActionResult = { ok: boolean; error?: string; created?: number };

const countSchema = z.coerce.number().int().min(1).max(10).default(3);

// Derive the on-image hook from the caption, mirroring actions.ts/og-post:
// first sentence, capped at 100 chars.
function deriveHook(caption: string): string {
const firstSentence = caption.split(/(?<=[.!?])\s/)[0] ?? caption;
return firstSentence.slice(0, 100);
}

export async function generateContent(formData: FormData): Promise<ActionResult> {
const ownerId = await getUserId();
if (!ownerId) return { ok: false, error: "Not authenticated" };

const parsed = countSchema.safeParse(formData.get("count") ?? 3);
if (!parsed.success) {
return { ok: false, error: "Invalid count" };
}

const supabase = createClient();
const { data: recentRows } = await supabase
.from("content")
.select("caption")
.eq("owner_id", ownerId)
.order("id", { ascending: false })
.limit(40);
const recentCaptions = (recentRows ?? []).map((r) => r.caption as string).filter(Boolean);
const drafts = await generateDrafts(parsed.data, recentCaptions);
let created = 0;

try {
for (const draft of drafts) {
const { data: inserted, error } = await supabase
.from("content")
.insert({
owner_id: ownerId,
platform: "instagram",
external_id: null,
permalink: null,
caption: draft.caption,
utm_campaign: draft.utm_campaign,
status: "draft",
published_at: null,
})
.select("id")
.single();
if (error) {
console.error("[content:generate:insert]", error);
continue;
}
created += 1;
// Bridge into the approval queue (same path as manual create).
if (inserted?.id) {
const theme = draft.theme === "dark" ? "dark" : "light";
const imageUrl = `/api/og-post?hook=${encodeURIComponent(deriveHook(draft.caption))}&theme=${theme}`;
const { error: schedErr } = await supabase.from("scheduled_posts").insert({
owner_id: ownerId,
content_id: inserted.id,
caption: draft.caption,
image_url: imageUrl,
theme,
status: "draft",
});
if (schedErr) {
// Non-fatal: content row was still created.
console.error("[content:generate:schedule]", schedErr);
}
}
}
} catch (err) {
console.error("[content:generate]", err);
return { ok: false, error: "Could not generate content" };
}

if (created === 0) {
return { ok: false, error: "No drafts were created" };
}

revalidatePath("/dashboard/content");
revalidatePath("/dashboard/approvals");
revalidatePath("/dashboard");
return { ok: true, created };
}

// Form-action adapter: <form action> requires a void-returning signature.
export async function generateContentForm(formData: FormData): Promise<void> {
await generateContent(formData);
}
