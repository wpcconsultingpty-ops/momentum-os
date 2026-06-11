import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { sha256Hex, verifyHmacSha256 } from "@/lib/webhooks/verify";
import { markDelivery, recordDelivery } from "@/lib/webhooks/idempotency";
import { resolveOwnerId } from "@/lib/webhooks/resolveOwner";

export const dynamic = "force-dynamic";

const surveySchema = z.object({
  email: z.string().email(),
  full_name: z.string().optional(),
  ig_user_handle: z.string().optional(),
  ig_user_id: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  content_external_id: z.string().optional(),
  answers: z.record(z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-momentum-signature");
  const deliveryId =
    req.headers.get("x-momentum-delivery-id") ?? sha256Hex(rawBody);

  const secret = process.env.SURVEY_WEBHOOK_SECRET ?? "";

  if (!verifyHmacSha256(secret, rawBody, signature)) {
    console.error("[webhook:survey] invalid signature");
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const admin = createAdminClient();

  let delivery: { duplicate: boolean };
  try {
    delivery = await recordDelivery(admin, {
      source: "survey",
      deliveryId,
      signature,
      payload: json,
    });
  } catch (err) {
    console.error("[webhook:survey] recordDelivery failed", err);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }

  if (delivery.duplicate) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const parsed = surveySchema.safeParse(json);
  if (!parsed.success) {
    await markDelivery(
      admin,
      "survey",
      deliveryId,
      "failed",
      parsed.error.issues[0]?.message ?? "schema error",
    );
    return NextResponse.json({ ok: false, error: "schema error" }, { status: 400 });
  }

  try {
    const ownerId = resolveOwnerId(json);
    const data = parsed.data;

    let contentId: string | null = null;
    if (data.content_external_id) {
      const { data: content } = await admin
        .from("content")
        .select("id")
        .eq("owner_id", ownerId)
        .eq("external_id", data.content_external_id)
        .maybeSingle();
      contentId = content?.id ?? null;
    }

    const { data: lead, error: leadError } = await admin
      .from("leads")
      .upsert(
        {
          owner_id: ownerId,
          email: data.email,
          full_name: data.full_name ?? null,
          source: "survey",
          utm_campaign: data.utm_campaign ?? null,
          utm_source: data.utm_source ?? null,
          utm_medium: data.utm_medium ?? null,
          ig_user_handle: data.ig_user_handle ?? null,
          ig_user_id: data.ig_user_id ?? null,
          attributed_content_id: contentId,
        },
        { onConflict: "owner_id,email" },
      )
      .select("id")
      .single();
    if (leadError) throw leadError;

    const { error: eventError } = await admin
      .from("attribution_events")
      .insert({
        owner_id: ownerId,
        event_type: "survey_submit",
        source: "survey",
        content_id: contentId,
        lead_id: lead.id,
        utm_campaign: data.utm_campaign ?? null,
        payload: json,
      });
    if (eventError) throw eventError;

    await markDelivery(admin, "survey", deliveryId, "processed");
    return NextResponse.json({ ok: true, lead_id: lead.id });
  } catch (err) {
    console.error("[webhook:survey] processing failed", err);
    await markDelivery(
      admin,
      "survey",
      deliveryId,
      "failed",
      err instanceof Error ? err.message : "unknown",
    );
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
