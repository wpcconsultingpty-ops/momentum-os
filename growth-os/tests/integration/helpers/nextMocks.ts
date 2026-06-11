import { FakeCookieStore } from "./fakeCookies";

/**
 * Mutable holder for the cookie store that the mocked `next/headers` `cookies()`
 * resolves to. Tests reassign `.store` before invoking a server action / route
 * handler so each call sees the session (or absence) it wants.
 *
 * `vi.mock` is hoisted per-file, so each test file declares the mock inline and
 * has its factory read from this shared ref.
 */
export const cookieStoreRef: { store: FakeCookieStore } = {
  store: new FakeCookieStore(),
};

/**
 * Sentinel thrown by the mocked `next/navigation` `redirect()`, mirroring Next's
 * real behaviour of unwinding the stack. Lets tests assert the target path.
 */
export class RedirectError extends Error {
  constructor(public readonly path: string) {
    super(`NEXT_REDIRECT:${path}`);
    this.name = "RedirectError";
  }
}

export function redirectMock(path: string): never {
  throw new RedirectError(path);
}

/**
 * Runs `fn` and returns the redirect path it triggered, or throws if it
 * completed without redirecting.
 */
export async function captureRedirect(
  fn: () => Promise<unknown>,
): Promise<string> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof RedirectError) return err.path;
    throw err;
  }
  throw new Error("expected a redirect but none occurred");
}
