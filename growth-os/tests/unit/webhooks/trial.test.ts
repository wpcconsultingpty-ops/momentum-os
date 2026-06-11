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

import { POST } from "@/app/api/webhooks/trial/route";

const SECRET = "trial-secret";
const OWNER = "44444444-4444-4444-4444-444444444444";

function sign(body: string): string {
  return crypto.createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
}

function setTables(tables: Record<string, TableResponses>) {
  const { from } = createSupabaseMock(tables);
  mockState.from = from;
  return from;
}

function post(body: string, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost/api/webhooks/trial", {
      method: "POST",
      headers: { "x-momentum-signature": sign(body), ...headers },
      body,
    }) as never,
  );
}

// A table may be queried via multiple `from(table)` calls (e.g. a select chain
// then a separate insert chain). Return the builder for `table` whose `method`
// was actually invoked.
function builderWhere(
  from: ReturnType<typeof createSupabaseMock>["from"],
  table: string,
  method: string,
) {
  for (let i = 0; i < from.mock.calls.length; i++) {
    if (from.mock.calls[i][0] !== table) continue;
    const builder = from.mock.results[i].value as Record<
      string,
      ReturnType<typeof vi.fn>
    >;
    if (builder[method].mock.calls.length > 0) return builder;
  }
  throw new Error(`no ${table} builder with ${method}() called`);
}

beforeEach(() => {
  process.env.TRIAL_WEBHOOK_SECRET = SECRET;
  process.env.OWNER_USER_ID = OWNER;
});

afterEach(() => {
  vi.clearAllMocks();
  mockState.from = null;
});

describe("trial POST", () => {
  it("returns 401 on an invalid signature", async () => {
    setTables({});
    const body = JSON.stringify({ event: "trial_start", email: "a@b.com" });
    const res = await POST(
      new Request("http://localhost/api/webhooks/trial", {
        method: "POST",
        headers: { "x-momentum-signature": "bad" },
        body,
      }) as never,
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on an invalid event value", async () => {
    const from = setTables({
      webhook_deliveries: {
        insert: { data: { id: "wd1" }, error: null },
        update: { data: null, error: null },
      },
    });
    const body = JSON.stringify({ event: "bogus", email: "a@b.com" });
    const res = await post(body, { "x-momentum-delivery-id": "t-bad" });
    expect(res.status).toBe(400);
    expect(from).not.toHaveBeenCalledWith("trials");
  });

  it("trial_start with an existing lead inserts a trial linking the lead and copies attributed_content_id", async () => {
    const from = setTables({
      webhook_deliveries: { insert: { data: { id: "wd1" }, error: null } },
      leads: { select: { data: { id: "lead-1", attributed_content_id: "content-7" }, error: null } },
      trials: { insert: { data: { id: "trial-1" }, error: null } },
      attribution_events: { insert: { data: { id: "ae1" }, error: null } },
    });
    const body = JSON.stringify({ event: "trial_start", email: "lead@example.com" });
    const res = await post(body, { "x-momentum-delivery-id": "t1" });
    expect(res.status).toBe(200);

    const trialsBuilder = builderWhere(from, "trials", "insert");
    const trialRow = trialsBuilder.insert.mock.calls[0][0] as {
      lead_id: string;
      attributed_content_id: string;
    };
    expect(trialRow.lead_id).toBe("lead-1");
    expect(trialRow.attributed_content_id).toBe("content-7");

    const aeBuilder = builderWhere(from, "attribution_events", "insert");
    const event = aeBuilder.insert.mock.calls[0][0] as { event_type: string };
    expect(event.event_type).toBe("trial_start");
  });

  it("trial_start with no existing lead creates a stub lead first", async () => {
    const from = setTables({
      webhook_deliveries: { insert: { data: { id: "wd1" }, error: null } },
      // findOrCreateLead: byEmail lookup misses, then insert creates the stub.
      leads: {
        select: { data: null, error: null },
        insert: { data: { id: "lead-new", attributed_content_id: null }, error: null },
      },
      trials: { insert: { data: { id: "trial-2" }, error: null } },
      attribution_events: { insert: { data: { id: "ae2" }, error: null } },
    });
    const body = JSON.stringify({ event: "trial_start", email: "new@example.com" });
    const res = await post(body, { "x-momentum-delivery-id": "t2" });
    expect(res.status).toBe(200);

    const leadsBuilder = builderWhere(from, "leads", "insert");
    const stub = leadsBuilder.insert.mock.calls[0][0] as { email: string; source: string };
    expect(stub.email).toBe("new@example.com");
    expect(stub.source).toBe("trial");
  });

  it("returns 400 on invalid JSON", async () => {
    setTables({});
    const body = "{bad";
    const res = await post(body, { "x-momentum-delivery-id": "t-json" });
    expect(res.status).toBe(400);
  });

  it("returns 500 when recordDelivery throws a non-duplicate DB error", async () => {
    setTables({
      webhook_deliveries: {
        insert: { data: null, error: { code: "08006", message: "conn lost" } },
      },
    });
    const body = JSON.stringify({ event: "trial_start", email: "a@b.com" });
    const res = await post(body, { "x-momentum-delivery-id": "t-err" });
    expect(res.status).toBe(500);
  });

  it("returns { ok: true, duplicate: true } on a duplicate delivery", async () => {
    const from = setTables({
      webhook_deliveries: {
        insert: { data: null, error: { code: "23505", message: "dup" } },
      },
    });
    const body = JSON.stringify({ event: "trial_start", email: "a@b.com" });
    const res = await post(body, { "x-momentum-delivery-id": "t-dup" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, duplicate: true });
    expect(from).not.toHaveBeenCalledWith("trials");
  });

  it("returns 500 and marks failed when the trial insert errors", async () => {
    const from = setTables({
      webhook_deliveries: {
        insert: { data: { id: "wd1" }, error: null },
        update: { data: null, error: null },
      },
      leads: { select: { data: { id: "lead-1", attributed_content_id: null }, error: null } },
      trials: { insert: { data: null, error: { message: "trial insert failed" } } },
    });
    const body = JSON.stringify({ event: "trial_start", email: "lead@example.com" });
    const res = await post(body, { "x-momentum-delivery-id": "t-fail" });
    expect(res.status).toBe(500);
    expect(from).toHaveBeenCalledWith("trials");
  });

  it("trial_convert updates the most recent trial and inserts a trial_convert event", async () => {
    const from = setTables({
      webhook_deliveries: { insert: { data: { id: "wd1" }, error: null } },
      leads: { select: { data: { id: "lead-1", attributed_content_id: "content-7" }, error: null } },
      // latest-trial lookup, then update
      trials: {
        select: { data: { id: "trial-1", attributed_content_id: "content-7" }, error: null },
        update: { data: null, error: null },
      },
      attribution_events: { insert: { data: { id: "ae3" }, error: null } },
    });
    const body = JSON.stringify({ event: "trial_convert", email: "lead@example.com" });
    const res = await post(body, { "x-momentum-delivery-id": "t3" });
    expect(res.status).toBe(200);

    const trialsBuilder = builderWhere(from, "trials", "update");
    const update = trialsBuilder.update.mock.calls[0][0] as {
      converted_to_paid: boolean;
      ended_at: string;
    };
    expect(update.converted_to_paid).toBe(true);
    expect(update.ended_at).toBeTruthy();

    const aeBuilder = builderWhere(from, "attribution_events", "insert");
    const event = aeBuilder.insert.mock.calls[0][0] as { event_type: string };
    expect(event.event_type).toBe("trial_convert");
  });
});
