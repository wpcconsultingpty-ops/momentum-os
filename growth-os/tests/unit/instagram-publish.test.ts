import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// publish.ts talks to the Instagram Graph API via fetch. We stub global.fetch
// so no real network calls happen, and set the required IG_* env vars.
describe("instagram publish (Graph API)", () => {
  const KEYS = ["IG_USER_ID", "IG_ACCESS_TOKEN", "IG_GRAPH_API_VERSION"] as const;
  const prev: Record<string, string | undefined> = {};
  const realFetch = global.fetch;

  beforeEach(() => {
    for (const k of KEYS) prev[k] = process.env[k];
    process.env.IG_USER_ID = "17841400000000000";
    process.env.IG_ACCESS_TOKEN = "tok_123";
    process.env.IG_GRAPH_API_VERSION = "v21.0";
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  // Build a fetch stub that returns the given JSON payloads in sequence.
  function fetchReturning(...responses: Array<{ ok?: boolean; status?: number; json: unknown }>) {
    const fn = vi.fn();
    for (const r of responses) {
      fn.mockResolvedValueOnce({
        ok: r.ok ?? true,
        status: r.status ?? 200,
        json: async () => r.json,
      });
    }
    global.fetch = fn as unknown as typeof fetch;
    return fn;
  }

  it("createMediaContainer returns the container id", async () => {
    fetchReturning({ json: { id: "container_1" } });
    const { createMediaContainer } = await import("@/lib/instagram/publish");
    const id = await createMediaContainer({ imageUrl: "https://x/i.jpg", caption: "hi" });
    expect(id).toBe("container_1");
  });

  it("createMediaContainer throws when no id is returned", async () => {
    fetchReturning({ json: {} });
    const { createMediaContainer } = await import("@/lib/instagram/publish");
    await expect(
      createMediaContainer({ imageUrl: "https://x/i.jpg", caption: "hi" }),
    ).rejects.toThrow(/media container id/);
  });

  it("graph errors surface the API message", async () => {
    fetchReturning({ ok: false, status: 400, json: { error: { message: "bad image" } } });
    const { createMediaContainer } = await import("@/lib/instagram/publish");
    await expect(
      createMediaContainer({ imageUrl: "https://x/i.jpg", caption: "hi" }),
    ).rejects.toThrow(/bad image/);
  });

  it("getContainerStatus returns the status code, defaulting to UNKNOWN", async () => {
    fetchReturning({ json: { status_code: "FINISHED" } }, { json: {} });
    const { getContainerStatus } = await import("@/lib/instagram/publish");
    expect(await getContainerStatus("c1")).toBe("FINISHED");
    expect(await getContainerStatus("c1")).toBe("UNKNOWN");
  });

  it("publishMediaContainer returns the media id", async () => {
    fetchReturning({ json: { id: "media_1" } });
    const { publishMediaContainer } = await import("@/lib/instagram/publish");
    expect(await publishMediaContainer("c1")).toBe("media_1");
  });

  it("publishMediaContainer throws when no id is returned", async () => {
    fetchReturning({ json: {} });
    const { publishMediaContainer } = await import("@/lib/instagram/publish");
    await expect(publishMediaContainer("c1")).rejects.toThrow(/published media id/);
  });

  it("getMediaPermalink returns the permalink, or null on error", async () => {
    fetchReturning({ json: { permalink: "https://instagram.com/p/abc" } });
    const { getMediaPermalink } = await import("@/lib/instagram/publish");
    expect(await getMediaPermalink("m1")).toBe("https://instagram.com/p/abc");

    fetchReturning({ ok: false, status: 500, json: { error: { message: "boom" } } });
    expect(await getMediaPermalink("m1")).toBeNull();
  });

  it("publishImagePost runs the full container -> publish -> permalink flow", async () => {
    fetchReturning(
      { json: { id: "container_9" } }, // createMediaContainer
      { json: { status_code: "FINISHED" } }, // getContainerStatus (breaks loop)
      { json: { id: "media_9" } }, // publishMediaContainer
      { json: { permalink: "https://instagram.com/p/xyz" } }, // getMediaPermalink
    );
    const { publishImagePost } = await import("@/lib/instagram/publish");
    const result = await publishImagePost({ imageUrl: "https://x/i.jpg", caption: "hi" });
    expect(result).toEqual({
      creationId: "container_9",
      mediaId: "media_9",
      permalink: "https://instagram.com/p/xyz",
    });
  });

  it("publishImagePost throws when the container fails processing", async () => {
    fetchReturning(
      { json: { id: "container_err" } },
      { json: { status_code: "ERROR" } },
    );
    const { publishImagePost } = await import("@/lib/instagram/publish");
    await expect(
      publishImagePost({ imageUrl: "https://x/i.jpg", caption: "hi" }),
    ).rejects.toThrow(/failed with status: ERROR/);
  });
});
