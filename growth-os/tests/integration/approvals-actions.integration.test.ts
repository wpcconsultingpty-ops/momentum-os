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

/** Seeds a scheduled_posts row (service-role, bypassing RLS) for `ownerId`. */
async function seedScheduledPost(ownerId: string, status = "draft") {
  const { data, error } = await adminClient()
    .from("scheduled_posts")
    .insert({
      owner_id: ownerId,
      caption: "hello from approvals test",
      image_url: "/api/og-post?hook=hello",
      status,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

describe.skipIf(!INTEGRATION_ENABLED)("approvals server actions", () => {
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

  describe("approvePost", () => {
    it("owner flips a draft post to approved", async () => {
      const postId = await seedScheduledPost(userA.userId, "draft");
      cookieStoreRef.store = await sessionStore(emailA);
      const { approvePost } = await import("@/app/dashboard/approvals/actions");
      const result = await approvePost(postId);
      expect(result.ok).toBe(true);
      const { data } = await adminClient()
        .from("scheduled_posts")
        .select("status, approved_at")
        .eq("id", postId)
        .single();
      expect(data!.status).toBe("approved");
      expect(data!.approved_at).toBeTruthy();
    });

    it("cross-tenant approve is RLS-blocked and reports not-approvable", async () => {
      const postId = await seedScheduledPost(userA.userId, "draft");
      cookieStoreRef.store = await sessionStore(emailB);
      const { approvePost } = await import("@/app/dashboard/approvals/actions");
      const result = await approvePost(postId);
      expect(result.ok).toBe(false);
      const { data } = await adminClient()
        .from("scheduled_posts")
        .select("status")
        .eq("id", postId)
        .single();
      expect(data!.status).toBe("draft");
    });

    it("already-published post is not approvable", async () => {
      const postId = await seedScheduledPost(userA.userId, "published");
      cookieStoreRef.store = await sessionStore(emailA);
      const { approvePost } = await import("@/app/dashboard/approvals/actions");
      const result = await approvePost(postId);
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/approvable/i);
    });
  });

  describe("rejectPost", () => {
    it("owner flips a draft post to rejected", async () => {
      const postId = await seedScheduledPost(userA.userId, "draft");
      cookieStoreRef.store = await sessionStore(emailA);
      const { rejectPost } = await import("@/app/dashboard/approvals/actions");
      const result = await rejectPost(postId);
      expect(result.ok).toBe(true);
      const { data } = await adminClient()
        .from("scheduled_posts")
        .select("status")
        .eq("id", postId)
        .single();
      expect(data!.status).toBe("rejected");
    });

    it("cross-tenant reject is RLS-blocked (row unchanged)", async () => {
      const postId = await seedScheduledPost(userA.userId, "draft");
      cookieStoreRef.store = await sessionStore(emailB);
      const { rejectPost } = await import("@/app/dashboard/approvals/actions");
      const result = await rejectPost(postId);
      expect(result.ok).toBe(true);
      const { data } = await adminClient()
        .from("scheduled_posts")
        .select("status")
        .eq("id", postId)
        .single();
      expect(data!.status).toBe("draft");
    });
  });

  describe("publishPost", () => {
    it("refuses to publish a post that is not approved (no network call)", async () => {
      const postId = await seedScheduledPost(userA.userId, "draft");
      cookieStoreRef.store = await sessionStore(emailA);
      const { publishPost } = await import("@/app/dashboard/approvals/actions");
      const result = await publishPost(postId);
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/approved before publishing/i);
    });

    it("reports not-found for a row the caller cannot see", async () => {
      const postId = await seedScheduledPost(userA.userId, "approved");
      cookieStoreRef.store = await sessionStore(emailB);
      const { publishPost } = await import("@/app/dashboard/approvals/actions");
      const result = await publishPost(postId);
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/not found/i);
    });
  });
});
