import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side OTP confirmation for invite / recovery / magic links.
 *
 * Verifies the token hash and establishes the session via cookies (SSR), then
 * redirects to `next`. This is the reliable path — unlike the implicit/hash
 * redirect, it works in a fresh browser (incognito) and never leaves tokens in
 * the URL fragment.
 *
 * IDENTITY RULE: the link decides who you are. Any session already in this
 * browser is ended BEFORE the token is verified — otherwise a teammate opening
 * their invite on a shared or previously-used browser inherits whoever was
 * signed in. That was silent, not obvious: an expired token redirected to
 * /login, which bounces an existing staff session straight to the dashboard,
 * so the teammate landed inside the other person's account.
 */
export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const tokenHash = url.searchParams.get("token_hash");
    const type = url.searchParams.get("type") as EmailOtpType | null;
    const next = url.searchParams.get("next") ?? "/dashboard";

    const supabase = await createClient();
    // Always start from a clean slate — never inherit the previous occupant.
    await supabase.auth.signOut().catch(() => {});

    if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
            type,
            token_hash: tokenHash,
        });
        if (!error) {
            return NextResponse.redirect(new URL(next, url.origin));
        }
    }
    // Failed/expired link: we're already signed out, so the login page shows
    // the real error instead of forwarding into someone else's session.
    return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
