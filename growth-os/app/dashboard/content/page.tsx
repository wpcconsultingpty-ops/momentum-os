// Content ledger.
// Published posts are written here automatically by the publish route on a
// successful Instagram publish, carrying the UTM campaign (the canonical
// attribution tag) so the Leads/Attribution surfaces can join against it.
// Drafts can also be created on demand via the generator button below; they
// flow into Approvals and only publish after explicit owner approval.
import { createClient } from "@/lib/supabase/server";
import GenerateButton from "./GenerateButton";

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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Content</h1>
          <p className="mt-1 text-sm text-gray-600">
            Published posts and their attribution tags. New posts are drafted by
            the generator and go live through Approvals.
          </p>
        </div>
        <GenerateButton />
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
                  No content yet. Use the Generate drafts button to create some.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="align-top">
                <td className="px-4 py-3">{row.platform}</td>
                <td className="px-4 py-3 whitespace-pre-line">{row.caption}</td>
                <td className="px-4 py-3">{row.utm_campaign ?? "-"}</td>
                <td className="px-4 py-3">{row.status}</td>
                <td className="px-4 py-3">
                  {row.permalink ? (
                    <a
                      href={row.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      View
                    </a>
                  ) : (
                    "-"
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
