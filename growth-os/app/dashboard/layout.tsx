import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="font-semibold">
              Momentum
            </Link>
            <nav className="flex gap-4 text-sm text-gray-600">
              <Link href="/dashboard/content" className="hover:text-gray-900">
                Content
              </Link>
              <Link href="/dashboard/leads" className="hover:text-gray-900">
                Leads
              </Link>
              <Link
                href="/dashboard/attribution"
                className="hover:text-gray-900"
              >
                Attribution
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-500">{user.email}</span>
            <form action="/auth/sign-out" method="post">
              <button
                type="submit"
                className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-100"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
