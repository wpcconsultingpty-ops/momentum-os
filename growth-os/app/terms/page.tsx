import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Momentum OS",
  description: "The terms governing your use of Momentum OS.",
};

const EFFECTIVE_DATE = "12 June 2026";
const ENTITY_NAME = "WPC Consulting Pty Ltd";
const TRADING_AS = "Momentum OS";
const CONTACT_EMAIL = "admin@tendersolutions.com.au";
const LOCATION = "Queensland, Australia";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-800">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">
        Terms of Service
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Effective date: {EFFECTIVE_DATE}
      </p>

      <section className="prose prose-slate mt-8 max-w-none">
        <p>
          These Terms govern your use of the Momentum OS service operated by{" "}
          {ENTITY_NAME} (&ldquo;{TRADING_AS}&rdquo;, &ldquo;we&rdquo;,
          &ldquo;us&rdquo;). By creating an account or otherwise using the
          service you agree to these Terms.
        </p>

        <h2>1. The service</h2>
        <p>
          Momentum OS provides web tooling for personal productivity,
          marketing attribution, and Instagram engagement workflows. Features
          and availability may change over time.
        </p>

        <h2>2. Your account</h2>
        <p>
          You are responsible for safeguarding your credentials and for all
          activity that occurs under your account. Notify us promptly of any
          unauthorized use.
        </p>

        <h2>3. Acceptable use</h2>
        <ul>
          <li>No unlawful, harmful, or fraudulent activity.</li>
          <li>
            No reverse engineering, scraping at scale, or interference with
            the service.
          </li>
          <li>
            No content that infringes intellectual property, privacy, or other
            rights of third parties.
          </li>
          <li>
            Comply with Meta&rsquo;s Platform Terms and Instagram&rsquo;s
            Community Guidelines when using Instagram integrations.
          </li>
        </ul>

        <h2>4. Content and data</h2>
        <p>
          You retain ownership of content you submit. You grant us a
          worldwide, non-exclusive licence to host, process, and display that
          content as necessary to operate the service. We handle personal
          information in accordance with our{" "}
          <a href="/privacy">Privacy Policy</a>.
        </p>

        <h2>5. Fees</h2>
        <p>
          Paid plans, if any, are described at the point of purchase. You
          authorize us (and our payment processors) to charge the applicable
          fees. Fees are non-refundable except where required by law.
        </p>

        <h2>6. Termination</h2>
        <p>
          You may stop using the service at any time. We may suspend or
          terminate your access for breach of these Terms or where required
          by law. On termination, your right to use the service ceases
          immediately; certain provisions (e.g. ownership, disclaimers,
          limitations of liability) survive.
        </p>

        <h2>7. Disclaimers</h2>
        <p>
          THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
          AVAILABLE&rdquo;, WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS
          OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR
          PURPOSE, AND NON-INFRINGEMENT, TO THE MAXIMUM EXTENT PERMITTED BY
          LAW. Some jurisdictions (including Australia) imply consumer
          guarantees that cannot be excluded; nothing in these Terms limits
          rights that cannot lawfully be limited.
        </p>

        <h2>8. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, our aggregate liability
          arising out of or related to the service will not exceed the
          greater of (a) the fees you paid us in the 12 months before the
          claim, or (b) AUD $100. We are not liable for indirect, incidental,
          consequential, or punitive damages.
        </p>

        <h2>9. Indemnity</h2>
        <p>
          You agree to indemnify {ENTITY_NAME} against claims arising from
          your misuse of the service or breach of these Terms.
        </p>

        <h2>10. Changes</h2>
        <p>
          We may update these Terms. Material changes will be communicated
          via the service or by email; continued use after changes take
          effect constitutes acceptance.
        </p>

        <h2>11. Governing law</h2>
        <p>
          These Terms are governed by the laws of {LOCATION}. Courts located
          in Queensland, Australia have exclusive jurisdiction, except where
          mandatory consumer protection laws require otherwise.
        </p>

        <h2>12. Contact</h2>
        <p>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </section>
    </main>
  );
}
