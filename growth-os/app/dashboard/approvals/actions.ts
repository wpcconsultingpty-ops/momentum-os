"use server";

// Server actions for the Approvals dashboard.
// approvePost: verifies the caller is the authenticated owner of the row
// (via the RLS-respecting SSR client), flips status draft/pending -> approved,
// then calls the internal publish route which enforces the approval gate again.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/supabase/env";
import { getPublishSecret } from "@/lib/instagram/env";

export interface ActionResult {
ok: boolean;
error?: string;
}

async function requireUser() {
const supabase = createClient();
const {
data: { user },
} = await supabase.auth.getUser();
if (!user) throw new Error("Not authenticated");
return { supabase, user };
}

// Mark a post as approved. RLS ensures the user can only update their own rows.
export async function approvePost(postId: string): Promise<ActionResult> {
try {
const { supabase } = await requireUser();
const { data, error } = await supabase
.from("scheduled_posts")
.update({ status: "approved", approved_at: new Date().toISOString() })
.eq("id", postId)
.in("status", ["draft", "pending_approval"])
.select("id")
.maybeSingle();
if (error) return { ok: false, error: error.message };
if (!data) return { ok: false, error: "Post not found or not in an approvable state" };
revalidatePath("/dashboard/approvals");
return { ok: true };
} catch (err) {
return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
}
}

// Reject a post (owner decided not to publish).
export async function rejectPost(postId: string): Promise<ActionResult> {
try {
const { supabase } = await requireUser();
const { error } = await supabase
.from("scheduled_posts")
.update({ status: "rejected" })
.eq("id", postId)
.in("status", ["draft", "pending_approval"]);
if (error) return { ok: false, error: error.message };
revalidatePath("/dashboard/approvals");
return { ok: true };
} catch (err) {
return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
}
}

// Approve AND publish in one step (still passes through the server-side gate).
export async function approveAndPublish(postId: string): Promise<ActionResult> {
const approved = await approvePost(postId);
if (!approved.ok) return approved;
try {
const res = await fetch(`${getSiteUrl()}/api/ig/publish`, {
method: "POST",
headers: {
"Content-Type": "application/json",
Authorization: `Bearer ${getPublishSecret()}`,
},
body: JSON.stringify({ postId }),
cache: "no-store",
});
const json = await res.json();
if (!res.ok) return { ok: false, error: json?.error ?? "Publish failed" };
revalidatePath("/dashboard/approvals");
return { ok: true };
} catch (err) {
return { ok: false, error: err instanceof Error ? err.message : "Publish request failed" };
}
}
