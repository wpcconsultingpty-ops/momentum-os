"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import { approveAndPublish } from "../approvals/actions";

type ActionResult = { ok: boolean; error?: string };

const platformEnum = z.enum([
  "instagram",
  "linkedin",
  "tiktok",
  "youtube",
  "other",
]);
const statusEnum = z.enum(["draft", "scheduled", "published", "archived"]);

const createSchema = z.object({
  platform: platformEnum,
  external_id: z.string().trim().optional(),
  permalink: z.string().trim().url().optional().or(z.literal("")),
  caption: z.string().trim().optional(),
  utm_campaign: z.string().trim().optional(),
  status: statusEnum.default("draft"),
});

function optional(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

// Derive the on-image hook from the caption, mirroring the publisher and the
// approvals preview: first sentence, capped at 100 chars (og-post slices to 100).
function deriveHook(caption: string): string {
  const firstSentence = caption.split(/(?<=[.!?])\s/)[0] ?? caption;
  return firstSentence.slice(0, 100);
}

// Form-action adapter: <form action> requires a void-returning signature.
export async function createContentForm(formData: FormData): Promise<void> {
  await createContent(formData);
}

export async function deleteContentForm(formData: FormData): Promise<void> {
  await deleteContent(formData);
}

export async function createContent(formData: FormData): Promise<ActionResult> {
  const ownerId = await getUserId();
  if (!ownerId) return { ok: false, error: "Not authenticated" };
  const parsed = createSchema.safeParse({
    platform: formData.get("platform"),
    external_id: optional(formData.get("external_id")),
    permalink: optional(formData.get("permalink")),
    caption: optional(formData.get("caption")),
    utm_campaign: optional(formData.get("utm_campaign")),
    status: formData.get("status") ?? "draft",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    const supabase = createClient();
    const { data: inserted, error } = await supabase
      .from("content")
      .insert({
        owner_id: ownerId,
        platform: parsed.data.platform,
        external_id: parsed.data.external_id ?? null,
        permalink: parsed.data.permalink || null,
        caption: parsed.data.caption ?? null,
        utm_campaign: parsed.data.utm_campaign ?? null,
        status: parsed.data.status,
        published_at: parsed.data.status === "published" ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (error) throw error;

    // Bridge Instagram drafts into the approval queue so they surface in
    // /dashboard/approvals (which reads scheduled_posts, not content).
    if (
      inserted?.id &&
      parsed.data.platform === "instagram" &&
      parsed.data.status === "draft"
    ) {
      const caption = parsed.data.caption ?? "";
      // image_url is derived from the caption via /api/og-post (hook param).
      // Stored relative; the publisher rebuilds an absolute URL at publish time.
      const imageUrl = `/api/og-post?hook=${encodeURIComponent(deriveHook(caption))}`;
      const { error: schedErr } = await supabase.from("scheduled_posts").insert({
        owner_id: ownerId,
        content_id: inserted.id,
        caption,
        image_url: imageUrl,
        status: "draft",
      });
      if (schedErr) {
        // Non-fatal: the content row was still created successfully.
        console.error("[content:create:schedule]", schedErr);
      }
    }
  } catch (err) {
    console.error("[content:create]", err);
    return { ok: false, error: "Could not create content" };
  }
  revalidatePath("/dashboard/content");
  revalidatePath("/dashboard/approvals");
  revalidatePath("/dashboard");
  return { ok: true };
}

const deleteSchema = z.object({
  id: z.string().uuid(),
});

export async function deleteContent(formData: FormData): Promise<ActionResult> {
  const ownerId = await getUserId();
  if (!ownerId) return { ok: false, error: "Not authenticated" };
  const parsed = deleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("content")
      .delete()
      .eq("id", parsed.data.id)
      .eq("owner_id", ownerId);
    if (error) throw error;
  } catch (err) {
    console.error("[content:delete]", err);
    return { ok: false, error: "Could not delete content" };
  }
  revalidatePath("/dashboard/content");
  revalidatePath("/dashboard");
  return { ok: true };
}

// Approve an Instagram content draft and publish it to Instagram in one step.
// The content table is the read-only ledger, but Instagram drafts created here
// are bridged into scheduled_posts (see createContent). This action resolves
// the linked scheduled_posts row by content_id (owner-scoped via RLS), then
// delegates to the Approvals approveAndPublish flow, which flips the post to
// "approved" and calls the secret-gated /api/ig/publish route server-side.
export async function approveAndPublishContent(
  contentId: string,
): Promise<ActionResult> {
  const ownerId = await getUserId();
  if (!ownerId) return { ok: false, error: "Not authenticated" };
  try {
    const supabase = createClient();
    const { data: post, error } = await supabase
      .from("scheduled_posts")
      .select("id, status")
      .eq("content_id", contentId)
      .eq("owner_id", ownerId)
      .in("status", ["draft", "pending_approval"])
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!post) {
      return {
        ok: false,
        error: "No approvable Instagram post is linked to this content row",
      };
    }
    const result = await approveAndPublish(post.id);
    if (!result.ok) return result;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not publish content",
    };
  }
  revalidatePath("/dashboard/content");
  revalidatePath("/dashboard/approvals");
  return { ok: true };
}
