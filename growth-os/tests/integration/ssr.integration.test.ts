import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  INTEGRATION_ENABLED,
  applyMigrations,
  createUser,
  resetDb,
  signInAs,
  type CreatedUser,
} from "./setup";
import { FakeCookieStore } from "./helpers/fakeCookies";

/**
 * Builds a fake cookie store already holding a valid session for `email` by
 * letting the real @supabase/ssr server client write the session cookies
 * through our adapter (same path production uses). Returns the populated store.
 */
async function storeWithSession(
  accessToken: string,
  refreshToken: string,
): Promise<FakeCookieStore> {
  const { createClient } = await import("@/lib/supabase/server");
  const store = new FakeCookieStore();
  const supabase = createClient(store);
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
  return store;
}

async function tokensFor(email: string, password: string) {
  const { accessToken, refreshToken } = await signInAs({ email, password });
  return { accessToken, refreshToken };
}

describe.skipIf(!INTEGRATION_ENABLED)("SSR helpers", () => {
  const password = "test-password-123!";
  let user: CreatedUser;

  beforeAll(async () => {
    applyMigrations();
  }, 180_000);

  beforeEach(async () => {
    await resetDb();
    user = await createUser({ email: `ssr-${Date.now()}@example.com`, password });
  });

  describe("createServerClient (lib/supabase/server.ts)", () => {
    it("with valid cookies → returns the authenticated user", async () => {
      const { accessToken, refreshToken } = await tokensFor(user.email, password);
      const store = await storeWithSession(accessToken, refreshToken);

      const { createClient } = await import("@/lib/supabase/server");
      const supabase = createClient(store);
      const { data, error } = await supabase.auth.getUser();

      expect(error).toBeNull();
      expect(data.user?.id).toBe(user.userId);
    });

    it("with no cookies → unauthenticated", async () => {
      const { createClient } = await import("@/lib/supabase/server");
      const store = new FakeCookieStore();
      const supabase = createClient(store);
      const { data } = await supabase.auth.getUser();
      expect(data.user).toBeNull();
    });

    it("with a stale access token + valid refresh → refreshes and re-sets cookies", async () => {
      const { accessToken, refreshToken } = await tokensFor(user.email, password);

      // Persist a real, valid session, then surgically expire the access token
      // inside the stored cookie while leaving the refresh token intact. A fresh
      // client must then refresh via the refresh token to authenticate.
      const store = await storeWithSession(accessToken, refreshToken);
      expireStoredAccessToken(store, makeExpiredJwt(user.userId));
      const writesBefore = store.setCalls.length;

      const { createClient } = await import("@/lib/supabase/server");
      const supabase = createClient(store);
      const { data, error } = await supabase.auth.getUser();

      expect(error).toBeNull();
      expect(data.user?.id).toBe(user.userId);
      // The refresh persisted fresh tokens back through the cookie adapter.
      const authWrites = store.setCalls
        .slice(writesBefore)
        .filter((c) => c.name.includes("auth-token"));
      expect(authWrites.length).toBeGreaterThan(0);
    });
  });

  describe("updateSession (lib/supabase/middleware.ts)", () => {
    it("redirects an unauthenticated request for /dashboard/content to /login", async () => {
      const { updateSession } = await import("@/lib/supabase/middleware");
      const req = new NextRequest("http://localhost:3000/dashboard/content");
      const res = await updateSession(req);

      expect(res.status).toBe(307);
      const location = res.headers.get("location")!;
      expect(new URL(location).pathname).toBe("/login");
    });

    it("does NOT redirect a public route (/login)", async () => {
      const { updateSession } = await import("@/lib/supabase/middleware");
      const req = new NextRequest("http://localhost:3000/login");
      const res = await updateSession(req);
      // Pass-through NextResponse.next() has no Location and is not a redirect.
      expect(res.headers.get("location")).toBeNull();
      expect(res.status).toBe(200);
    });

    it("lets an authenticated user through to /dashboard/content", async () => {
      const { accessToken, refreshToken } = await tokensFor(user.email, password);
      const store = await storeWithSession(accessToken, refreshToken);

      const req = new NextRequest("http://localhost:3000/dashboard/content");
      for (const { name, value } of store.getAll()) {
        req.cookies.set(name, value);
      }

      const { updateSession } = await import("@/lib/supabase/middleware");
      const res = await updateSession(req);
      expect(res.headers.get("location")).toBeNull();
      expect(res.status).toBe(200);
    });
  });
});

/**
 * Produces a syntactically valid HS256 JWT with the given subject and an `exp`
 * far in the past. Supabase rejects it as expired and falls back to the refresh
 * token. The signature need not verify — expiry is checked before signature in
 * the client's refresh decision, and GoTrue re-issues from the refresh token.
 */
function makeExpiredJwt(sub: string): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    JSON.stringify({
      sub,
      role: "authenticated",
      aud: "authenticated",
      iat: now - 7200,
      exp: now - 3600,
    }),
  );
  return `${header}.${payload}.invalidsignature`;
}

function b64url(input: string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Rewrites the session cookie(s) in `store` so the persisted access_token is the
 * given expired JWT (and expires_at is in the past), leaving refresh_token
 * untouched. Handles @supabase/ssr's `base64-` prefix and chunked cookies by
 * reassembling, mutating the JSON session, then re-encoding into a single cookie
 * under the base auth-token name (chunks are dropped — the value fits unchunked).
 */
function expireStoredAccessToken(
  store: FakeCookieStore,
  expiredAccess: string,
): void {
  const cookies = store
    .getAll()
    .filter((c) => c.name.includes("auth-token"));
  if (cookies.length === 0) throw new Error("no auth-token cookie to expire");

  // Reassemble chunks: base name first, then .0, .1, ... in order.
  const base = cookies.find((c) => /auth-token$/.test(c.name)) ?? cookies[0];
  const chunked = cookies
    .filter((c) => /auth-token\.\d+$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const raw = chunked.length
    ? chunked.map((c) => c.value).join("")
    : base.value;

  const decoded = raw.startsWith("base64-")
    ? Buffer.from(raw.slice("base64-".length), "base64").toString("utf8")
    : decodeURIComponent(raw);
  const session = JSON.parse(decoded);

  session.access_token = expiredAccess;
  session.expires_at = Math.floor(Date.now() / 1000) - 3600;
  session.expires_in = 0;

  const reEncoded =
    "base64-" + Buffer.from(JSON.stringify(session), "utf8").toString("base64");

  // Clear any existing chunks, then write the mutated session unchunked.
  for (const c of chunked) store.set(c.name, "");
  store.set(base.name, reEncoded);
}
