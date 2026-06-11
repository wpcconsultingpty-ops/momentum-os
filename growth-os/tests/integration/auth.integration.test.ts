import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { NextRequest } from "next/server";
import {
  INTEGRATION_ENABLED,
  adminClient,
  anonClient,
  applyMigrations,
  createUser,
  getEnv,
  resetDb,
} from "./setup";
import { FakeCookieStore } from "./helpers/fakeCookies";
import { cookieStoreRef, captureRedirect, redirectMock } from "./helpers/nextMocks";

vi.mock("next/headers", () => ({
  cookies: () => cookieStoreRef.store,
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));

const { url } = getEnv();
const password = "test-password-123!";

describe.skipIf(!INTEGRATION_ENABLED)("auth routes + profile trigger", () => {
  beforeAll(async () => {
    applyMigrations();
    // Point env at the local stack so server helpers build a working client.
    const env = getEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.anonKey;
    process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceRoleKey;
    process.env.SITE_URL = "http://localhost:3000";
  }, 180_000);

  beforeEach(async () => {
    await resetDb();
    cookieStoreRef.store = new FakeCookieStore();
  });

  it("signUp action creates an auth user AND a profiles row (trigger)", async () => {
    const email = `signup-${Date.now()}@example.com`;
    const { signUp } = await import("@/app/signup/actions");

    const form = new FormData();
    form.set("email", email);
    form.set("password", password);
    form.set("full_name", "Test Owner");

    // enable_confirmations=false locally, so signUp returns a session and the
    // action redirects to /login with a confirmation message.
    const target = await captureRedirect(() => signUp(form));
    expect(target).toContain("/login");

    const admin = adminClient();
    const { data: profile, error } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .eq("email", email)
      .single();
    expect(error).toBeNull();
    expect(profile?.email).toBe(email);
    expect(profile?.full_name).toBe("Test Owner");
  });

  it("login action: valid creds → redirect to /dashboard", async () => {
    const email = `login-${Date.now()}@example.com`;
    await createUser({ email, password });
    const { signIn } = await import("@/app/login/actions");

    const form = new FormData();
    form.set("email", email);
    form.set("password", password);

    const target = await captureRedirect(() => signIn(form));
    expect(target).toBe("/dashboard");
  });

  it("login action: wrong password → redirect back to /login with error", async () => {
    const email = `login-bad-${Date.now()}@example.com`;
    await createUser({ email, password });
    const { signIn } = await import("@/app/login/actions");

    const form = new FormData();
    form.set("email", email);
    form.set("password", "wrong-password");

    const target = await captureRedirect(() => signIn(form));
    expect(target).toContain("/login?error=");
  });

  // TODO(phase-7): Re-enable once the local GoTrue stack is configured to issue
  // PKCE codes for the magic-link/OTP flow. As of supabase-cli v2.x the local
  // /auth/v1/verify endpoint returns implicit-flow fragments (#access_token=...)
  // instead of `?code=`, so this test cannot exercise the real PKCE exchange
  // without a browser. The error/no-code branches below still cover the route.
  it.skip("/auth/callback exchanges a valid OAuth code → redirect to /dashboard + session cookie", async () => {
    const email = `callback-${Date.now()}@example.com`;
    await createUser({ email, password });

    const store = new FakeCookieStore();
    cookieStoreRef.store = store;
    const { createClient } = await import("@/lib/supabase/server");
    const initiator = createClient(store);
    const { error: otpErr } = await initiator.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    expect(otpErr).toBeNull();

    const code = await codeFromLatestEmail(email);

    const { GET } = await import("@/app/auth/callback/route");
    const req = new NextRequest(
      `http://localhost:3000/auth/callback?code=${encodeURIComponent(code)}`,
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/dashboard");
    const authCookie = store
      .getAll()
      .find((c) => c.name.includes("auth-token"));
    expect(authCookie).toBeTruthy();
  });

  it("/auth/callback with an invalid code → redirect to /login with error", async () => {
    cookieStoreRef.store = new FakeCookieStore();
    const { GET } = await import("@/app/auth/callback/route");
    const req = new NextRequest(
      "http://localhost:3000/auth/callback?code=not-a-real-code",
    );
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
    expect(res.headers.get("location")).toContain("error=");
  });

  it("/auth/callback with no code → redirect to /login with error", async () => {
    const { GET } = await import("@/app/auth/callback/route");
    const req = new NextRequest("http://localhost:3000/auth/callback");
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
    expect(res.headers.get("location")).toContain("error=");
  });

  it("/auth/sign-out invalidates the session and redirects to /", async () => {
    const email = `signout-${Date.now()}@example.com`;
    await createUser({ email, password });

    // Seed the cookie store with a real session so signOut has something to clear.
    const { data } = await anonClient().auth.signInWithPassword({
      email,
      password,
    });
    const store = new FakeCookieStore();
    const { createClient } = await import("@/lib/supabase/server");
    await createClient(store).auth.setSession({
      access_token: data.session!.access_token,
      refresh_token: data.session!.refresh_token,
    });
    cookieStoreRef.store = store;

    const { POST } = await import("@/app/auth/sign-out/route");
    const req = new NextRequest("http://localhost:3000/auth/sign-out", {
      method: "POST",
    });
    const res = await POST(req);

    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/");
    // signOut cleared the auth cookie (set to empty → removed from store).
    const authCookie = store
      .getAll()
      .find((c) => c.name.includes("auth-token"));
    expect(authCookie).toBeFalsy();
  });
});

/**
 * Produces a PKCE `?code=` for the just-initiated OTP handshake. `signInWithOtp`
 * (run against our cookie store) already registered the challenge with GoTrue and
 * wrote the `code_verifier` cookie; the same email's magic-link token therefore
 * redeems at GoTrue's `/verify` into a redirect carrying the matching `?code=`.
 * Admin `generateLink` gives us that token deterministically — no mailbox polling,
 * no timers.
 */
async function codeFromLatestEmail(email: string): Promise<string> {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data.properties) throw error ?? new Error("no link props");

  const verifyUrl = `${url}/auth/v1/verify?token=${data.properties.hashed_token}&type=magiclink&redirect_to=${encodeURIComponent(
    "http://localhost:3000/auth/callback",
  )}`;
  const res = await fetch(verifyUrl, { redirect: "manual" });
  const location = res.headers.get("location");
  if (!location) {
    throw new Error(`verify returned no redirect (status ${res.status})`);
  }
  const code = new URL(location).searchParams.get("code");
  if (!code) throw new Error(`no code in verify redirect: ${location}`);
  return code;
}
