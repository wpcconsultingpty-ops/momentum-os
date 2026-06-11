import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  INTEGRATION_ENABLED,
  adminClient,
  anonClient,
  applyMigrations,
  clientForToken,
  createUser,
  resetDb,
  type CreatedUser,
} from "./setup";

// Skipped unless RUN_INTEGRATION_TESTS=1 (and excluded from the default run by
// vitest.config.ts). Proves owner-isolation RLS actually blocks cross-tenant reads.
describe.skipIf(!INTEGRATION_ENABLED)("RLS owner isolation", () => {
  let userA: CreatedUser;
  let userB: CreatedUser;

  beforeAll(async () => {
    applyMigrations();
  }, 180_000);

  beforeEach(async () => {
    await resetDb();
    userA = await createUser();
    userB = await createUser();
  });

  it("user B cannot SELECT user A's content", async () => {
    const admin = adminClient();
    const { data: inserted, error } = await admin
      .from("content")
      .insert({ owner_id: userA.userId, platform: "instagram", external_id: "A_MEDIA" })
      .select("id")
      .single();
    expect(error).toBeNull();

    const aClient = clientForToken(userA.accessToken);
    const bClient = clientForToken(userB.accessToken);

    const aRead = await aClient.from("content").select("id").eq("id", inserted!.id);
    expect(aRead.data).toHaveLength(1);

    const bRead = await bClient.from("content").select("id").eq("id", inserted!.id);
    expect(bRead.data).toHaveLength(0);
  });

  it("user B's SELECT of user A's lead returns empty", async () => {
    await adminClient()
      .from("leads")
      .insert({ owner_id: userA.userId, email: "lead-a@example.com", source: "survey" });

    const bClient = clientForToken(userB.accessToken);
    const bRead = await bClient
      .from("leads")
      .select("id")
      .eq("email", "lead-a@example.com");
    expect(bRead.data).toHaveLength(0);
  });

  it("the anon role cannot SELECT anything from attribution_events", async () => {
    await adminClient().from("attribution_events").insert({
      owner_id: userA.userId,
      event_type: "survey_submit",
      source: "survey",
      payload: { seeded: true },
    });

    const { data } = await anonClient().from("attribution_events").select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("the anon role cannot INSERT into attribution_events", async () => {
    const { error } = await anonClient().from("attribution_events").insert({
      owner_id: userA.userId,
      event_type: "survey_submit",
      source: "survey",
      payload: { sneaky: true },
    });
    expect(error).not.toBeNull();

    // And nothing landed.
    const { data } = await adminClient()
      .from("attribution_events")
      .select("id")
      .eq("payload->>sneaky", "true");
    expect(data ?? []).toHaveLength(0);
  });

  it("a signed-in user cannot INSERT into attribution_events (service-role only)", async () => {
    const aClient = clientForToken(userA.accessToken);
    const { error } = await aClient.from("attribution_events").insert({
      owner_id: userA.userId,
      event_type: "survey_submit",
      source: "survey",
      payload: { viaUser: true },
    });
    expect(error).not.toBeNull();
  });

  it("the service role CAN insert into attribution_events and webhook_deliveries", async () => {
    const admin = adminClient();
    const ae = await admin
      .from("attribution_events")
      .insert({
        owner_id: userA.userId,
        event_type: "ig_engagement",
        source: "instagram",
        payload: { ok: true },
      })
      .select("id")
      .single();
    expect(ae.error).toBeNull();
    expect(ae.data?.id).toBeTruthy();

    const wd = await admin
      .from("webhook_deliveries")
      .insert({ source: "instagram", delivery_id: `d-${Date.now()}`, status: "received" })
      .select("id")
      .single();
    expect(wd.error).toBeNull();
    expect(wd.data?.id).toBeTruthy();
  });
});
