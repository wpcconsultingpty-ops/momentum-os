#!/usr/bin/env node
// Compute an HMAC-SHA256 signature for a webhook payload.
//
// Usage:
//   node scripts/sign.mjs <secret> '<json-body>'
//   echo '<json-body>' | node scripts/sign.mjs <secret>
//
// Prints the hex digest. For Meta/Instagram, prefix with "sha256=".

import crypto from "node:crypto";

const secret = process.argv[2];
if (!secret) {
  console.error("usage: node scripts/sign.mjs <secret> '<json-body>'");
  process.exit(1);
}

function readBody() {
  const arg = process.argv[3];
  if (typeof arg === "string") return Promise.resolve(arg);
  return new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data.trim()));
  });
}

const body = await readBody();
const digest = crypto
  .createHmac("sha256", secret)
  .update(body, "utf8")
  .digest("hex");

process.stdout.write(digest + "\n");
