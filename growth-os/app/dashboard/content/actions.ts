"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";

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
    const { error } = await supabase.from("content").insert({
      owner_id: ownerId,
      platform: parsed.data.platform,
      external_id: parsed.data.external_id ?? null,
      permalink: parsed.data.permalink || null,
      caption: parsed.data.caption ?? null,
      utm_campaign: parsed.data.utm_campaign ?? null,
      status: parsed.data.status,
      published_at: parsed.data.status === "published" ? new Date().toISOString() : null,
    });
    if (error) throw error;
  } catch (err) {
    console.error("[content:create]", err);
    return { ok: false, error: "Could not create content" };
  }

  revalidatePath("/dashboard/content");
  revalidatePath("/dashboard");
  return { ok: true };
}

const updateSchema = z.object({
  id: z.string().uuid(),
  caption: z.string().trim().optional(),
  utm_campaign: z.string().trim().optional(),
  status: statusEnum,
});

export async function updateContent(formData: FormData): Promise<ActionResult> {
  const ownerId = await getUserId();
  if (!ownerId) return { ok: false, error: "Not authenticated" };

  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    caption: optional(formData.get("caption")),
    utm_campaign: optional(formData.get("utm_campaign")),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("content")
      .update({
        caption: parsed.data.caption ?? null,
        utm_campaign: parsed.data.utm_campaign ?? null,
        status: parsed.data.status,
      })
      .eq("id", parsed.data.id)
      .eq("owner_id", ownerId);
    if (error) throw error;
  } catch (err) {
    console.error("[content:update]", err);
    return { ok: false, error: "Could not update content" };
  }

  revalidatePath("/dashboard/content");
  return { ok: true };
}

const deleteSchema = z.object({ id: z.string().uuid() });

export async function deleteContent(formData: FormData): Promise<ActionResult> {
  const ownerId = await getUserId();
  if (!ownerId) return { ok: false, error: "Not authenticated" };

  const parsed = deleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid id" };

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
