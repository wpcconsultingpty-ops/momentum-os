import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { sha256Hex, verifyHmacSha256 } from "@/lib/webhooks/verify";
import { markDelivery, recordDelivery } from "@/lib/webhooks/idempotency";
import { resolveOwnerId } from "@/lib/webhooks/resolveOwner";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const trialSchema = z.object({
  event: z.enum(["trial_start", "trial_convert"]),
  email: z.string().email(),
  plan: z.string().optional(),
  lead_id: z.string().uuid().optional(),
  started_at: z.string().datetime().optional(),
  converted_to_paid: z.boolean().optional(),
  utm_campaign: z.string().optional(),
});

type TrialPayload = z.infer<typeof trialSchema>;

async function findOrCreateLead(
  admin: SupabaseClient,
  ownerId: string,
  data: TrialPayload,
): Promise<{ id: string; attributed_content_id: string | null }> {
  if (data.lead_id) {
    const { data: byId } = await admin
      .from("leads")
      .select("id, attributed_content_id")
      .eq("owner_id", ownerId)
      .eq("id", data.lead_id)
      .maybeSingle();
    if (byId) return byId;
  }

  const { data: byEmail } = await admin
    .from("leads")
    .select("id, attributed_content_id")
    .eq("owner_id", ownerId)
    .eq("email", data.email)
    .maybeSingle();
  if (byEmail) return byEmail;

  const { data: created, error } = await admin
    .from("leads")
    .insert({
      owner_id: ownerId,
      email: data.email,
      source: "trial",
      utm_campaign: data.utm_campaign ?? null,
    })
    .select("id, attributed_content_id")
    .single();
  if (error) throw error;
  return created;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-momentum-signature");
  const deliveryId =
    req.headers.get("x-momentum-delivery-id") ?? sha256Hex(rawBody);

  const secret = process.env.TRIAL_WEBHOOK_SECRET ?? "";

  if (!verifyHmacSha256(secret, rawBody, signature)) {
    console.error("[webhook:trial] invalid signature");
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
      source: "trial",
      deliveryId,
      signature,
      payload: json,
    });
  } catch (err) {
    console.error("[webhook:trial] recordDelivery failed", err);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }

  if (delivery.duplicate) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const parsed = trialSchema.safeParse(json);
  if (!parsed.success) {
    await markDelivery(
      admin,
      "trial",
      deliveryId,
      "failed",
      parsed.error.issues[0]?.message ?? "schema error",
    );
    return NextResponse.json({ ok: false, error: "schema error" }, { status: 400 });
  }

  try {
    const ownerId = resolveOwnerId(json);
    const data = parsed.data;
    const lead = await findOrCreateLead(admin, ownerId, data);

    if (data.event === "trial_start") {
      const { data: trial, error: trialError } = await admin
        .from("trials")
        .insert({
          owner_id: ownerId,
          lead_id: lead.id,
          email: data.email,
          plan: data.plan ?? null,
          started_at: data.started_at ?? new Date().toISOString(),
          attributed_content_id: lead.attributed_content_id,
        })
        .select("id")
        .single();
      if (trialError) throw trialError;

      const { error: eventError } = await admin
        .from("attribution_events")
        .insert({
          owner_id: ownerId,
          event_type: "trial_start",
          source: "trial",
          content_id: lead.attributed_content_id,
          lead_id: lead.id,
          trial_id: trial.id,
          utm_campaign: data.utm_campaign ?? null,
          payload: json,
        });
      if (eventError) throw eventError;
    } else {
      const { data: latestTrial } = await admin
        .from("trials")
        .select("id, attributed_content_id")
        .eq("owner_id", ownerId)
        .eq("email", data.email)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestTrial) {
        const { error: updateError } = await admin
          .from("trials")
          .update({
            converted_to_paid: true,
            ended_at: new Date().toISOString(),
          })
          .eq("id", latestTrial.id);
        if (updateError) throw updateError;
      }

      const { error: eventError } = await admin
        .from("attribution_events")
        .insert({
          owner_id: ownerId,
          event_type: "trial_convert",
          source: "trial",
          content_id: latestTrial?.attributed_content_id ?? null,
          lead_id: lead.id,
          trial_id: latestTrial?.id ?? null,
          utm_campaign: data.utm_campaign ?? null,
          payload: json,
        });
      if (eventError) throw eventError;
    }

    await markDelivery(admin, "trial", deliveryId, "processed");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhook:trial] processing failed", err);
    await markDelivery(
      admin,
      "trial",
      deliveryId,
      "failed",
      err instanceof Error ? err.message : "unknown",
    );
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
