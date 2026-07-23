"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const CredentialsSchema = z.object({
    email: z.email({ error: "Enter a valid email." }),
    password: z.string().min(6, "Password must be at least 6 characters."),
});

export type LoginState = {
    ok: boolean;
    message?: string;
};

export async function signIn(
    _prev: LoginState | undefined,
    formData: FormData,
): Promise<LoginState> {
    const parsed = CredentialsSchema.safeParse({
        email: formData.get("email"),
        password: formData.get("password"),
    });
    if (!parsed.success) {
        return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
    }
    const next = String(formData.get("next") ?? "/dashboard");

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
    });

    if (error) {
        return { ok: false, message: error.message };
    }
    redirect(next);
}

/**
 * End the current session and land on the given login door. Used by the
 * role-mismatch interstitials: a CLIENT session on the team door (or a staff
 * session on the client door) must be explicitly ended before switching —
 * one browser holds one session, so this is the only correct way through.
 */
export async function signOutAndSwitch(formData: FormData) {
    const to = String(formData.get("to") ?? "/login");
    // Same-origin paths only.
    const dest = to.startsWith("/") && !to.startsWith("//") ? to : "/login";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect(dest);
}

export async function signUp(
    _prev: LoginState | undefined,
    formData: FormData,
): Promise<LoginState> {
    const parsed = CredentialsSchema.safeParse({
        email: formData.get("email"),
        password: formData.get("password"),
    });
    if (!parsed.success) {
        return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
    });

    if (error) {
        return { ok: false, message: error.message };
    }
    // If confirm-email is on, session will be null until they click the email link.
    if (!data.session) {
        return {
            ok: true,
            message: "Account created. Check your email to confirm, then sign in.",
        };
    }
    redirect("/dashboard");
}
