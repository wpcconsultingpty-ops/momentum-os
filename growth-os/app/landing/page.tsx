import type { Metadata } from "next";
import LeadForm from "./LeadForm";

export const metadata: Metadata = {
  title: "Momentum OS — Build unstoppable momentum",
  description:
    "Join Momentum OS: the system behind consistent habits, sharper focus, and real progress. Get early access.",
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
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-16">
      <div className="grid flex-1 items-center gap-12 md:grid-cols-2">
        <section className="space-y-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-gray-500">
            Momentum OS
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Build unstoppable momentum.
          </h1>
          <p className="text-lg text-gray-600">
            The operating system for your goals. Turn scattered effort into daily
            progress — and finally make consistency feel automatic. Be the first
            to get access.
          </p>
          <ul className="space-y-2 text-sm text-gray-600">
            <li>• Daily focus, built around your real life</li>
            <li>• Habits that actually stick</li>
            <li>• Progress you can see</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">
            Get early access
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Drop your details and we&apos;ll save your spot.
          </p>
          <div className="mt-6">
            <LeadForm utm={utm} />
          </div>
        </section>
      </div>

      <footer className="mt-16 text-center text-xs text-gray-400">
        No spam, ever. We&apos;ll only email you about Momentum OS. Unsubscribe anytime.
      </footer>
    </main>
  );
}
