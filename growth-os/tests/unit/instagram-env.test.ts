import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Pure env-config helpers for the Instagram Graph API. No network or SDK.
// We snapshot and restore the relevant env vars around each test.
describe("instagram env config", () => {
  const KEYS = [
    "IG_GRAPH_API_VERSION",
    "IG_USER_ID",
    "IG_ACCESS_TOKEN",
    "IG_PUBLISH_SECRET",
  ] as const;

  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) {
      prev[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it("getGraphApiVersion defaults to v21.0 when unset", async () => {
    const { getGraphApiVersion } = await import("@/lib/instagram/env");
    expect(getGraphApiVersion()).toBe("v21.0");
  });

  it("getGraphApiVersion honours an override", async () => {
    process.env.IG_GRAPH_API_VERSION = "v22.0";
    const { getGraphApiVersion } = await import("@/lib/instagram/env");
    expect(getGraphApiVersion()).toBe("v22.0");
  });

  it("getIgUserId returns the configured value", async () => {
    process.env.IG_USER_ID = "17841400000000000";
    const { getIgUserId } = await import("@/lib/instagram/env");
    expect(getIgUserId()).toBe("17841400000000000");
  });

  it("getIgUserId throws when missing", async () => {
    const { getIgUserId } = await import("@/lib/instagram/env");
    expect(() => getIgUserId()).toThrow(/IG_USER_ID/);
  });

  it("getIgAccessToken returns the configured value", async () => {
    process.env.IG_ACCESS_TOKEN = "tok_123";
    const { getIgAccessToken } = await import("@/lib/instagram/env");
    expect(getIgAccessToken()).toBe("tok_123");
  });

  it("getIgAccessToken throws when missing", async () => {
    const { getIgAccessToken } = await import("@/lib/instagram/env");
    expect(() => getIgAccessToken()).toThrow(/IG_ACCESS_TOKEN/);
  });

  it("getPublishSecret returns the configured value", async () => {
    process.env.IG_PUBLISH_SECRET = "sekret";
    const { getPublishSecret } = await import("@/lib/instagram/env");
    expect(getPublishSecret()).toBe("sekret");
  });

  it("getPublishSecret throws when missing", async () => {
    const { getPublishSecret } = await import("@/lib/instagram/env");
    expect(() => getPublishSecret()).toThrow(/IG_PUBLISH_SECRET/);
  });
});
