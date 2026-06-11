import crypto from "crypto";

/**
 * Verifies an HMAC-SHA256 signature over the raw request body using a
 * constant-time comparison. Accepts signatures with or without a
 * `sha256=` prefix (Meta sends `x-hub-signature-256: sha256=...`).
 */
export function verifyHmacSha256(
  secret: string,
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!secret || !signatureHeader) return false;

  const received = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  const receivedBuf = Buffer.from(received, "hex");
  const expectedBuf = Buffer.from(expected, "hex");

  if (receivedBuf.length !== expectedBuf.length) return false;

  return crypto.timingSafeEqual(receivedBuf, expectedBuf);
}

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}
