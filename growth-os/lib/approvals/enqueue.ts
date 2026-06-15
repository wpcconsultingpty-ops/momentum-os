// Pure, framework-free helpers for the Instagram approvals enqueue flow.
// Extracted from app/api/cron/enqueue-approvals/route.ts so the logic can be
// unit-tested without Next.js or Supabase. The route imports from here.

export type DraftRow = {
 id: string;
 owner_id: string;
 caption: string | null;
 utm_campaign: string | null;
};

export type ScheduledPostInsert = {
 owner_id: string;
 content_id: string;
 caption: string;
 image_url: string;
 utm_campaign: string | null;
 status: "pending_approval";
};

// Derive the on-image hook the same way the Approvals preview does: first
// sentence of the caption, capped at 160 chars, rendered via /api/og-post.
export function previewImage(caption: string | null): string {
 const text = caption ?? "";
 const firstSentence = text.split(/(?<=[.!?])\s/)[0].trim();
 const hook = (firstSentence || text || "Momentum").slice(0, 160);
 return `/api/og-post?hook=${encodeURIComponent(hook)}`;
}

// Given the instagram drafts and the set of content_ids already linked to a
// scheduled_posts row, build the pending_approval rows to insert. Drafts that
// are already queued are skipped, making the enqueue idempotent.
export function buildPendingInserts(
 drafts: DraftRow[],
 alreadyQueuedContentIds: Iterable<string>,
): ScheduledPostInsert[] {
 const alreadyQueued = new Set(alreadyQueuedContentIds);
 return drafts
 .filter((d) => !alreadyQueued.has(d.id))
 .map((d) => ({
 owner_id: d.owner_id,
 content_id: d.id,
 caption: d.caption ?? "",
 image_url: previewImage(d.caption),
 utm_campaign: d.utm_campaign ?? null,
 status: "pending_approval" as const,
 }));
}
