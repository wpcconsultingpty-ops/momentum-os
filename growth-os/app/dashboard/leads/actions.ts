"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";

type ActionResult = { ok: boolean; error?: string };

const statusEnum = z.enum([
  "new",
  "qualified",
  "contacted",
  "converted",
  "disqualified",
]);

function optional(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

const createSchema = z.object({
  email: z.string().email().optional(),
  full_name: z.string().trim().optional(),
  source: z.string().trim().optional(),
  utm_campaign: z.string().trim().optional(),
  ig_user_handle: z.string().trim().optional(),
});

// Form-action adapters: <form action> requires a void-returning signature.
export async function createLeadForm(formData: FormData): Promise<void> {
  await createLead(formData);
}

export async function updateLeadStatusForm(formData: FormData): Promise<void> {
  await updateLeadStatus(formData);
}

export async function createLead(formData: FormData): Promise<ActionResult> {
  const ownerId = await getUserId();
  if (!ownerId) return { ok: false, error: "Not authenticated" };

  const parsed = createSchema.safeParse({
    email: optional(formData.get("email")),
    full_name: optional(formData.get("full_name")),
    source: optional(formData.get("source")),
    utm_campaign: optional(formData.get("utm_campaign")),
    ig_user_handle: optional(formData.get("ig_user_handle")),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const supabase = createClient();
    const { error } = await supabase.from("leads").insert({
      owner_id: ownerId,
      email: parsed.data.email ?? null,
      full_name: parsed.data.full_name ?? null,
      source: parsed.data.source ?? "manual",
      utm_campaign: parsed.data.utm_campaign ?? null,
      ig_user_handle: parsed.data.ig_user_handle ?? null,
    });
    if (error) throw error;
  } catch (err) {
    console.error("[leads:create]", err);
    return { ok: false, error: "Could not create lead" };
  }

  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard");
  return { ok: true };
}

const updateStatusSchema = z.object({
  id: z.string().uuid(),
  status: statusEnum,
});

export async function updateLeadStatus(
  formData: FormData,
): Promise<ActionResult> {
  const ownerId = await getUserId();
  if (!ownerId) return { ok: false, error: "Not authenticated" };

  const parsed = updateStatusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return { ok: false, error: "Invalid input" };
  }

  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("leads")
      .update({ status: parsed.data.status })
      .eq("id", parsed.data.id)
      .eq("owner_id", ownerId);
    if (error) throw error;
  } catch (err) {
    console.error("[leads:updateStatus]", err);
    return { ok: false, error: "Could not update lead" };
  }

  revalidatePath("/dashboard/leads");
  return { ok: true };
}
