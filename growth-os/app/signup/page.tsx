import Link from "next/link";
import { signUp } from "./actions";

export default function SignupPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Create account</h1>
        <p className="mt-1 text-sm text-gray-600">
          Start tracking content, leads, and attribution.
        </p>

        {searchParams.error ? (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {searchParams.error}
          </p>
        ) : null}

        <form action={signUp} className="mt-6 space-y-4">
          <div>
            <label htmlFor="full_name" className="block text-sm font-medium">
              Full name
            </label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              autoComplete="name"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            Create account
          </button>
        </form>

        <p className="mt-6 text-sm text-gray-600">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-gray-900 underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
