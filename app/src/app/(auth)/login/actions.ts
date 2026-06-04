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
