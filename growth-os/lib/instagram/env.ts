// Instagram Graph API environment configuration.
// Follows the same `required()` pattern as lib/supabase/env.ts.

function required(name: string): string {
const value = process.env[name];
if (!value) {
throw new Error(`Missing required environment variable: ${name}`);
}
return value;
}

// Graph API version used for all calls. Override via env if Meta deprecates.
export function getGraphApiVersion(): string {
return process.env.IG_GRAPH_API_VERSION ?? "v21.0";
}

// The Instagram Business/Creator account user id (IG user id), numeric string.
export function getIgUserId(): string {
return required("IG_USER_ID");
}

// Long-lived page/IG access token. Server-only secret. Never expose to client.
export function getIgAccessToken(): string {
return required("IG_ACCESS_TOKEN");
}

// Shared secret protecting the internal publish route.
export function getPublishSecret(): string {
return required("IG_PUBLISH_SECRET");
}
