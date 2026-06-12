"use client";

import { useState, type FormEvent } from "react";

type UtmParams = {
  utm_campaign?: string;
  utm_source?: string;
  utm_medium?: string;
};

export default function LeadForm({ utm }: { utm: UtmParams }) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");

    const form = event.currentTarget;
    const fd = new FormData(form);

    const payload = {
      email: String(fd.get("email") ?? ""),
      full_name: (String(fd.get("full_name") ?? "").trim() || undefined),
      ig_user_handle: (String(fd.get("ig_user_handle") ?? "").trim() || undefined),
      hp: String(fd.get("hp") ?? ""),
      ...utm,
    };

    try {
      const res = await fetch("/api/landing/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && data.ok) {
        setStatus("success");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
        <h2 className="text-lg font-semibold text-green-900">You&apos;re on the list</h2>
        <p className="mt-2 text-sm text-green-800">
          Thanks for joining Momentum OS. Keep an eye on your inbox — we&apos;ll be in touch soon.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {status === "error" ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Something went wrong. Please try again.
        </p>
      ) : null}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-900">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="full_name" className="block text-sm font-medium text-gray-900">
          Full name <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          autoComplete="name"
          placeholder="Your name"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="ig_user_handle" className="block text-sm font-medium text-gray-900">
          Instagram handle <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <div className="mt-1 flex items-center rounded-md border border-gray-300 focus-within:border-gray-900">
          <span className="pl-3 text-sm text-gray-400">@</span>
          <input
            id="ig_user_handle"
            name="ig_user_handle"
            type="text"
            autoComplete="off"
            placeholder="yourhandle"
            className="w-full rounded-md border-0 bg-transparent px-2 py-2 text-sm focus:outline-none"
          />
        </div>
      </div>

      {/* Honeypot: hidden from humans, tempting to bots. Dropped server-side. */}
      <div aria-hidden="true" className="hidden">
        <label htmlFor="hp">Leave this field empty</label>
        <input id="hp" name="hp" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-60"
      >
        {status === "submitting" ? "Joining…" : "Get early access"}
      </button>
    </form>
  );
}
