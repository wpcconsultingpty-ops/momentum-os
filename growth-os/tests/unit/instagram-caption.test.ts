import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// generateCaption() calls the OpenAI Chat Completions REST API via fetch.
// We stub global.fetch so no network request is made, and snapshot env.
describe("generateCaption", () => {
  const prevKey = process.env.OPENAI_API_KEY;
  const prevModel = process.env.OPENAI_CAPTION_MODEL;
  const realFetch = global.fetch;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "sk-test";
    delete process.env.OPENAI_CAPTION_MODEL;
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevKey;
    if (prevModel === undefined) delete process.env.OPENAI_CAPTION_MODEL;
    else process.env.OPENAI_CAPTION_MODEL = prevModel;
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  function mockFetch(payload: unknown, ok = true, status = 200) {
    const fn = vi.fn().mockResolvedValue({
      ok,
      status,
      json: async () => payload,
    });
    global.fetch = fn as unknown as typeof fetch;
    return fn;
  }

  it("throws when OPENAI_API_KEY is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    const { generateCaption } = await import("@/lib/instagram/caption");
    await expect(generateCaption({ topic: "stoicism" })).rejects.toThrow(
      /OPENAI_API_KEY/,
    );
  });

  it("returns the trimmed caption on success", async () => {
    mockFetch({ choices: [{ message: { content: "  Be present.  " } }] });
    const { generateCaption } = await import("@/lib/instagram/caption");
    const caption = await generateCaption({ topic: "focus", tone: "calm" });
    expect(caption).toBe("Be present.");
  });

  it("includes a preferred-hashtags line in the prompt when supplied", async () => {
    const fn = mockFetch({
      choices: [{ message: { content: "Stay the course." } }],
    });
    const { generateCaption } = await import("@/lib/instagram/caption");
    await generateCaption({ topic: "discipline", hashtags: ["#stoic", "#focus"] });
    const body = JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string);
    const userMsg = body.messages[1].content as string;
    expect(userMsg).toContain("#stoic #focus");
  });

  it("throws with the API error message when the response is not ok", async () => {
    mockFetch({ error: { message: "rate limited" } }, false, 429);
    const { generateCaption } = await import("@/lib/instagram/caption");
    await expect(generateCaption({ topic: "x" })).rejects.toThrow(/rate limited/);
  });

  it("throws when the model returns an empty caption", async () => {
    mockFetch({ choices: [{ message: { content: "   " } }] });
    const { generateCaption } = await import("@/lib/instagram/caption");
    await expect(generateCaption({ topic: "x" })).rejects.toThrow(/empty caption/);
  });
});
