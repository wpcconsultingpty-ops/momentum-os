import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyHmacSha256 } from "@/lib/webhooks/verify";
import { markDelivery, recordDelivery } from "@/lib/webhooks/idempotency";
import { resolveOwnerId } from "@/lib/webhooks/resolveOwner";

export const dynamic = "force-dynamic";

// GET: Meta subscription verification handshake.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.INSTAGRAM_VERIFY_TOKEN;

  if (mode === "subscribe" && token && token === verifyToken && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

type IgEngagement = {
  contentExternalId?: string;
  kind: string;
  raw: unknown;
};

function extractEngagements(body: unknown): IgEngagement[] {
  const events: IgEngagement[] = [];
  if (!body || typeof body !== "object") return events;

  const entries = (body as { entry?: unknown }).entry;
  if (!Array.isArray(entries)) return events;

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;

    const changes = (entry as { changes?: unknown }).changes;
    if (Array.isArray(changes)) {
      for (const change of changes) {
        const field = (change as { field?: string }).field ?? "change";
        const value = (change as { value?: Record<string, unknown> }).value;
        const mediaId =
          value && typeof value === "object"
            ? ((value.media_id as string | undefined) ??
              (value.media as { id?: string } | undefined)?.id)
            : undefined;
        events.push({ contentExternalId: mediaId, kind: field, raw: change });
      }
    }

    const messaging = (entry as { messaging?: unknown }).messaging;
    if (Array.isArray(messaging)) {
      for (const message of messaging) {
        events.push({ kind: "message", raw: message });
      }
    }
  }

  return events;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  // Meta does not send a consistent delivery id; the signature is unique
  // per payload and works fine as the idempotency key.
  const deliveryId = signature ?? "";

  const appSecret = process.env.INSTAGRAM_APP_SECRET ?? "";

  if (!verifyHmacSha256(appSecret, rawBody, signature)) {
    console.error("[webhook:instagram] invalid signature");
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const admin = createAdminClient();

  let delivery: { duplicate: boolean };
  try {
    delivery = await recordDelivery(admin, {
      source: "instagram",
      deliveryId,
      signature,
      payload: body,
    });
  } catch (err) {
    console.error("[webhook:instagram] recordDelivery failed", err);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }

  if (delivery.duplicate) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    const ownerId = resolveOwnerId(body);
    const engagements = extractEngagements(body);

    for (const engagement of engagements) {
      let contentId: string | null = null;
      let utmCampaign: string | null = null;

      if (engagement.contentExternalId) {
        const { data: content } = await admin
          .from("content")
          .select("id, utm_campaign")
          .eq("owner_id", ownerId)
          .eq("platform", "instagram")
          .eq("external_id", engagement.contentExternalId)
          .maybeSingle();
        if (content) {
          contentId = content.id;
          utmCampaign = content.utm_campaign;
        }
      }

      const { error } = await admin.from("attribution_events").insert({
        owner_id: ownerId,
        event_type: "ig_engagement",
        source: "instagram",
        content_id: contentId,
        utm_campaign: utmCampaign,
        payload: engagement.raw,
      });
      if (error) throw error;
    }

    await markDelivery(admin, "instagram", deliveryId, "processed");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhook:instagram] processing failed", err);
    await markDelivery(
      admin,
      "instagram",
      deliveryId,
      "failed",
      err instanceof Error ? err.message : "unknown",
    );
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
