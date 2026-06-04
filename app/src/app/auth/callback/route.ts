import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth/Magic-link callback handler.
 * Exchanges the auth code in the URL for a session cookie, then
 * redirects to `next` (or "/dashboard" by default).
 */
export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const next = url.searchParams.get("next") ?? "/dashboard";

    if (code) {
        const supabase = await createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
            return NextResponse.redirect(new URL(next, url.origin));
        }
    }

    return NextResponse.redirect(new URL("/login?error=auth", url.origin));
}
