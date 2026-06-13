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

async function graphPost(path: string, params: Record<string, string>): Promise<any> {
const body = new URLSearchParams({ ...params, access_token: getIgAccessToken() });
const res = await fetch(`${graphBase()}/${path}`, {
method: "POST",
headers: { "Content-Type": "application/x-www-form-urlencoded" },
body,
cache: "no-store",
});
const json = await res.json();
if (!res.ok || json.error) {
const message = json?.error?.message ?? `Graph API error (${res.status})`;
throw new Error(message);
}
return json;
}

async function graphGet(path: string, params: Record<string, string>): Promise<any> {
const qs = new URLSearchParams({ ...params, access_token: getIgAccessToken() });
const res = await fetch(`${graphBase()}/${path}?${qs.toString()}`, { cache: "no-store" });
const json = await res.json();
if (!res.ok || json.error) {
const message = json?.error?.message ?? `Graph API error (${res.status})`;
throw new Error(message);
}
return json;
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
const mediaId = await publishMediaContainer(creationId);
const permalink = await getMediaPermalink(mediaId);
return { creationId, mediaId, permalink };
}
