"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/supabase/env";

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  full_name: z.string().trim().min(1).optional(),
});

export async function signUp(formData: FormData) {
  const rawFullName = formData.get("full_name");
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    full_name: typeof rawFullName === "string" && rawFullName ? rawFullName : undefined,
  });

  if (!parsed.success) {
    redirect(`/signup?error=${encodeURIComponent("Please check your details")}`);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${getSiteUrl()}/auth/callback`,
      data: parsed.data.full_name
        ? { full_name: parsed.data.full_name }
        : undefined,
    },
  });

  if (error) {
    console.error("[auth:signUp]", error.message);
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  redirect(
    `/login?message=${encodeURIComponent(
      "Check your email to confirm your account, then sign in.",
    )}`,
  );
}
