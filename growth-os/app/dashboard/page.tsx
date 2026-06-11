import { createClient } from "@/lib/supabase/server";

async function countRows(
  table: string,
): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) {
    console.error(`[dashboard:count:${table}]`, error.message);
    return 0;
  }
  return count ?? 0;
}

const CARDS: { label: string; table: string }[] = [
  { label: "Content posts", table: "content" },
  { label: "Leads", table: "leads" },
  { label: "Trials", table: "trials" },
  { label: "Attribution events", table: "attribution_events" },
];

export default async function DashboardPage() {
  const counts = await Promise.all(CARDS.map((c) => countRows(c.table)));

  return (
    <div>
      <h1 className="text-2xl font-bold">Overview</h1>
      <p className="mt-1 text-sm text-gray-600">
        A snapshot of your content, pipeline, and attribution.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {CARDS.map((card, i) => (
          <div
            key={card.table}
            className="rounded-lg border border-gray-200 bg-white p-5"
          >
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="mt-2 text-3xl font-bold">{counts[i]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
