"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Server action used by `<SignOutButton />`. Clears the Supabase session
 * cookie and bounces back to the login page.
 *
 * The magic-link sign-in action lives at
 * `src/app/(auth)/login/actions.ts` (`sendMagicLink`).
 */
export async function signOutAction() {
    const sb = await createClient();
    await sb.auth.signOut();
    redirect("/login");
}
