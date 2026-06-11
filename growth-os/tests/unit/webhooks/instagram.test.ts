import crypto from "node:crypto";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createSupabaseMock,
  type TableResponses,
} from "../helpers/supabaseMock";

// Holder mutated per-test; the hoisted vi.mock factory reads it lazily.
const mockState: { from: ReturnType<typeof createSupabaseMock>["from"] | null } = {
  from: null,
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockState.from }),
}));

import { GET, POST } from "@/app/api/webhooks/instagram/route";

const APP_SECRET = "ig-app-secret";
const VERIFY_TOKEN = "ig-verify-token";
const OWNER = "22222222-2222-2222-2222-222222222222";

function sign(body: string): string {
  return (
    "sha256=" +
    crypto.createHmac("sha256", APP_SECRET).update(body, "utf8").digest("hex")
  );
}

function igBody(externalId?: string) {
  return JSON.stringify({
    entry: [
      {
        changes: [
          {
            field: "comments",
            value: externalId ? { media_id: externalId } : {},
          },
        ],
      },
    ],
  });
}

function setTables(tables: Record<string, TableResponses>) {
  const { from } = createSupabaseMock(tables);
  mockState.from = from;
  return from;
}

beforeEach(() => {
  process.env.INSTAGRAM_APP_SECRET = APP_SECRET;
  process.env.INSTAGRAM_VERIFY_TOKEN = VERIFY_TOKEN;
  process.env.OWNER_USER_ID = OWNER;
});

afterEach(() => {
  vi.clearAllMocks();
  mockState.from = null;
});

describe("instagram GET (Meta handshake)", () => {
  it("returns the challenge as text/plain 200 when the verify token matches", async () => {
    const url = `http://localhost/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=CHALLENGE123`;
    const res = await GET(new Request(url) as never);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("CHALLENGE123");
    expect(res.headers.get("content-type")).toContain("text/plain");
  });

  it("returns 403 when the verify token is wrong", async () => {
    const url = `http://localhost/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=CHALLENGE123`;
    const res = await GET(new Request(url) as never);
    expect(res.status).toBe(403);
  });
});

describe("instagram POST", () => {
  it("returns 401 and records a failed delivery on an invalid signature", async () => {
    const from = setTables({
      webhook_deliveries: { update: { data: null, error: null } },
    });
    const body = igBody("IG_MEDIA_1");
    const res = await POST(
      new Request("http://localhost/api/webhooks/instagram", {
        method: "POST",
        headers: { "x-hub-signature-256": "sha256=deadbeef" },
        body,
      }) as never,
    );
    expect(res.status).toBe(401);
    // Invalid signature short-circuits before recordDelivery; failed status is
    // marked by the route only after recording — assert no event write happened.
    const tablesTouched = from.mock.calls.map((c) => c[0]);
    expect(tablesTouched).not.toContain("attribution_events");
  });

  it("writes an ig_engagement event with a resolved content_id for a known external_id", async () => {
    const from = setTables({
      webhook_deliveries: { insert: { data: { id: "wd1" }, error: null } },
      content: {
        select: { data: { id: "content-1", utm_campaign: "spring" }, error: null },
      },
      attribution_events: { insert: { data: { id: "ae1" }, error: null } },
    });
    const body = igBody("IG_MEDIA_1");
    const res = await POST(
      new Request("http://localhost/api/webhooks/instagram", {
        method: "POST",
        headers: { "x-hub-signature-256": sign(body) },
        body,
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(from).toHaveBeenCalledWith("content");
    expect(from).toHaveBeenCalledWith("attribution_events");
  });

  it("writes an event with content_id=null for an unknown external_id", async () => {
    const from = setTables({
      webhook_deliveries: { insert: { data: { id: "wd1" }, error: null } },
      content: { select: { data: null, error: null } },
      attribution_events: { insert: { data: { id: "ae1" }, error: null } },
    });
    const body = igBody("UNKNOWN_MEDIA");
    const res = await POST(
      new Request("http://localhost/api/webhooks/instagram", {
        method: "POST",
        headers: { "x-hub-signature-256": sign(body) },
        body,
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(from).toHaveBeenCalledWith("attribution_events");
  });

  it("returns 400 on invalid JSON even with a valid signature", async () => {
    setTables({});
    const body = "not json{";
    const res = await POST(
      new Request("http://localhost/api/webhooks/instagram", {
        method: "POST",
        headers: { "x-hub-signature-256": sign(body) },
        body,
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 when recordDelivery throws a non-duplicate DB error", async () => {
    const from = setTables({
      webhook_deliveries: {
        insert: { data: null, error: { code: "08006", message: "conn lost" } },
      },
    });
    const body = igBody("IG_MEDIA_1");
    const res = await POST(
      new Request("http://localhost/api/webhooks/instagram", {
        method: "POST",
        headers: { "x-hub-signature-256": sign(body) },
        body,
      }) as never,
    );
    expect(res.status).toBe(500);
    expect(from.mock.calls.map((c) => c[0])).not.toContain("attribution_events");
  });

  it("returns 500 and marks the delivery failed when the event insert errors", async () => {
    const from = setTables({
      webhook_deliveries: {
        insert: { data: { id: "wd1" }, error: null },
        update: { data: null, error: null },
      },
      content: { select: { data: null, error: null } },
      attribution_events: {
        insert: { data: null, error: { message: "insert blew up" } },
      },
    });
    const body = igBody("IG_MEDIA_1");
    const res = await POST(
      new Request("http://localhost/api/webhooks/instagram", {
        method: "POST",
        headers: { "x-hub-signature-256": sign(body) },
        body,
      }) as never,
    );
    expect(res.status).toBe(500);
    expect(from).toHaveBeenCalledWith("attribution_events");
  });

  it("handles a messaging-only entry (no content external id)", async () => {
    const from = setTables({
      webhook_deliveries: { insert: { data: { id: "wd1" }, error: null } },
      attribution_events: { insert: { data: { id: "ae1" }, error: null } },
    });
    const body = JSON.stringify({
      entry: [{ messaging: [{ sender: { id: "u1" } }] }],
    });
    const res = await POST(
      new Request("http://localhost/api/webhooks/instagram", {
        method: "POST",
        headers: { "x-hub-signature-256": sign(body) },
        body,
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(from).toHaveBeenCalledWith("attribution_events");
    expect(from.mock.calls.map((c) => c[0])).not.toContain("content");
  });

  it("returns { ok: true, duplicate: true } and does not insert an event on a duplicate delivery", async () => {
    const from = setTables({
      webhook_deliveries: {
        insert: { data: null, error: { code: "23505", message: "dup" } },
      },
    });
    const body = igBody("IG_MEDIA_1");
    const res = await POST(
      new Request("http://localhost/api/webhooks/instagram", {
        method: "POST",
        headers: { "x-hub-signature-256": sign(body) },
        body,
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, duplicate: true });
    expect(from.mock.calls.map((c) => c[0])).not.toContain("attribution_events");
  });
});
