import { createClient } from "@/lib/supabase/server";

type AttributionRow = {
  id: string;
  event_type: string;
  source: string;
  utm_campaign: string | null;
  occurred_at: string;
  content: { caption: string | null; permalink: string | null } | null;
  lead: { email: string | null; full_name: string | null } | null;
  trial: { email: string; plan: string | null } | null;
};

const EVENT_LABELS: Record<string, string> = {
  ig_engagement: "IG engagement",
  survey_submit: "Survey submit",
  trial_start: "Trial start",
  trial_convert: "Trial convert",
};

export default async function AttributionPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("attribution_events")
    .select(
      `id, event_type, source, utm_campaign, occurred_at,
       content:content_id ( caption, permalink ),
       lead:lead_id ( email, full_name ),
       trial:trial_id ( email, plan )`,
    )
    .order("occurred_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[attribution:list]", error.message);
  }

  const rows = (data ?? []) as unknown as AttributionRow[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Attribution</h1>
        <p className="mt-1 text-sm text-gray-600">
          Immutable event log tying Instagram engagement to surveys and trials.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Campaign</th>
              <th className="px-4 py-3">Content</th>
              <th className="px-4 py-3">Lead</th>
              <th className="px-4 py-3">Trial</th>
              <th className="px-4 py-3">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  No attribution events yet. They appear as webhooks arrive.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium">
                    {EVENT_LABELS[row.event_type] ?? row.event_type}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{row.source}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {row.utm_campaign ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {row.content?.caption ?? row.content?.permalink ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {row.lead?.email ?? row.lead?.full_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {row.trial?.email ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(row.occurred_at).toLocaleString()}
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
