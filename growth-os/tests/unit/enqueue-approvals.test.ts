import { describe, it, expect } from "vitest";
import {
 previewImage,
 buildPendingInserts,
 type DraftRow,
} from "@/lib/approvals/enqueue";

describe("previewImage", () => {
 it("uses the first sentence as the hook", () => {
 const url = previewImage("Hello world. Second sentence here.");
 expect(url).toBe(`/api/og-post?hook=${encodeURIComponent("Hello world.")}`);
 });

 it("caps the hook at 160 characters", () => {
 const long = "a".repeat(300);
 const url = previewImage(long);
 const hook = decodeURIComponent(url.split("hook=")[1]);
 expect(hook.length).toBe(160);
 });

 it("falls back to Momentum for empty/null captions", () => {
 const expected = `/api/og-post?hook=${encodeURIComponent("Momentum")}`;
 expect(previewImage("")).toBe(expected);
 expect(previewImage(null)).toBe(expected);
 });
});

describe("buildPendingInserts", () => {
 const drafts: DraftRow[] = [
 { id: "c1", owner_id: "o1", caption: "First post.", utm_campaign: "spring" },
 { id: "c2", owner_id: "o1", caption: null, utm_campaign: null },
 { id: "c3", owner_id: "o2", caption: "Third post.", utm_campaign: null },
 ];

 it("creates one pending_approval row per un-queued draft", () => {
 const rows = buildPendingInserts(drafts, []);
 expect(rows).toHaveLength(3);
 expect(rows.every((r) => r.status === "pending_approval")).toBe(true);
 expect(rows[0]).toMatchObject({
 owner_id: "o1",
 content_id: "c1",
 caption: "First post.",
 utm_campaign: "spring",
 });
 });

 it("skips drafts already linked to a scheduled post (idempotent)", () => {
 const rows = buildPendingInserts(drafts, ["c1", "c3"]);
 expect(rows.map((r) => r.content_id)).toEqual(["c2"]);
 });

 it("returns an empty array when every draft is already queued", () => {
 const rows = buildPendingInserts(drafts, ["c1", "c2", "c3"]);
 expect(rows).toEqual([]);
 });

 it("normalises null caption and utm_campaign", () => {
 const rows = buildPendingInserts(drafts, ["c1", "c3"]);
 expect(rows[0].caption).toBe("");
 expect(rows[0].utm_campaign).toBeNull();
 });
});
