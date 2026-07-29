"use server";

import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Verify a one-time invite/recovery token and establish the session.
 *
 * Deliberately a server ACTION (POST), not a GET route: WhatsApp, Telegram,
 * Slack, iMessage and mail scanners all fetch shared links to build previews,
 * and a GET that verifies would burn the single-use token before the human
 * ever taps it ("link expired" on first open). Bots don't submit forms.
 *
 * IDENTITY RULE: any session already in this browser is ended first — the link
 * decides who you are, never the previous occupant.
 */
export async function confirmLinkAction(formData: FormData) {
    const tokenHash = String(formData.get("token_hash") ?? "");
    const type = String(formData.get("type") ?? "") as EmailOtpType;
    const rawNext = String(formData.get("next") ?? "/dashboard");
    // Only allow same-site paths through.
    const next = rawNext.startsWith("/") ? rawNext : "/dashboard";

    const supabase = await createClient();
    await supabase.auth.signOut().catch(() => {});

    if (!tokenHash || !type) redirect("/login?error=link");

    const { error } = await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
    });
    if (error) redirect("/login?error=link");
    redirect(next);
}
