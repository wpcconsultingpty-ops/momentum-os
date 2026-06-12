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
      <div className="rounded-lg border border-amber-200/30 bg-amber-200/5 p-6 text-center">
        <h2 className="text-lg font-semibold text-amber-100">
          You&apos;re on the list.
        </h2>
        <p className="mt-2 text-sm text-slate-300">
          We&apos;ll reach out when the next beta cohort opens. Keep an eye on
          your inbox.
        </p>
      </div>
    );
  }

  const fieldClass =
    "mt-1 w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-200/60 focus:outline-none";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {status === "error" ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          Something went wrong. Please try again.
        </p>
      ) : null}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-200">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className={fieldClass}
        />
      </div>

      <div>
        <label htmlFor="full_name" className="block text-sm font-medium text-slate-200">
          Full name <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          autoComplete="name"
          placeholder="Your name"
          className={fieldClass}
        />
      </div>

      <div>
        <label htmlFor="ig_user_handle" className="block text-sm font-medium text-slate-200">
          Instagram handle <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <div className="mt-1 flex items-center rounded-md border border-slate-700 bg-slate-900/60 focus-within:border-amber-200/60">
          <span className="pl-3 text-sm text-slate-500">@</span>
          <input
            id="ig_user_handle"
            name="ig_user_handle"
            type="text"
            autoComplete="off"
            placeholder="yourhandle"
            className="w-full rounded-md border-0 bg-transparent px-2 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
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
        className="w-full rounded-md bg-amber-200 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-100 disabled:opacity-60"
      >
        {status === "submitting" ? "Submitting…" : "Apply for beta access"}
      </button>
    </form>
  );
}
