"use server";

// On-demand CAROUSEL generation for the Content dashboard.
// Mirrors generateContent in ./generate-actions.ts, but produces multi-slide
// carousel drafts: inserts a brand-aligned caption into `content`, builds the
// ordered slide set via buildSlides(), then bridges into `scheduled_posts`
// with media_type 'CAROUSEL' and the slides array so it surfaces in
// /dashboard/approvals. Nothing is published here - the owner-approval gate
// is preserved. The single-image path in generate-actions.ts is untouched.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserId } from "@/lib/auth";
import { generateDrafts } from "@/lib/content/generate";
import { buildSlides, slideImageUrl } from "@/lib/content/carousel";

type ActionResult = { ok: boolean; error?: string; created?: number };

const countSchema = z.coerce.number().int().min(1).max(10).default(3);

// Derive the lead hook from the caption, mirroring generate-actions.ts:
// first sentence, capped at 100 chars. Used as slide 1's headline.
function deriveHook(caption: string): string {
  const firstSentence = caption.split(/(?<=[.!?])\s/)[0] ?? caption;
  return firstSentence.slice(0, 100);
}

export async function generateCarouselDraft(
  formData: FormData,
): Promise<ActionResult> {
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
  const recentCaptions = (recentRows ?? [])
    .map((r) => r.caption as string)
    .filter(Boolean);

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
        console.error("[content:carousel:insert]", error);
        continue;
      }
      created += 1;

      // Bridge into the approval queue as a CAROUSEL draft.
      if (inserted?.id) {
        const theme = draft.theme === "dark" ? "dark" : "light";
        // Build the ordered slide set (hook -> value lines -> CTA). buildSlides
        // clamps to the IG-supported 2-10 range.
        const slides = buildSlides({
          hook: deriveHook(draft.caption),
          body: draft.caption,
          theme,
        });
        // First slide doubles as the approvals thumbnail.
        const imageUrl = slideImageUrl("", slides[0]).replace(/^https?:\/\/[^/]*/, "");
        const { error: schedErr } = await supabase
          .from("scheduled_posts")
          .insert({
            owner_id: ownerId,
            content_id: inserted.id,
            caption: draft.caption,
            image_url: imageUrl,
            theme,
            status: "draft",
            media_type: "CAROUSEL",
            slides,
          });
        if (schedErr) {
          // Non-fatal: content row was still created.
          console.error("[content:carousel:schedule]", schedErr);
        }
      }
    }
  } catch (err) {
    console.error("[content:carousel]", err);
    return { ok: false, error: "Could not generate carousel" };
  }

  if (created === 0) {
    return { ok: false, error: "No carousel drafts were created" };
  }

  revalidatePath("/dashboard/content");
  revalidatePath("/dashboard/approvals");
  revalidatePath("/dashboard");
  return { ok: true, created };
}

// Form-action adapter: <form action> requires a void-returning signature.
export async function generateCarouselDraftForm(
  formData: FormData,
): Promise<void> {
  await generateCarouselDraft(formData);
}
