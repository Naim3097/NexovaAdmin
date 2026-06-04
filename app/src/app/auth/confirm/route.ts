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
 */
export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const tokenHash = url.searchParams.get("token_hash");
    const type = url.searchParams.get("type") as EmailOtpType | null;
    const next = url.searchParams.get("next") ?? "/dashboard";

    if (tokenHash && type) {
        const supabase = await createClient();
        const { error } = await supabase.auth.verifyOtp({
            type,
            token_hash: tokenHash,
        });
        if (!error) {
            return NextResponse.redirect(new URL(next, url.origin));
        }
    }
    return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
