// Content ledger (read-only).
// Published posts are written here automatically by the publish route on a
// successful Instagram publish, carrying the UTM campaign (the canonical
// attribution tag) so the Leads/Attribution surfaces can join against it.
// Authoring happens via the AI generator + Approvals gate, not this page.
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ContentRow = {
id: string;
platform: string;
external_id: string | null;
permalink: string | null;
caption: string | null;
utm_campaign: string | null;
status: string;
created_at: string;
};

export default async function ContentPage() {
const supabase = createClient();
const { data, error } = await supabase
.from("content")
.select(
"id, platform, external_id, permalink, caption, utm_campaign, status, created_at",
)
.order("created_at", { ascending: false });

if (error) {
console.error("[content:list]", error.message);
}

const rows = (data ?? []) as ContentRow[];

return (
<div className="space-y-8">
<div>
<h1 className="text-2xl font-bold">Content</h1>
<p className="mt-1 text-sm text-gray-600">
Published posts and their attribution tags. New posts are drafted by the
generator and go live through Approvals - this is a read-only ledger.
</p>
</div>

<div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
<table className="min-w-full divide-y divide-gray-200 text-sm">
<thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
<tr>
<th className="px-4 py-3">Platform</th>
<th className="px-4 py-3">Caption</th>
<th className="px-4 py-3">UTM campaign</th>
<th className="px-4 py-3">Status</th>
<th className="px-4 py-3">Link</th>
</tr>
</thead>
<tbody className="divide-y divide-gray-100">
{rows.length === 0 && (
<tr>
<td className="px-4 py-6 text-gray-500" colSpan={5}>
No published content yet.
</td>
</tr>
)}
{rows.map((row) => (
<tr key={row.id}>
<td className="px-4 py-3 align-top capitalize">{row.platform}</td>
<td className="px-4 py-3 align-top max-w-md text-gray-700">{row.caption}</td>
<td className="px-4 py-3 align-top text-gray-600">{row.utm_campaign ?? "-"}</td>
<td className="px-4 py-3 align-top capitalize">{row.status}</td>
<td className="px-4 py-3 align-top">
{row.permalink ? (
<a href={row.permalink} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline">
View
</a>
) : (
<span className="text-gray-400">-</span>
)}
</td>
</tr>
))}
</tbody>
</table>
</div>
</div>
);
}
