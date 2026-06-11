import { createClient } from "@/lib/supabase/server";
import { createContentForm, deleteContentForm } from "./actions";

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
          Posts you publish. The UTM campaign is the canonical attribution tag.
        </p>
      </div>

      <form
        action={createContentForm}
        className="grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-white p-6 sm:grid-cols-2"
      >
        <div>
          <label className="block text-sm font-medium">Platform</label>
          <select
            name="platform"
            defaultValue="instagram"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="instagram">Instagram</option>
            <option value="linkedin">LinkedIn</option>
            <option value="tiktok">TikTok</option>
            <option value="youtube">YouTube</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Status</label>
          <select
            name="status"
            defaultValue="draft"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">External ID</label>
          <input
            name="external_id"
            placeholder="IG media id"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">UTM campaign</label>
          <input
            name="utm_campaign"
            placeholder="spring-launch"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium">Permalink</label>
          <input
            name="permalink"
            type="url"
            placeholder="https://instagram.com/p/..."
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium">Caption</label>
          <textarea
            name="caption"
            rows={2}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            Add content
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Platform</th>
              <th className="px-4 py-3">Caption</th>
              <th className="px-4 py-3">UTM campaign</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  No content yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 capitalize">{row.platform}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {row.caption ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {row.utm_campaign ?? "—"}
                  </td>
                  <td className="px-4 py-3 capitalize">{row.status}</td>
                  <td className="px-4 py-3 text-right">
                    <form action={deleteContentForm}>
                      <input type="hidden" name="id" value={row.id} />
                      <button
                        type="submit"
                        className="text-sm text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
