import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The browser client wraps @supabase/ssr's createBrowserClient with env-sourced
// config. We mock the wrapped factory (it boots a Realtime WebSocket otherwise)
// and assert lib/supabase/client.ts forwards the env values correctly.
const created = vi.fn((url: string, key: string) => ({ url, key }));
vi.mock("@supabase/ssr", () => ({
  createBrowserClient: (url: string, key: string) => created(url, key),
}));

describe("browser supabase client", () => {
  const prev = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };

  beforeEach(() => {
    created.mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = prev.url;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prev.anon;
  });

  it("forwards the configured url and anon key", async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const client = createClient();
    expect(created).toHaveBeenCalledWith("http://127.0.0.1:54321", "anon-key");
    expect(client).toEqual({ url: "http://127.0.0.1:54321", key: "anon-key" });
  });
});
