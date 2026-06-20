import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// These tests verify the rate-limit-aware retry in lib/instagram/publish.
// We stub global.fetch and set IG_* env vars so no real network calls happen.
// IG_RATE_LIMIT_BASE_DELAY_MS=0 makes backoff instant so tests run fast.
describe("instagram rate-limit retry", () => {
const KEYS = [
"IG_USER_ID",
"IG_ACCESS_TOKEN",
"IG_GRAPH_API_VERSION",
"IG_RATE_LIMIT_BASE_DELAY_MS",
"IG_RATE_LIMIT_MAX_RETRIES",
] as const;
const prev: Record<string, string | undefined> = {};
const realFetch = global.fetch;

beforeEach(() => {
for (const k of KEYS) prev[k] = process.env[k];
process.env.IG_USER_ID = "17841400000000000";
process.env.IG_ACCESS_TOKEN = "tok_123";
process.env.IG_GRAPH_API_VERSION = "v21.0";
process.env.IG_RATE_LIMIT_BASE_DELAY_MS = "0";
process.env.IG_RATE_LIMIT_MAX_RETRIES = "4";
});

afterEach(() => {
for (const k of KEYS) {
if (prev[k] === undefined) delete process.env[k];
else process.env[k] = prev[k];
}
global.fetch = realFetch;
vi.restoreAllMocks();
});

// Build a fetch stub returning the given JSON payloads in sequence.
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

const rateLimited = { ok: false, status: 400, json: { error: { message: "(#4) Application request limit reached", code: 4 } } };

it("retries on a rate-limit error and then succeeds", async () => {
const fn = fetchReturning(rateLimited, rateLimited, { json: { id: "container_1" } });
const { createMediaContainer } = await import("@/lib/instagram/publish");
const id = await createMediaContainer({ imageUrl: "https://x/i.jpg", caption: "hi" });
expect(id).toBe("container_1");
expect(fn).toHaveBeenCalledTimes(3);
});

it("gives up after exhausting retries and throws the rate-limit error", async () => {
// max retries = 1 -> 2 total attempts, both rate limited.
process.env.IG_RATE_LIMIT_MAX_RETRIES = "1";
const fn = fetchReturning(rateLimited, rateLimited);
const { createMediaContainer } = await import("@/lib/instagram/publish");
await expect(
createMediaContainer({ imageUrl: "https://x/i.jpg", caption: "hi" })
).rejects.toThrow(/request limit reached/i);
expect(fn).toHaveBeenCalledTimes(2);
});

it("does NOT retry on a non-rate-limit error", async () => {
const fn = fetchReturning({
ok: false,
status: 400,
json: { error: { message: "Invalid OAuth access token", code: 190 } },
});
const { createMediaContainer } = await import("@/lib/instagram/publish");
await expect(
createMediaContainer({ imageUrl: "https://x/i.jpg", caption: "hi" })
).rejects.toThrow(/Invalid OAuth access token/i);
expect(fn).toHaveBeenCalledTimes(1);
});

it("withRateLimitRetry succeeds on first try without retrying", async () => {
const { withRateLimitRetry } = await import("@/lib/instagram/publish");
const fn = vi.fn().mockResolvedValue("ok");
const result = await withRateLimitRetry(fn);
expect(result).toBe("ok");
expect(fn).toHaveBeenCalledTimes(1);
});

it("respects IG_RATE_LIMIT_MAX_RETRIES=0 (no retries)", async () => {
process.env.IG_RATE_LIMIT_MAX_RETRIES = "0";
const fn = fetchReturning(rateLimited);
const { createMediaContainer } = await import("@/lib/instagram/publish");
await expect(
createMediaContainer({ imageUrl: "https://x/i.jpg", caption: "hi" })
).rejects.toThrow(/request limit reached/i);
expect(fn).toHaveBeenCalledTimes(1);
});
});
