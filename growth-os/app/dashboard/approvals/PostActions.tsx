"use client";

// Client-side action buttons for a single post in the Approvals dashboard.
// Calls the server actions and shows pending / error state.
// For pending posts (draft/pending_approval): Approve, Approve & Publish, Reject.
// For already-approved posts: a single Publish button.
import { useState, useTransition } from "react";
import { approvePost, rejectPost, approveAndPublish, publishPost } from "./actions";

export function PostActions({ postId, status }: { postId: string; status: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: (id: string) => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn(postId);
      if (!result.ok) setError(result.error ?? "Action failed");
    });
  }

  const isApproved = status === "approved";

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      {isApproved ? (
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(publishPost)}
          style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: "#1f883d", color: "#fff", cursor: "pointer" }}
        >
          Publish
        </button>
      ) : (
        <>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(approvePost)}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #d0d7de", cursor: "pointer" }}
          >
            Approve
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(approveAndPublish)}
            style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: "#1f883d", color: "#fff", cursor: "pointer" }}
          >
            Approve & Publish
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(rejectPost)}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #d0d7de", color: "#cf222e", cursor: "pointer" }}
          >
            Reject
          </button>
        </>
      )}
      {isPending && <span style={{ fontSize: 12, color: "#57606a" }}>Working...</span>}
      {error && <span style={{ fontSize: 12, color: "#cf222e" }}>{error}</span>}
    </div>
  );
}
