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

// Carousel draft generator integration coverage. Exercises the real server
// action against a migrated Supabase test DB: it must insert draft `content`
// rows owned by the signed-in user and bridge each into `scheduled_posts` as a
// CAROUSEL with a slides array. Mirrors server-actions.integration.test.ts.

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

describe.skipIf(!INTEGRATION_ENABLED)("generateCarouselDraft (integration)", () => {
  const emailA = "carousel-a@example.com";
  const emailB = "carousel-b@example.com";
  let userA: CreatedUser;
  let userB: CreatedUser;

  beforeAll(async () => {
    applyMigrations();
    const env = getEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.anonKey;
    process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceRoleKey;
  }, 180_000);

  beforeEach(async () => {
    await resetDb();
    userA = await createUser({ email: emailA, password });
    userB = await createUser({ email: emailB, password });
    cookieStoreRef.store = new FakeCookieStore();
  });

  async function generate(count: string) {
    const { generateCarouselDraft } = await import(
      "@/app/dashboard/content/carousel-actions"
    );
    const form = new FormData();
    form.set("count", count);
    return generateCarouselDraft(form);
  }

  it("rejects when there is no signed-in user", async () => {
    const result = await generate("2");
    expect(result.ok).toBe(false);
    const { data } = await adminClient().from("content").select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("inserts draft content rows owned by the signed-in user", async () => {
    cookieStoreRef.store = await sessionStore(emailA);
    const result = await generate("3");
    expect(result.ok).toBe(true);
    expect(result.created).toBe(3);

    const { data } = await adminClient()
      .from("content")
      .select("owner_id, platform, status");
    expect(data).toHaveLength(3);
    for (const row of data!) {
      expect(row.owner_id).toBe(userA.userId);
      expect(row.platform).toBe("instagram");
      expect(row.status).toBe("draft");
    }
  });

  it("bridges each draft into scheduled_posts as a CAROUSEL with slides", async () => {
    cookieStoreRef.store = await sessionStore(emailA);
    await generate("2");

    const { data: posts } = await adminClient()
      .from("scheduled_posts")
      .select("owner_id, content_id, media_type, image_url, slides, status");
    expect(posts).toHaveLength(2);
    for (const post of posts!) {
      expect(post.owner_id).toBe(userA.userId);
      expect(post.content_id).toBeTruthy();
      expect(post.media_type).toBe("CAROUSEL");
      expect(post.status).toBe("draft");
      expect(String(post.image_url).startsWith("/api/og-post")).toBe(true);
      expect(Array.isArray(post.slides)).toBe(true);
      expect(post.slides.length).toBeGreaterThanOrEqual(2);
      expect(post.slides.length).toBeLessThanOrEqual(10);
    }
  });

  it("scopes drafts to the signed-in owner only", async () => {
    cookieStoreRef.store = await sessionStore(emailB);
    await generate("1");

    const { data } = await adminClient().from("content").select("owner_id");
    expect(data).toHaveLength(1);
    expect(data![0].owner_id).toBe(userB.userId);
    expect(data![0].owner_id).not.toBe(userA.userId);
  });
});
