"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function signIn(formData: FormData) {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect(`/login?error=${encodeURIComponent("Invalid email or password")}`);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    console.error("[auth:signIn]", error.message);
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard");
}
