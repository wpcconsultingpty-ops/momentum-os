import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("[auth:signOut]", error.message);
  }

  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
