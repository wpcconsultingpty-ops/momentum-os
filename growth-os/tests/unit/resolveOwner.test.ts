import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveOwnerId } from "@/lib/webhooks/resolveOwner";

const OWNER = "11111111-1111-1111-1111-111111111111";

describe("resolveOwnerId", () => {
  const original = process.env.OWNER_USER_ID;

  beforeEach(() => {
    delete process.env.OWNER_USER_ID;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.OWNER_USER_ID;
    else process.env.OWNER_USER_ID = original;
  });

  it("returns OWNER_USER_ID when the env var is set", () => {
    process.env.OWNER_USER_ID = OWNER;
    expect(resolveOwnerId({ any: "payload" })).toBe(OWNER);
  });

  it("ignores the payload (single-tenant) and always returns the env owner", () => {
    process.env.OWNER_USER_ID = OWNER;
    expect(resolveOwnerId(null)).toBe(OWNER);
    expect(resolveOwnerId({ owner: "someone-else" })).toBe(OWNER);
  });

  it("throws when OWNER_USER_ID is missing", () => {
    expect(() => resolveOwnerId({})).toThrowError(
      /Missing required environment variable: OWNER_USER_ID/,
    );
  });
});
