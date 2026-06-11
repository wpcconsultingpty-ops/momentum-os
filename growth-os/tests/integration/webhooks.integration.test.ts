import { beforeAll, describe, expect, it } from "vitest";
import {
  INTEGRATION_ENABLED,
  applyMigrations,
  createUser,
  makeClients,
  sign,
  type CreatedUser,
  type IntegrationContext,
} from "./setup";

const SURVEY_SECRET = "integration-survey-secret";

// End-to-end ingest against a real local Postgres + RLS. The survey route is
// invoked as a plain function with the service-role admin client pointed at the
// local stack via env. Skipped unless RUN_INTEGRATION_TESTS=1.
describe.skipIf(!INTEGRATION_ENABLED)("survey webhook end-to-end", () => {
  let ctx: IntegrationContext;
  let owner: CreatedUser;

  beforeAll(async () => {
    applyMigrations();
    ctx = makeClients();
    owner = await createUser(ctx);

    // Point the route's env at the local stack + this owner.
    const { url, serviceRoleKey } = await import("./setup").then((m) =>
      m.getConfig(),
    );
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;
    process.env.OWNER_USER_ID = owner.userId;
    process.env.SURVEY_WEBHOOK_SECRET = SURVEY_SECRET;
  }, 120_000);

  it("seeds content, ingests a signed survey, and links attribution", async () => {
    const { data: content } = await ctx.adminClient
      .from("content")
      .insert({
        owner_id: owner.userId,
        platform: "instagram",
        external_id: "E2E_MEDIA_1",
        utm_campaign: "e2e",
      })
      .select("id")
      .single();

    // Import after env is set so createAdminClient picks up the local config.
    const { POST } = await import("@/app/api/webhooks/survey/route");

    const body = JSON.stringify({
      email: "e2e-lead@example.com",
      content_external_id: "E2E_MEDIA_1",
      utm_campaign: "e2e",
    });
    const res = await POST(
      new Request("http://localhost/api/webhooks/survey", {
        method: "POST",
        headers: {
          "x-momentum-signature": sign(SURVEY_SECRET, body),
          "x-momentum-delivery-id": `e2e-${Date.now()}`,
        },
        body,
      }) as never,
    );
    expect(res.status).toBe(200);

    const { data: lead } = await ctx.adminClient
      .from("leads")
      .select("id, attributed_content_id")
      .eq("owner_id", owner.userId)
      .eq("email", "e2e-lead@example.com")
      .single();
    expect(lead?.attributed_content_id).toBe(content!.id);

    const { data: events } = await ctx.adminClient
      .from("attribution_events")
      .select("id, event_type, content_id")
      .eq("owner_id", owner.userId)
      .eq("event_type", "survey_submit");
    expect(events ?? []).not.toHaveLength(0);
    expect(events![0].content_id).toBe(content!.id);
  });
});
