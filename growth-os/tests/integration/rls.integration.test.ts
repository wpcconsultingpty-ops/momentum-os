import { beforeAll, describe, expect, it } from "vitest";
import {
  INTEGRATION_ENABLED,
  applyMigrations,
  clientAs,
  createUser,
  makeClients,
  type CreatedUser,
  type IntegrationContext,
} from "./setup";

// Skipped unless RUN_INTEGRATION_TESTS=1 (and excluded from the default run by
// vitest.config.ts). Proves owner-isolation RLS actually blocks cross-tenant reads.
describe.skipIf(!INTEGRATION_ENABLED)("RLS owner isolation", () => {
  let ctx: IntegrationContext;
  let userA: CreatedUser;
  let userB: CreatedUser;

  beforeAll(async () => {
    applyMigrations();
    ctx = makeClients();
    userA = await createUser(ctx);
    userB = await createUser(ctx);
  }, 120_000);

  it("user B cannot SELECT user A's content", async () => {
    const { data: inserted, error } = await ctx.adminClient
      .from("content")
      .insert({ owner_id: userA.userId, platform: "instagram", external_id: "A_MEDIA" })
      .select("id")
      .single();
    expect(error).toBeNull();

    const aClient = clientAs(userA.accessToken);
    const bClient = clientAs(userB.accessToken);

    const aRead = await aClient.from("content").select("id").eq("id", inserted!.id);
    expect(aRead.data).toHaveLength(1);

    const bRead = await bClient.from("content").select("id").eq("id", inserted!.id);
    expect(bRead.data).toHaveLength(0);
  });

  it("user B's SELECT of user A's lead returns empty", async () => {
    await ctx.adminClient
      .from("leads")
      .insert({ owner_id: userA.userId, email: "lead-a@example.com", source: "survey" });

    const bClient = clientAs(userB.accessToken);
    const bRead = await bClient
      .from("leads")
      .select("id")
      .eq("email", "lead-a@example.com");
    expect(bRead.data).toHaveLength(0);
  });

  it("the anon role cannot SELECT anything from attribution_events", async () => {
    await ctx.adminClient.from("attribution_events").insert({
      owner_id: userA.userId,
      event_type: "survey_submit",
      source: "survey",
      payload: { seeded: true },
    });

    const { data } = await ctx.anonClient.from("attribution_events").select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("the service role CAN insert into attribution_events and webhook_deliveries", async () => {
    const ae = await ctx.adminClient
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

    const wd = await ctx.adminClient
      .from("webhook_deliveries")
      .insert({ source: "instagram", delivery_id: `d-${Date.now()}`, status: "received" })
      .select("id")
      .single();
    expect(wd.error).toBeNull();
    expect(wd.data?.id).toBeTruthy();
  });
});
