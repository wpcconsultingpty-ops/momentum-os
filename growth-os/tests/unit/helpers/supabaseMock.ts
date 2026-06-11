import { vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

export type QueryResult = { data?: unknown; error?: unknown };

/**
 * A single queued response for one terminal query on a table. `recordDelivery`,
 * the webhook routes, etc. all build chains like
 * `admin.from(t).insert(x).select(c).single()` — only the *terminal* call
 * (`single` / `maybeSingle`) or the awaited builder resolves to a result.
 */
export type TableResponses = {
  insert?: QueryResult | QueryResult[];
  upsert?: QueryResult | QueryResult[];
  update?: QueryResult | QueryResult[];
  select?: QueryResult | QueryResult[];
  delete?: QueryResult | QueryResult[];
};

type Op = keyof TableResponses;

/**
 * Builds a chainable query-builder stub. Every intermediate method returns the
 * builder itself; `single`, `maybeSingle`, and `then` resolve to the configured
 * result for whichever write/read op started the chain. Multiple results for the
 * same op are consumed FIFO so repeated calls (e.g. duplicate-delivery tests)
 * can return different responses.
 */
function makeTableBuilder(responses: TableResponses) {
  const queues: Partial<Record<Op, QueryResult[]>> = {};
  for (const key of Object.keys(responses) as Op[]) {
    const v = responses[key];
    queues[key] = Array.isArray(v) ? [...v] : v ? [v] : [];
  }

  let currentOp: Op = "select";

  function nextResult(): QueryResult {
    const queue = queues[currentOp];
    if (queue && queue.length > 0) {
      return queue.length === 1 ? queue[0] : queue.shift()!;
    }
    return { data: null, error: null };
  }

  const builder: Record<string, unknown> = {};

  const startOp = (op: Op) =>
    vi.fn(() => {
      currentOp = op;
      return builder;
    });

  const passthrough = vi.fn(() => builder);

  builder.insert = startOp("insert");
  builder.upsert = startOp("upsert");
  builder.update = startOp("update");
  builder.delete = startOp("delete");
  builder.select = vi.fn(() => builder); // select can be both a start and a refinement
  builder.eq = passthrough;
  builder.order = passthrough;
  builder.limit = passthrough;
  builder.single = vi.fn(() => Promise.resolve(nextResult()));
  builder.maybeSingle = vi.fn(() => Promise.resolve(nextResult()));
  // Awaiting the builder directly (no single/maybeSingle terminal).
  builder.then = (resolve: (v: QueryResult) => unknown) =>
    Promise.resolve(nextResult()).then(resolve);

  return builder;
}

/**
 * Creates a mock SupabaseClient. `tables` maps a table name to the queued
 * responses for ops against it. `from()` is a spy so tests can assert which
 * tables were touched.
 */
export function createSupabaseMock(tables: Record<string, TableResponses> = {}) {
  const from = vi.fn((table: string) =>
    makeTableBuilder(tables[table] ?? {}),
  );
  const client = { from } as unknown as SupabaseClient;
  return { client, from };
}
