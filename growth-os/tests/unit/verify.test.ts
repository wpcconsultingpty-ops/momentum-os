import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex, verifyHmacSha256 } from "@/lib/webhooks/verify";

const SECRET = "test-secret-do-not-use-in-prod";

function sign(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

describe("verifyHmacSha256", () => {
  const body = JSON.stringify({ hello: "world", n: 42 });

  it("returns true for a valid signature with the sha256= prefix", () => {
    const sig = `sha256=${sign(SECRET, body)}`;
    expect(verifyHmacSha256(SECRET, body, sig)).toBe(true);
  });

  it("returns true for a valid signature without the sha256= prefix", () => {
    const sig = sign(SECRET, body);
    expect(verifyHmacSha256(SECRET, body, sig)).toBe(true);
  });

  it("returns false for an invalid (wrong-secret) signature", () => {
    const sig = sign("a-different-secret", body);
    expect(verifyHmacSha256(SECRET, body, sig)).toBe(false);
  });

  it("returns false when the signature header is null", () => {
    expect(verifyHmacSha256(SECRET, body, null)).toBe(false);
  });

  it("returns false when the secret is empty", () => {
    const sig = sign(SECRET, body);
    expect(verifyHmacSha256("", body, sig)).toBe(false);
  });

  it("returns false for a wrong-length signature without throwing", () => {
    expect(() => verifyHmacSha256(SECRET, body, "sha256=deadbeef")).not.toThrow();
    expect(verifyHmacSha256(SECRET, body, "sha256=deadbeef")).toBe(false);
  });

  it("returns false when the body is tampered but the signature is unchanged", () => {
    const sig = `sha256=${sign(SECRET, body)}`;
    const tampered = JSON.stringify({ hello: "world", n: 43 });
    expect(verifyHmacSha256(SECRET, tampered, sig)).toBe(false);
  });

  it("is deterministic: signing the same body twice yields the same signature", () => {
    expect(sign(SECRET, body)).toBe(sign(SECRET, body));
  });
});

describe("sha256Hex", () => {
  it("produces a stable 64-char hex digest", () => {
    const a = sha256Hex("some-body");
    expect(a).toHaveLength(64);
    expect(a).toBe(sha256Hex("some-body"));
  });

  it("produces different digests for different inputs", () => {
    expect(sha256Hex("a")).not.toBe(sha256Hex("b"));
  });
});
