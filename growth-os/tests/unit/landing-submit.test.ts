import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/landing/submit/route";

const SECRET = "landing-secret";

function expectedSignature(rawBody: string): string {
  return crypto.createHmac("sha256", SECRET).update(rawBody, "utf8").digest("hex");
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/landing/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
  );
}

beforeEach(() => {
  process.env.SURVEY_WEBHOOK_SECRET = SECRET;
  process.env.SITE_URL = "https://example.test";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("landing submit POST", () => {
  it("returns 400 when email is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await post({ full_name: "No Email" });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalid input" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("silently drops when the honeypot field is filled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await post({ email: "bot@spam.com", hp: "i am a bot" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards to the survey webhook with correctly signed headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await post({
      email: "lead@example.com",
      full_name: "Real Lead",
      ig_user_handle: "@cooluser",
      utm_campaign: "spring",
      utm_source: "ig",
      utm_medium: "bio",
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.test/api/webhooks/survey");
    expect(init.method).toBe("POST");

    const rawBody = init.body as string;
    const payload = JSON.parse(rawBody) as Record<string, string>;
    expect(payload.source).toBe("landing_page");
    expect(payload.email).toBe("lead@example.com");
    expect(payload.full_name).toBe("Real Lead");
    // Leading @ is stripped before forwarding.
    expect(payload.ig_user_handle).toBe("cooluser");
    expect(payload.utm_campaign).toBe("spring");

    const headers = init.headers as Record<string, string>;
    expect(headers["x-momentum-signature"]).toBe(`sha256=${expectedSignature(rawBody)}`);
    expect(headers["x-momentum-delivery-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("returns 500 when the downstream webhook fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await post({ email: "lead@example.com" });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "forward failed" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
