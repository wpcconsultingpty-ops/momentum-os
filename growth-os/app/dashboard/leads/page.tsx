import { createClient } from "@/lib/supabase/server";
import { createLeadForm, updateLeadStatusForm } from "./actions";

type LeadRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  source: string | null;
  utm_campaign: string | null;
  ig_user_handle: string | null;
  status: string;
  created_at: string;
};

const STATUSES = [
  "new",
  "qualified",
  "contacted",
  "converted",
  "disqualified",
] as const;

export default async function LeadsPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("leads")
    .select(
      "id, email, full_name, source, utm_campaign, ig_user_handle, status, created_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[leads:list]", error.message);
  }

  const rows = (data ?? []) as LeadRow[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Leads</h1>
        <p className="mt-1 text-sm text-gray-600">
          People captured via survey, Instagram, or manually.
        </p>
      </div>

      <form
        action={createLeadForm}
        className="grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-white p-6 sm:grid-cols-2"
      >
        <div>
          <label className="block text-sm font-medium">Email</label>
          <input
            name="email"
            type="email"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Full name</label>
          <input
            name="full_name"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Source</label>
          <input
            name="source"
            placeholder="manual"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">UTM campaign</label>
          <input
            name="utm_campaign"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">IG handle</label>
          <input
            name="ig_user_handle"
            placeholder="@handle"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            Add lead
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">UTM campaign</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  No leads yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-gray-700">{row.email ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {row.full_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {row.source ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {row.utm_campaign ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <form action={updateLeadStatusForm} className="flex">
                      <input type="hidden" name="id" value={row.id} />
                      <select
                        name="status"
                        defaultValue={row.status}
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="ml-2 text-xs text-gray-600 hover:underline"
                      >
                        Save
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
