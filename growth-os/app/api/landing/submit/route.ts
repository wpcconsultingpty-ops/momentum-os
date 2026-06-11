import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const submitSchema = z.object({
  email: z.string().email(),
  full_name: z.string().trim().min(1).optional(),
  ig_user_handle: z.string().trim().min(1).optional(),
  utm_campaign: z.string().optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  hp: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const parsed = submitSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid input" }, { status: 400 });
  }

  const data = parsed.data;

  // Honeypot: bots fill hidden fields. Accept silently without forwarding.
  if (data.hp && data.hp.trim().length > 0) {
    return NextResponse.json({ ok: true });
  }

  const secret = process.env.SURVEY_WEBHOOK_SECRET ?? "";
  if (!secret) {
    console.error("[landing:submit] missing SURVEY_WEBHOOK_SECRET");
    return NextResponse.json({ ok: false, error: "server misconfigured" }, { status: 500 });
  }

  const payload: Record<string, string> = {
    email: data.email,
    source: "landing_page",
  };
  if (data.full_name) payload.full_name = data.full_name;
  if (data.ig_user_handle) {
    payload.ig_user_handle = data.ig_user_handle.replace(/^@/, "");
  }
  if (data.utm_campaign) payload.utm_campaign = data.utm_campaign;
  if (data.utm_source) payload.utm_source = data.utm_source;
  if (data.utm_medium) payload.utm_medium = data.utm_medium;

  const rawBody = JSON.stringify(payload);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  const siteUrl = process.env.SITE_URL ?? "https://momentum-growth-os.vercel.app";

  try {
    const res = await fetch(`${siteUrl}/api/webhooks/survey`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-momentum-signature": `sha256=${signature}`,
        "x-momentum-delivery-id": crypto.randomUUID(),
      },
      body: rawBody,
    });

    if (!res.ok) {
      console.error("[landing:submit] webhook responded", res.status);
      return NextResponse.json({ ok: false, error: "forward failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[landing:submit] forward error", err);
    return NextResponse.json({ ok: false, error: "forward failed" }, { status: 500 });
  }
}
