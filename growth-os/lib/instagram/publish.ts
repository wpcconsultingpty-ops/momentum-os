// Instagram content publishing via the Graph API.
// Two-step flow: 1) create a media container, 2) publish the container.
// Docs: https://developers.facebook.com/docs/instagram-api/guides/content-publishing
// Server-only module: it reads IG_ACCESS_TOKEN. Never import from a client component.
import { getGraphApiVersion, getIgAccessToken, getIgUserId } from "./env";

export interface CreateContainerInput {
  imageUrl: string;
  caption: string;
}

export interface PublishResult {
  creationId: string;
  mediaId: string;
  permalink: string | null;
}

function graphBase(): string {
  return `https://graph.instagram.com/${getGraphApiVersion()}`;
}

// --- Rate-limit-aware retry ---------------------------------------------
// Instagram Graph API returns specific error codes when an app/user has hit a
// request limit. These are transient: retrying after a short backoff usually
// succeeds once the rolling window frees up. We retry only on these codes so we
// never mask genuine failures (bad token, invalid media, etc.).
// Refs: code 4 (app rate limit), 17 (user rate limit), 32 (page rate limit),
// 613 (custom-level throttling).
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

// Captures the full Graph API error envelope so failures are diagnosable.
// Instagram often returns a terse top-level `message` (e.g. "Fatal"); the
// actionable detail lives in error_user_title/error_user_msg/error_subcode,
// and fbtrace_id is what Meta support needs to investigate a specific failure.
export class GraphApiError extends Error {
  code?: number;
  status?: number;
  subcode?: number;
  userTitle?: string;
  userMessage?: string;
  fbtraceId?: string;

  constructor(
    message: string,
    opts: {
      code?: number;
      status?: number;
      subcode?: number;
      userTitle?: string;
      userMessage?: string;
      fbtraceId?: string;
    } = {},
  ) {
    super(message);
    this.name = "GraphApiError";
    this.code = opts.code;
    this.status = opts.status;
    this.subcode = opts.subcode;
    this.userTitle = opts.userTitle;
    this.userMessage = opts.userMessage;
    this.fbtraceId = opts.fbtraceId;
  }

  // Human-friendly, diagnosable string for storage/logging. Prefers the
  // user-facing message Meta provides, then appends codes + trace id.
  toDetail(): string {
    const headline = this.userMessage || this.userTitle || this.message;
    const parts: string[] = [];
    if (typeof this.code === "number") parts.push(`code ${this.code}`);
    if (typeof this.subcode === "number") parts.push(`subcode ${this.subcode}`);
    if (this.fbtraceId) parts.push(`fbtrace_id ${this.fbtraceId}`);
    return parts.length ? `${headline} (${parts.join(", ")})` : headline;
  }
}

function isRateLimitError(err: unknown): boolean {
  if (!(err instanceof GraphApiError)) return false;
  if (err.status === 429) return true;
  if (typeof err.code === "number" && RATE_LIMIT_CODES.has(err.code)) return true;
  return /request limit reached|rate limit|too many calls/i.test(err.message);
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// Number of retry attempts after the initial try (0 disables retries).
function maxRetries(): number {
  return intFromEnv("IG_RATE_LIMIT_MAX_RETRIES", 4);
}

// Base delay in ms for exponential backoff (delay = base * 2**attempt + jitter).
function baseDelayMs(): number {
  return intFromEnv("IG_RATE_LIMIT_BASE_DELAY_MS", 1000);
}

function backoffDelay(attempt: number): number {
  const base = baseDelayMs();
  const exp = base * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * base);
  return exp + jitter;
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// Runs fn, retrying with exponential backoff only when a rate-limit error is hit.
export async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  const retries = maxRetries();
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= retries || !isRateLimitError(err)) throw err;
      await sleep(backoffDelay(attempt));
    }
  }
  throw lastErr;
}

// Builds a GraphApiError from the full Instagram error envelope. Instagram
// nests the actionable fields under `error`, so we lift them all out here.
function graphErrorFrom(json: any, status: number): GraphApiError {
  const e = json?.error ?? {};
  const message = e.message ?? `Graph API error (${status})`;
  return new GraphApiError(message, {
    code: typeof e.code === "number" ? e.code : undefined,
    status,
    subcode: typeof e.error_subcode === "number" ? e.error_subcode : undefined,
    userTitle: e.error_user_title,
    userMessage: e.error_user_msg,
    fbtraceId: e.fbtrace_id,
  });
}

async function graphPost(path: string, params: Record<string, string>): Promise<any> {
  return withRateLimitRetry(async () => {
    const body = new URLSearchParams({ ...params, access_token: getIgAccessToken() });
    const res = await fetch(`${graphBase()}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    const json = await res.json();
    if (!res.ok || json.error) throw graphErrorFrom(json, res.status);
    return json;
  });
}

async function graphGet(path: string, params: Record<string, string>): Promise<any> {
  return withRateLimitRetry(async () => {
    const qs = new URLSearchParams({ ...params, access_token: getIgAccessToken() });
    const res = await fetch(`${graphBase()}/${path}?${qs.toString()}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || json.error) throw graphErrorFrom(json, res.status);
    return json;
  });
}

// Step 1: create a media container. Returns the creation (container) id.
export async function createMediaContainer(input: CreateContainerInput): Promise<string> {
  const json = await graphPost(`${getIgUserId()}/media`, {
    image_url: input.imageUrl,
    caption: input.caption,
  });
  if (!json.id) throw new Error("Graph API did not return a media container id");
  return json.id as string;
}

// Optional: poll container status before publishing (recommended for reliability).
export async function getContainerStatus(creationId: string): Promise<string> {
  const json = await graphGet(creationId, { fields: "status_code" });
  return (json.status_code as string) ?? "UNKNOWN";
}

// Step 2: publish a previously-created container. Returns the published media id.
export async function publishMediaContainer(creationId: string): Promise<string> {
  const json = await graphPost(`${getIgUserId()}/media_publish`, {
    creation_id: creationId,
  });
  if (!json.id) throw new Error("Graph API did not return a published media id");
  return json.id as string;
}

// Fetch the public permalink for a published media id (best-effort).
export async function getMediaPermalink(mediaId: string): Promise<string | null> {
  try {
    const json = await graphGet(mediaId, { fields: "permalink" });
    return (json.permalink as string) ?? null;
  } catch {
    return null;
  }
}

// Full convenience flow: container -> publish -> permalink.
export async function publishImagePost(input: CreateContainerInput): Promise<PublishResult> {
  const creationId = await createMediaContainer(input);
  // Wait for the container to finish processing before publishing (avoids "Media ID is not available").
  const maxAttempts = 30;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await getContainerStatus(creationId);
    if (status === "FINISHED") break;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new Error(`Media container ${creationId} failed with status: ${status}`);
    }
    // Not ready yet; wait before polling again (IN_PROGRESS).
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  const mediaId = await publishMediaContainer(creationId);
  const permalink = await getMediaPermalink(mediaId);
  return { creationId, mediaId, permalink };
}
