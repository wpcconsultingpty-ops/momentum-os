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

const mockState: { from: ReturnType<typeof createSupabaseMock>["from"] | null } = {
  from: null,
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockState.from }),
}));

import { POST } from "@/app/api/webhooks/survey/route";

const SECRET = "survey-secret";
const OWNER = "33333333-3333-3333-3333-333333333333";

function sign(body: string): string {
  return crypto.createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
}

function setTables(tables: Record<string, TableResponses>) {
  const { from } = createSupabaseMock(tables);
  mockState.from = from;
  return from;
}

function post(body: string, headers: Record<string, string>) {
  return POST(
    new Request("http://localhost/api/webhooks/survey", {
      method: "POST",
      headers,
      body,
    }) as never,
  );
}

beforeEach(() => {
  process.env.SURVEY_WEBHOOK_SECRET = SECRET;
  process.env.OWNER_USER_ID = OWNER;
});

afterEach(() => {
  vi.clearAllMocks();
  mockState.from = null;
});

describe("survey POST", () => {
  it("returns 401 on an invalid signature", async () => {
    setTables({});
    const body = JSON.stringify({ email: "a@b.com" });
    const res = await post(body, {
      "x-momentum-signature": "bad",
      "x-momentum-delivery-id": "s1",
    });
    expect(res.status).toBe(401);
  });

  it("falls back to sha256(body) as the delivery id when the header is missing", async () => {
    const from = setTables({
      webhook_deliveries: { insert: { data: { id: "wd1" }, error: null } },
      content: { select: { data: null, error: null } },
      leads: { upsert: { data: { id: "lead-1" }, error: null } },
      attribution_events: { insert: { data: { id: "ae1" }, error: null } },
    });
    const body = JSON.stringify({ email: "a@b.com" });
    const res = await post(body, { "x-momentum-signature": sign(body) });
    expect(res.status).toBe(200);
    // The insert into webhook_deliveries should carry a 64-hex delivery id.
    const insertCall = from.mock.results.find(
      (_r, i) => from.mock.calls[i][0] === "webhook_deliveries",
    );
    expect(insertCall).toBeTruthy();
    const builder = insertCall!.value as { insert: ReturnType<typeof vi.fn> };
    const inserted = builder.insert.mock.calls[0][0] as { delivery_id: string };
    expect(inserted.delivery_id).toMatch(/^[a-f0-9]{64}$/);
  });

  it("upserts a lead and inserts a survey_submit event with a resolved content_id", async () => {
    const from = setTables({
      webhook_deliveries: { insert: { data: { id: "wd1" }, error: null } },
      content: { select: { data: { id: "content-9" }, error: null } },
      leads: { upsert: { data: { id: "lead-1" }, error: null } },
      attribution_events: { insert: { data: { id: "ae1" }, error: null } },
    });
    const body = JSON.stringify({
      email: "lead@example.com",
      content_external_id: "IG_MEDIA_1",
      utm_campaign: "spring",
    });
    const res = await post(body, {
      "x-momentum-signature": sign(body),
      "x-momentum-delivery-id": "s2",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, lead_id: "lead-1" });
    expect(from).toHaveBeenCalledWith("content");
    expect(from).toHaveBeenCalledWith("leads");
    expect(from).toHaveBeenCalledWith("attribution_events");

    // event row carries the resolved content_id
    const aeBuilder = from.mock.results.find(
      (_r, i) => from.mock.calls[i][0] === "attribution_events",
    )!.value as { insert: ReturnType<typeof vi.fn> };
    const event = aeBuilder.insert.mock.calls[0][0] as {
      content_id: string;
      event_type: string;
    };
    expect(event.event_type).toBe("survey_submit");
    expect(event.content_id).toBe("content-9");
  });

  it("returns 400 and records a failed delivery on a Zod rejection (missing email)", async () => {
    const from = setTables({
      webhook_deliveries: {
        insert: { data: { id: "wd1" }, error: null },
        update: { data: null, error: null },
      },
    });
    const body = JSON.stringify({ full_name: "No Email" });
    const res = await post(body, {
      "x-momentum-signature": sign(body),
      "x-momentum-delivery-id": "s3",
    });
    expect(res.status).toBe(400);
    expect(from).not.toHaveBeenCalledWith("leads");
    // markDelivery(...,'failed') updates webhook_deliveries
    expect(from).toHaveBeenCalledWith("webhook_deliveries");
  });

  it("returns 400 on invalid JSON", async () => {
    setTables({});
    const body = "{nope";
    const res = await post(body, {
      "x-momentum-signature": sign(body),
      "x-momentum-delivery-id": "s-json",
    });
    expect(res.status).toBe(400);
  });

  it("returns 500 when recordDelivery throws a non-duplicate DB error", async () => {
    setTables({
      webhook_deliveries: {
        insert: { data: null, error: { code: "08006", message: "conn lost" } },
      },
    });
    const body = JSON.stringify({ email: "a@b.com" });
    const res = await post(body, {
      "x-momentum-signature": sign(body),
      "x-momentum-delivery-id": "s-err",
    });
    expect(res.status).toBe(500);
  });

  it("returns 500 and marks failed when the lead upsert errors", async () => {
    const from = setTables({
      webhook_deliveries: {
        insert: { data: { id: "wd1" }, error: null },
        update: { data: null, error: null },
      },
      content: { select: { data: null, error: null } },
      leads: { upsert: { data: null, error: { message: "upsert failed" } } },
    });
    const body = JSON.stringify({ email: "a@b.com" });
    const res = await post(body, {
      "x-momentum-signature": sign(body),
      "x-momentum-delivery-id": "s-fail",
    });
    expect(res.status).toBe(500);
    expect(from).toHaveBeenCalledWith("leads");
  });

  it("returns { ok: true, duplicate: true } on a duplicate delivery", async () => {
    const from = setTables({
      webhook_deliveries: {
        insert: { data: null, error: { code: "23505", message: "dup" } },
      },
    });
    const body = JSON.stringify({ email: "a@b.com" });
    const res = await post(body, {
      "x-momentum-signature": sign(body),
      "x-momentum-delivery-id": "s2",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, duplicate: true });
    expect(from).not.toHaveBeenCalledWith("leads");
  });
});
