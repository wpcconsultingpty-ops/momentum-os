import { describe, it, expect, vi, beforeEach } from "vitest";

// Unit tests for the on-demand CAROUSEL draft generator.
// We mock every external collaborator (auth, supabase, the draft factory and
// next/cache) so the test exercises only the orchestration logic in
// generateCarouselDraft: auth gating, count validation, content insertion,
// the bridge into scheduled_posts with media_type CAROUSEL + slides, and the
// revalidatePath calls. Nothing here hits a network or a real database.

// --- Mutable mock state, reset before each test -----------------------------
let mockUserId: string | null;
let draftsToReturn: Array<{ caption: string; utm_campaign: string; theme: "light" | "dark" }>;
let contentInsertError: unknown;
let scheduledInsertError: unknown;

// Captures the rows passed to .insert() so assertions can inspect them.
const contentInserts: any[] = [];
const scheduledInserts: any[] = [];

// A chainable Supabase query-builder stub. Each table call records its inserts
// and returns the configured data/error so we can drive both happy and error
// paths without a live client.
function makeSupabaseMock() {
  return {
    from(table: string) {
      if (table === "content") {
        return {
          // recent-captions read path
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
          insert(row: any) {
            contentInserts.push(row);
            return {
              select: () => ({
                single: async () => ({
                  data: contentInsertError ? null : { id: contentInserts.length },
                  error: contentInsertError ?? null,
                }),
              }),
            };
          },
        };
      }
      if (table === "scheduled_posts") {
        return {
          insert: async (row: any) => {
            scheduledInserts.push(row);
            return { error: scheduledInsertError ?? null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

// --- Module mocks -----------------------------------------------------------
vi.mock("@/lib/auth", () => ({
  getUserId: vi.fn(async () => mockUserId),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => makeSupabaseMock()),
}));

vi.mock("@/lib/content/generate", () => ({
  generateDrafts: vi.fn(async () => draftsToReturn),
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

// Import after mocks are registered (server action pulls these at module load).
import { generateCarouselDraft } from "@/app/dashboard/content/carousel-actions";

function formDataWith(count?: string): FormData {
  const fd = new FormData();
  if (count !== undefined) fd.set("count", count);
  return fd;
}

describe("generateCarouselDraft", () => {
  beforeEach(() => {
    mockUserId = "owner-1";
    draftsToReturn = [
      { caption: "Own your day. Track habits in real time. Start here.", utm_campaign: "ig-x-1", theme: "dark" },
    ];
    contentInsertError = null;
    scheduledInsertError = null;
    contentInserts.length = 0;
    scheduledInserts.length = 0;
    revalidatePath.mockClear();
  });

  it("returns Not authenticated when there is no user", async () => {
    mockUserId = null;
    const res = await generateCarouselDraft(formDataWith("3"));
    expect(res).toEqual({ ok: false, error: "Not authenticated" });
    expect(contentInserts).toHaveLength(0);
  });

  it("rejects an out-of-range count", async () => {
    const res = await generateCarouselDraft(formDataWith("99"));
    expect(res.ok).toBe(false);
    expect(res.error).toBe("Invalid count");
  });

  it("defaults to a valid count when none is supplied", async () => {
    const res = await generateCarouselDraft(formDataWith());
    expect(res.ok).toBe(true);
    expect(contentInserts).toHaveLength(1);
  });

  it("inserts a draft content row for each generated draft", async () => {
    draftsToReturn = [
      { caption: "One. Two.", utm_campaign: "ig-a-1", theme: "light" },
      { caption: "Three. Four.", utm_campaign: "ig-b-2", theme: "dark" },
    ];
    const res = await generateCarouselDraft(formDataWith("2"));
    expect(res).toEqual({ ok: true, created: 2 });
    expect(contentInserts).toHaveLength(2);
    expect(contentInserts[0]).toMatchObject({
      owner_id: "owner-1",
      platform: "instagram",
      status: "draft",
    });
  });

  it("bridges into scheduled_posts as a CAROUSEL with a slides array", async () => {
    await generateCarouselDraft(formDataWith("1"));
    expect(scheduledInserts).toHaveLength(1);
    const row = scheduledInserts[0];
    expect(row.media_type).toBe("CAROUSEL");
    expect(Array.isArray(row.slides)).toBe(true);
    expect(row.slides.length).toBeGreaterThanOrEqual(2);
    expect(row.content_id).toBe(1);
    expect(row.owner_id).toBe("owner-1");
  });

  it("reports failure and skips the bridge when the content insert errors", async () => {
    contentInsertError = { message: "insert failed" };
    const res = await generateCarouselDraft(formDataWith("1"));
    expect(res).toEqual({ ok: false, error: "No carousel drafts were created" });
    expect(scheduledInserts).toHaveLength(0);
  });

  it("still succeeds when the scheduled_posts bridge errors (non-fatal)", async () => {
    scheduledInsertError = { message: "bridge failed" };
    const res = await generateCarouselDraft(formDataWith("1"));
    expect(res.ok).toBe(true);
    expect(contentInserts).toHaveLength(1);
  });

  it("revalidates the dashboard paths after a successful run", async () => {
    await generateCarouselDraft(formDataWith("1"));
    const paths = revalidatePath.mock.calls.map((c) => c[0]);
    expect(paths).toContain("/dashboard/content");
    expect(paths).toContain("/dashboard/approvals");
    expect(paths).toContain("/dashboard");
  });
});
