import type { Metadata } from "next";
import LeadForm from "./LeadForm";

export const metadata: Metadata = {
  title: "Momentum OS — A habit tracker with a brain",
  description:
    "Habits, journal, and health data — read by an AI coach that pays attention. Apply for beta access.",
};

function pick(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default function LandingPage({
  searchParams,
}: {
  searchParams: {
    utm_campaign?: string | string[];
    utm_source?: string | string[];
    utm_medium?: string | string[];
  };
}) {
  const utm = {
    utm_campaign: pick(searchParams.utm_campaign),
    utm_source: pick(searchParams.utm_source),
    utm_medium: pick(searchParams.utm_medium),
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-16">
        <header className="mb-16 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-200/80">
            Momentum OS
          </p>
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
            reset · refocus · move
          </p>
        </header>

        <div className="grid flex-1 items-center gap-12 md:grid-cols-5">
          <section className="space-y-8 md:col-span-3">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-200/80">
              Closed beta · 12 men inside
            </p>

            <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl">
              A habit tracker
              <br />
              with a brain.
            </h1>

            <p className="max-w-xl text-lg leading-relaxed text-slate-300">
              Most apps ask you to log your life and never say a word back.
              Momentum OS reads your journal, watches your sleep and heart
              rate, spots the patterns you&apos;re too close to see — and
              tells you what to do next.
            </p>

            <ul className="space-y-3 text-base text-slate-300">
              <li className="flex items-start gap-3">
                <span className="mt-2 h-1 w-6 shrink-0 bg-amber-300/80" />
                <span>
                  <strong className="text-white">Habits</strong> that hold
                  weight, not streaks for the sake of streaks
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-2 h-1 w-6 shrink-0 bg-amber-300/80" />
                <span>
                  <strong className="text-white">A daily journal</strong> that
                  gets read, not buried
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-2 h-1 w-6 shrink-0 bg-amber-300/80" />
                <span>
                  <strong className="text-white">Health data</strong> from
                  your wearable, joined to everything else
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-2 h-1 w-6 shrink-0 bg-amber-300/80" />
                <span>
                  <strong className="text-white">An AI coach</strong> that
                  reads it all and gives advice grounded in your week — not
                  generic platitudes
                </span>
              </li>
            </ul>

            <p className="text-sm italic text-slate-400">
              Built by{" "}
              <span className="not-italic text-slate-300">
                reset.refocus.move
              </span>
              . For men who refuse to drift.
            </p>
          </section>

          <section className="md:col-span-2">
            <div className="rounded-2xl border border-amber-200/20 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/80">
                Apply for beta access
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                Join the next cohort.
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Spots open in small rounds. Drop your email and we&apos;ll
                reach out when the next one opens.
              </p>
              <div className="mt-6">
                <LeadForm utm={utm} />
              </div>
              <p className="mt-6 border-t border-slate-800 pt-4 text-xs text-slate-500">
                No fee. No fluff. Just the work — and a coach that pays
                attention.
              </p>
            </div>
          </section>
        </div>

        <footer className="mt-16 flex flex-col items-center gap-2 text-center text-xs text-slate-500 sm:flex-row sm:justify-between">
          <p>
            No spam. We only email you about Momentum OS. Unsubscribe anytime.
          </p>
          <p className="flex gap-4">
            <a className="hover:text-slate-300" href="/privacy">
              Privacy
            </a>
            <a className="hover:text-slate-300" href="/terms">
              Terms
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
