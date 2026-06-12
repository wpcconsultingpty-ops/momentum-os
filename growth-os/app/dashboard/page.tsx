import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  computeDelta,
  formatConversionRate,
  formatDropOff,
  formatRelativeTime,
  parseWindow,
  windowToRange,
  WINDOW_LABELS,
  type DateRange,
  type Delta,
  type TimeWindow,
} from "@/lib/dashboard/helpers";

type SupabaseClient = ReturnType<typeof createClient>;

const EVENT_LABELS: Record<string, string> = {
  ig_engagement: "IG engagement",
  survey_submit: "Survey submit",
  trial_start: "Trial start",
  trial_convert: "Conversion",
};

type CountQuery = ReturnType<
  ReturnType<SupabaseClient["from"]>["select"]
>;

/** Count rows in `table` over a created/started column within a range. */
async function countInRange(
  supabase: SupabaseClient,
  table: string,
  column: string,
  start: string | null,
  end: string,
  extra?: (q: CountQuery) => CountQuery,
): Promise<number> {
  let query = supabase
    .from(table)
    .select("*", { count: "exact", head: true }) as CountQuery;
  if (start) query = query.gte(column, start);
  query = query.lte(column, end);
  if (extra) query = extra(query);
  const { count, error } = await query;
  if (error) {
    console.error(`[dashboard:count:${table}:${column}]`, error.message);
    return 0;
  }
  return count ?? 0;
}

async function countEvent(
  supabase: SupabaseClient,
  eventType: string,
  start: string | null,
  end: string,
): Promise<number> {
  return countInRange(
    supabase,
    "attribution_events",
    "occurred_at",
    start,
    end,
    (q) => q.eq("event_type", eventType),
  );
}

type CampaignRow = {
  campaign: string;
  leads: number;
  trialStarts: number;
  conversions: number;
};

type LeadCampaignRow = { utm_campaign: string | null };
type TrialCampaignRow = {
  converted_to_paid: boolean | null;
  utm_campaign: string | null;
};

/**
 * Build the top-campaigns table. Leads are grouped from `leads.utm_campaign`;
 * trial-start / conversion counts come from `trials` joined to their attributed
 * content's `utm_campaign` (trials carry no utm column of their own). Grouping
 * is done in JS — small result sets and avoids an RPC.
 */
async function topCampaigns(
  supabase: SupabaseClient,
  range: DateRange,
): Promise<CampaignRow[]> {
  const leadsPromise = supabase
    .from("leads")
    .select("utm_campaign")
    .gte("created_at", range.currentStart ?? "1970-01-01")
    .lte("created_at", range.currentEnd);

  const trialsPromise = supabase
    .from("trials")
    .select("converted_to_paid, content:attributed_content_id(utm_campaign)")
    .gte("started_at", range.currentStart ?? "1970-01-01")
    .lte("started_at", range.currentEnd);

  const [leadsRes, trialsRes] = await Promise.all([leadsPromise, trialsPromise]);

  if (leadsRes.error) {
    console.error("[dashboard:campaigns:leads]", leadsRes.error.message);
  }
  if (trialsRes.error) {
    console.error("[dashboard:campaigns:trials]", trialsRes.error.message);
  }

  const byCampaign = new Map<string, CampaignRow>();
  const ensure = (campaign: string): CampaignRow => {
    let row = byCampaign.get(campaign);
    if (!row) {
      row = { campaign, leads: 0, trialStarts: 0, conversions: 0 };
      byCampaign.set(campaign, row);
    }
    return row;
  };

  for (const lead of (leadsRes.data ?? []) as LeadCampaignRow[]) {
    if (!lead.utm_campaign) continue;
    ensure(lead.utm_campaign).leads += 1;
  }

  const trials = (trialsRes.data ?? []) as unknown as {
    converted_to_paid: boolean | null;
    content: { utm_campaign: string | null } | null;
  }[];
  for (const trial of trials) {
    const campaign = trial.content?.utm_campaign;
    if (!campaign) continue;
    const row = ensure(campaign);
    row.trialStarts += 1;
    if (trial.converted_to_paid) row.conversions += 1;
  }

  return [...byCampaign.values()]
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 5);
}

type ActivityRow = {
  id: string;
  event_type: string;
  utm_campaign: string | null;
  occurred_at: string;
  lead: { email: string | null; ig_user_handle: string | null } | null;
};

async function recentActivity(supabase: SupabaseClient): Promise<ActivityRow[]> {
  const { data, error } = await supabase
    .from("attribution_events")
    .select(
      "id, event_type, utm_campaign, occurred_at, lead:lead_id(email, ig_user_handle)",
    )
    .order("occurred_at", { ascending: false })
    .limit(10);
  if (error) {
    console.error("[dashboard:activity]", error.message);
    return [];
  }
  return (data ?? []) as unknown as ActivityRow[];
}

const DELTA_CLASS: Record<Delta["direction"], string> = {
  up: "text-green-600",
  down: "text-red-600",
  flat: "text-gray-400",
};

const DELTA_GLYPH: Record<Delta["direction"], string> = {
  up: "▲",
  down: "▼",
  flat: "•",
};

function KpiCard({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta: Delta | null;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums">{value}</p>
      {delta && (
        <p className={`mt-1 text-xs ${DELTA_CLASS[delta.direction]}`}>
          {DELTA_GLYPH[delta.direction]} {delta.label}
        </p>
      )}
    </div>
  );
}

const WINDOWS: TimeWindow[] = ["7d", "30d", "all"];

const WINDOW_PILL_LABELS: Record<TimeWindow, string> = {
  "7d": "7 days",
  "30d": "30 days",
  all: "All time",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { window?: string };
}) {
  const window = parseWindow(searchParams.window);
  const windowLabel = WINDOW_LABELS[window];
  const range = windowToRange(window);
  const supabase = createClient();

  const [
    leads,
    leadsPrior,
    trialStarts,
    trialStartsPrior,
    conversions,
    conversionsPrior,
    igEngagements,
    surveySubmits,
    funnelTrialStarts,
    funnelConversions,
    campaigns,
    activity,
  ] = await Promise.all([
    countInRange(supabase, "leads", "created_at", range.currentStart, range.currentEnd),
    countInRange(supabase, "leads", "created_at", range.priorStart, range.priorEnd ?? range.currentEnd),
    countInRange(supabase, "trials", "started_at", range.currentStart, range.currentEnd),
    countInRange(supabase, "trials", "started_at", range.priorStart, range.priorEnd ?? range.currentEnd),
    countInRange(supabase, "trials", "started_at", range.currentStart, range.currentEnd, (q) =>
      q.eq("converted_to_paid", true),
    ),
    countInRange(supabase, "trials", "started_at", range.priorStart, range.priorEnd ?? range.currentEnd, (q) =>
      q.eq("converted_to_paid", true),
    ),
    countEvent(supabase, "ig_engagement", range.currentStart, range.currentEnd),
    countEvent(supabase, "survey_submit", range.currentStart, range.currentEnd),
    countEvent(supabase, "trial_start", range.currentStart, range.currentEnd),
    countEvent(supabase, "trial_convert", range.currentStart, range.currentEnd),
    topCampaigns(supabase, range),
    recentActivity(supabase),
  ]);

  // Prior counts are 0 when there is no prior period (window=all); treat as null.
  const priorAvailable = range.priorStart !== null;
  const leadsDelta = computeDelta(leads, priorAvailable ? leadsPrior : null, windowLabel);
  const trialStartsDelta = computeDelta(trialStarts, priorAvailable ? trialStartsPrior : null, windowLabel);
  const conversionsDelta = computeDelta(conversions, priorAvailable ? conversionsPrior : null, windowLabel);

  const convRate = formatConversionRate(conversions, trialStarts);
  const priorConvRateRaw = trialStartsPrior > 0 ? (conversionsPrior / trialStartsPrior) * 100 : null;
  const currConvRateRaw = trialStarts > 0 ? (conversions / trialStarts) * 100 : null;
  const convRateDelta =
    priorAvailable && priorConvRateRaw !== null && currConvRateRaw !== null
      ? computeDelta(Math.round(currConvRateRaw), Math.round(priorConvRateRaw), windowLabel)
      : null;

  const funnelStages: { label: string; count: number }[] = [
    { label: "IG engagements", count: igEngagements },
    { label: "Survey submits", count: surveySubmits },
    { label: "Trial starts", count: funnelTrialStarts },
    { label: "Conversions", count: funnelConversions },
  ];
  const funnelMax = Math.max(1, ...funnelStages.map((s) => s.count));

  const allZero =
    leads === 0 &&
    trialStarts === 0 &&
    conversions === 0 &&
    igEngagements === 0 &&
    surveySubmits === 0 &&
    funnelTrialStarts === 0 &&
    funnelConversions === 0;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="mt-1 text-sm text-gray-600">
            Leads, trials, and attribution across the {WINDOW_PILL_LABELS[window].toLowerCase()}.
          </p>
        </div>
        <div className="flex gap-2">
          {WINDOWS.map((w) => {
            const active = w === window;
            return (
              <Link
                key={w}
                href={`/dashboard?window=${w}`}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  active
                    ? "bg-gray-900 text-white"
                    : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-100"
                }`}
              >
                {WINDOW_PILL_LABELS[w]}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Leads" value={leads.toLocaleString()} delta={leadsDelta} />
        <KpiCard label="Trial starts" value={trialStarts.toLocaleString()} delta={trialStartsDelta} />
        <KpiCard label="Conversions" value={conversions.toLocaleString()} delta={conversionsDelta} />
        <KpiCard label="Conversion rate" value={convRate} delta={convRateDelta} />
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Funnel</h2>
      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
        {funnelStages.map((stage, i) => {
          const widthPct = Math.round((stage.count / funnelMax) * 100);
          const dropOff = formatDropOff(stage.count, i === 0 ? null : funnelStages[i - 1].count);
          return (
            <div key={stage.label}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="font-medium text-gray-900">{stage.label}</span>
                <span className="flex items-center gap-2 text-gray-500">
                  <span className="tabular-nums">{stage.count.toLocaleString()}</span>
                  {dropOff && <span className="text-xs text-gray-400">{dropOff}</span>}
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded bg-gray-100">
                <div
                  className="h-3 rounded bg-gray-900"
                  style={{ width: `${Math.max(widthPct, stage.count > 0 ? 2 : 0)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Top campaigns</h2>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Campaign</th>
              <th className="px-4 py-3 text-right">Leads</th>
              <th className="px-4 py-3 text-right">Trial starts</th>
              <th className="px-4 py-3 text-right">Conversions</th>
              <th className="px-4 py-3 text-right">Conv. rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  No campaigns with leads in this window. Tag your Instagram links
                  with <code className="text-gray-700">?utm_campaign=</code>
                </td>
              </tr>
            ) : (
              campaigns.map((c) => (
                <tr key={c.campaign}>
                  <td className="px-4 py-3 font-medium text-gray-900">{c.campaign}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                    {c.leads.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                    {c.trialStarts.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                    {c.conversions.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                    {formatConversionRate(c.conversions, c.trialStarts)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Recent activity</h2>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {activity.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">
            No activity yet. Events appear here as webhooks arrive.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {activity.map((row) => {
              const who = row.lead?.email ?? row.lead?.ig_user_handle ?? null;
              return (
                <li key={row.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className="flex items-center gap-3">
                    <span className="font-medium text-gray-900">
                      {EVENT_LABELS[row.event_type] ?? row.event_type}
                    </span>
                    {row.utm_campaign && (
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {row.utm_campaign}
                      </span>
                    )}
                    {who && <span className="text-gray-500">{who}</span>}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatRelativeTime(row.occurred_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {allZero && (
        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Nothing here yet</h2>
          <p className="mt-1 text-sm text-gray-600">
            No leads, trials, or attribution events in this window. Get the pipeline
            flowing:
          </p>
          <ul className="mt-4 space-y-2 text-sm text-gray-700">
            <li>
              <span className="font-medium text-gray-900">1. Share your landing page</span>
              {" — "}point your Instagram bio link at{" "}
              <Link href="/landing" className="text-gray-900 underline">
                /landing
              </Link>{" "}
              to start capturing leads.
            </li>
            <li>
              <span className="font-medium text-gray-900">2. Configure the Meta webhook</span>
              {" — "}wire Instagram engagement events to{" "}
              <code className="text-gray-700">/api/webhooks/instagram</code>.
            </li>
            <li>
              <span className="font-medium text-gray-900">3. Tag your links</span>
              {" — "}add <code className="text-gray-700">?utm_campaign=</code> to every
              shared link so campaigns and attribution line up.
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
