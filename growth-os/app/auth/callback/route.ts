import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const next = searchParams.get("next") ?? "/dashboard";

  if (error) {
    console.error("[auth:callback]", error, errorDescription);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorDescription ?? error)}`,
    );
  }

  if (code) {
    const supabase = createClient();
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error("[auth:callback]", exchangeError.message);
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(exchangeError.message)}`,
      );
    }

    return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("No authentication code provided")}`,
  );
}
