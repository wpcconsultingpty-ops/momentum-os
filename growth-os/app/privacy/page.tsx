import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Momentum OS",
  description:
    "How Momentum OS collects, uses, stores, and protects your personal information.",
};

const EFFECTIVE_DATE = "12 June 2026";
const ENTITY_NAME = "WPC Consulting Pty Ltd";
const TRADING_AS = "Momentum OS";
const CONTACT_EMAIL = "admin@tendersolutions.com.au";
const LOCATION = "Queensland, Australia";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-800">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Effective date: {EFFECTIVE_DATE}
      </p>

      <section className="prose prose-slate mt-8 max-w-none">
        <p>
          {ENTITY_NAME} (&ldquo;{TRADING_AS}&rdquo;, &ldquo;we&rdquo;,
          &ldquo;us&rdquo;, &ldquo;our&rdquo;) operates the Momentum OS web
          application and the related landing pages, marketing properties, and
          Instagram integration. This Privacy Policy explains what information
          we collect, how we use it, and the choices you have. By using the
          service you agree to this Policy.
        </p>

        <h2>1. Information we collect</h2>
        <ul>
          <li>
            <strong>Account information.</strong> When you sign up we collect
            your email address and authentication identifiers. Passwords are
            never stored in plain text; authentication is handled by Supabase.
          </li>
          <li>
            <strong>Lead information.</strong> When you submit a form on our
            landing pages we collect the email address you provide and any
            UTM/campaign parameters present in the URL.
          </li>
          <li>
            <strong>Instagram engagement data.</strong> If you interact with
            our Instagram business account (for example by commenting, sending
            a message, or clicking a story reply), Meta forwards a webhook
            payload to us containing your Instagram user ID, the content of
            your message or comment, and related metadata. We do not request
            or store your Instagram password.
          </li>
          <li>
            <strong>Usage data.</strong> Standard request metadata such as IP
            address, user agent, timestamps, and pages visited, used for
            security, abuse prevention, and analytics.
          </li>
        </ul>

        <h2>2. How we use information</h2>
        <ul>
          <li>To create and operate your account.</li>
          <li>
            To respond to inquiries, deliver content you requested, and
            attribute leads to the marketing campaign that referred them.
          </li>
          <li>
            To process Instagram events (e.g. acknowledge a comment, route a
            DM, generate an automated reply).
          </li>
          <li>To detect, prevent, and investigate fraud or abuse.</li>
          <li>To comply with legal obligations.</li>
        </ul>

        <h2>3. Legal bases</h2>
        <p>
          Where the GDPR applies, we rely on (a) your consent, (b) the
          performance of a contract with you, (c) our legitimate interests in
          operating and improving the service, and (d) compliance with legal
          obligations. Where the Australian Privacy Act applies, we handle
          personal information in accordance with the Australian Privacy
          Principles (APPs).
        </p>

        <h2>4. Sharing of information</h2>
        <p>We do not sell your personal information. We share data only with:</p>
        <ul>
          <li>
            <strong>Service providers</strong> who help us run the service —
            currently Supabase (database, authentication), Vercel (hosting),
            and Meta Platforms (Instagram webhooks). These providers are bound
            by their own privacy commitments and may process data outside your
            country of residence.
          </li>
          <li>
            <strong>Authorities</strong> when required by law, court order, or
            to protect rights, property, or safety.
          </li>
          <li>
            <strong>Successors</strong> in the event of a merger, acquisition,
            or sale of assets, subject to standard confidentiality
            protections.
          </li>
        </ul>

        <h2>5. Data retention</h2>
        <p>
          We keep account data for the life of your account and for a
          reasonable period afterwards to meet legal and business obligations.
          Webhook delivery logs are retained for up to 90 days for debugging
          and auditing. You can request deletion at any time (see
          &ldquo;Your rights&rdquo; below).
        </p>

        <h2>6. Security</h2>
        <p>
          We use HTTPS in transit, encrypted storage at rest via our
          infrastructure providers, scoped database access via row-level
          security, and signed webhook payloads (HMAC). No system is perfectly
          secure; we encourage you to use a strong, unique password.
        </p>

        <h2>7. Your rights</h2>
        <p>
          You may request access to, correction of, or deletion of your
          personal information by emailing{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. If you are
          in the EEA, UK, or California you may also have additional rights
          under applicable law, including the right to object to or restrict
          certain processing and to lodge a complaint with a supervisory
          authority.
        </p>

        <h2>8. Children</h2>
        <p>
          Momentum OS is not directed at children under 13 (or under 16 in the
          EEA). We do not knowingly collect data from children. If you believe
          a child has provided us data, contact us and we will delete it.
        </p>

        <h2>9. International transfers</h2>
        <p>
          Our infrastructure providers may process data in jurisdictions
          outside {LOCATION}, including the United States and the European
          Union. Where required, we rely on appropriate safeguards (for
          example, standard contractual clauses).
        </p>

        <h2>10. Changes to this Policy</h2>
        <p>
          We may update this Policy from time to time. The &ldquo;Effective
          date&rdquo; at the top reflects the most recent revision. Material
          changes will be communicated via the service or by email.
        </p>

        <h2>11. Contact</h2>
        <p>
          Questions or requests:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          <br />
          {ENTITY_NAME}, {LOCATION}
        </p>
      </section>
    </main>
  );
}
