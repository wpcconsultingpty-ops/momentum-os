import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  INTEGRATION_ENABLED,
  adminClient,
  anonClient,
  applyMigrations,
  createUser,
  getEnv,
  resetDb,
  type CreatedUser,
} from "./setup";
import { FakeCookieStore } from "./helpers/fakeCookies";
import { cookieStoreRef } from "./helpers/nextMocks";

vi.mock("next/headers", () => ({
  cookies: () => cookieStoreRef.store,
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));

const password = "test-password-123!";

/** Builds a cookie store carrying `user`'s session, as production middleware would. */
async function sessionStore(email: string): Promise<FakeCookieStore> {
  const { data, error } = await anonClient().auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) throw error ?? new Error("no session");
  const store = new FakeCookieStore();
  const { createClient } = await import("@/lib/supabase/server");
  await createClient(store).auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  return store;
}

describe.skipIf(!INTEGRATION_ENABLED)("dashboard server actions", () => {
  let userA: CreatedUser;
  let userB: CreatedUser;
  let emailA: string;
  let emailB: string;

  beforeAll(async () => {
    applyMigrations();
    const env = getEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.anonKey;
    process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceRoleKey;
  }, 180_000);

  beforeEach(async () => {
    await resetDb();
    emailA = `a-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    emailB = `b-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    userA = await createUser({ email: emailA, password });
    userB = await createUser({ email: emailB, password });
    cookieStoreRef.store = new FakeCookieStore();
  });

  describe("createContent", () => {
    it("inserts a row owned by the signed-in user", async () => {
      cookieStoreRef.store = await sessionStore(emailA);
      const { createContent } = await import("@/app/dashboard/content/actions");

      const form = new FormData();
      form.set("platform", "instagram");
      form.set("caption", "hello");
      const result = await createContent(form);
      expect(result.ok).toBe(true);

      const { data } = await adminClient()
        .from("content")
        .select("owner_id, platform, caption");
      expect(data).toHaveLength(1);
      expect(data![0].owner_id).toBe(userA.userId);
      expect(data![0].platform).toBe("instagram");
    });

    it("unauthenticated → returns not-authenticated and inserts nothing", async () => {
      cookieStoreRef.store = new FakeCookieStore();
      const { createContent } = await import("@/app/dashboard/content/actions");

      const form = new FormData();
      form.set("platform", "instagram");
      const result = await createContent(form);
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/auth/i);

      const { data } = await adminClient().from("content").select("id");
      expect(data ?? []).toHaveLength(0);
    });

    it("ignores a client-supplied owner_id and uses auth.uid()", async () => {
      cookieStoreRef.store = await sessionStore(emailA);
      const { createContent } = await import("@/app/dashboard/content/actions");

      const form = new FormData();
      form.set("platform", "instagram");
      form.set("owner_id", userB.userId); // attacker-controlled; must be ignored
      const result = await createContent(form);
      expect(result.ok).toBe(true);

      const { data } = await adminClient().from("content").select("owner_id");
      expect(data).toHaveLength(1);
      expect(data![0].owner_id).toBe(userA.userId);
    });

    it("Zod rejects an invalid platform and inserts nothing", async () => {
      cookieStoreRef.store = await sessionStore(emailA);
      const { createContent } = await import("@/app/dashboard/content/actions");

      const form = new FormData();
      form.set("platform", "myspace"); // not in the enum
      const result = await createContent(form);
      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();

      const { data } = await adminClient().from("content").select("id");
      expect(data ?? []).toHaveLength(0);
    });
  });

  describe("createLead", () => {
    it("inserts a row owned by the signed-in user", async () => {
      cookieStoreRef.store = await sessionStore(emailA);
      const { createLead } = await import("@/app/dashboard/leads/actions");

      const form = new FormData();
      form.set("email", "lead@example.com");
      form.set("full_name", "Lead Person");
      const result = await createLead(form);
      expect(result.ok).toBe(true);

      const { data } = await adminClient().from("leads").select("owner_id, email");
      expect(data).toHaveLength(1);
      expect(data![0].owner_id).toBe(userA.userId);
    });

    it("unauthenticated → returns not-authenticated and inserts nothing", async () => {
      cookieStoreRef.store = new FakeCookieStore();
      const { createLead } = await import("@/app/dashboard/leads/actions");

      const form = new FormData();
      form.set("email", "nobody@example.com");
      const result = await createLead(form);
      expect(result.ok).toBe(false);

      const { data } = await adminClient().from("leads").select("id");
      expect(data ?? []).toHaveLength(0);
    });

    it("ignores a client-supplied owner_id", async () => {
      cookieStoreRef.store = await sessionStore(emailA);
      const { createLead } = await import("@/app/dashboard/leads/actions");

      const form = new FormData();
      form.set("email", "owned@example.com");
      form.set("owner_id", userB.userId);
      const result = await createLead(form);
      expect(result.ok).toBe(true);

      const { data } = await adminClient().from("leads").select("owner_id");
      expect(data).toHaveLength(1);
      expect(data![0].owner_id).toBe(userA.userId);
    });
  });

  describe("updateLeadStatus", () => {
    it("owner can transition their lead's status", async () => {
      const { data: lead } = await adminClient()
        .from("leads")
        .insert({ owner_id: userA.userId, email: "x@example.com", source: "manual" })
        .select("id")
        .single();

      cookieStoreRef.store = await sessionStore(emailA);
      const { updateLeadStatus } = await import("@/app/dashboard/leads/actions");

      const form = new FormData();
      form.set("id", lead!.id);
      form.set("status", "qualified");
      const result = await updateLeadStatus(form);
      expect(result.ok).toBe(true);

      const { data } = await adminClient()
        .from("leads")
        .select("status")
        .eq("id", lead!.id)
        .single();
      expect(data!.status).toBe("qualified");
    });

    it("cross-tenant update is RLS-blocked (no rows changed)", async () => {
      const { data: lead } = await adminClient()
        .from("leads")
        .insert({ owner_id: userA.userId, email: "y@example.com", source: "manual" })
        .select("id, status")
        .single();

      // User B signs in and tries to flip user A's lead.
      cookieStoreRef.store = await sessionStore(emailB);
      const { updateLeadStatus } = await import("@/app/dashboard/leads/actions");

      const form = new FormData();
      form.set("id", lead!.id);
      form.set("status", "converted");
      const result = await updateLeadStatus(form);
      // The .eq("owner_id", B) + RLS means zero rows match; the update is a
      // no-op that returns ok, but the row is unchanged.
      expect(result.ok).toBe(true);

      const { data } = await adminClient()
        .from("leads")
        .select("status")
        .eq("id", lead!.id)
        .single();
      expect(data!.status).toBe("new");
    });

    it("Zod rejects an invalid status value", async () => {
      cookieStoreRef.store = await sessionStore(emailA);
      const { updateLeadStatus } = await import("@/app/dashboard/leads/actions");

      const form = new FormData();
      form.set("id", "00000000-0000-0000-0000-000000000000");
      form.set("status", "not-a-status");
      const result = await updateLeadStatus(form);
      expect(result.ok).toBe(false);
    });
  });
});
