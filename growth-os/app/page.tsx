import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-6 text-center">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Momentum Growth OS
        </h1>
        <p className="text-lg text-gray-600">
          Tie Instagram engagement to survey responses and trial signups. Track
          content, capture leads, and attribute every conversion back to the
          post that started it.
        </p>
      </div>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-700"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="rounded-md border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-100"
        >
          Create account
        </Link>
      </div>
    </main>
  );
}
