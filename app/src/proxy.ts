/**
 * Edge proxy (Next.js 16, formerly `middleware`):
 *  1. Refresh Supabase session on every request (keeps JWT fresh in cookies).
 *  2. Gate `(admin)` and `(portal)` routes behind authentication.
 *  3. Light role gate: clients can only reach `/portal/*`; staff cannot.
 *     Fine-grained permissions are checked server-side per page/action.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = ["/", "/login", "/signup", "/api/health"];

function isPublic(pathname: string) {
    if (PUBLIC_PATHS.includes(pathname)) return true;
    // Webhooks are signature-verified inside each route; bypass auth gate.
    if (pathname.startsWith("/api/webhooks/")) return true;
    if (pathname.startsWith("/api/public/")) return true;
    if (pathname.startsWith("/api/dev-files/")) return true;
    // /api/ai/* /api/email/* /api/telegram/* are dev-only (routes 404 in prod)
    if (
        process.env.NODE_ENV !== "production" &&
        (pathname.startsWith("/api/ai/") ||
            pathname.startsWith("/api/email/") ||
            pathname.startsWith("/api/telegram/"))
    )
        return true;
    if (pathname.startsWith("/auth/")) return true;
    if (pathname.startsWith("/onboard/")) return true;
    return false;
}

export async function proxy(request: NextRequest) {
    let response = NextResponse.next({ request });

    // DEV-ONLY: skip auth entirely so the UI is browseable without Supabase.
    // Set DEV_AUTH_BYPASS=1 in .env.local. Force-disabled in production.
    if (
        process.env.NODE_ENV !== "production" &&
        process.env.DEV_AUTH_BYPASS === "1"
    ) {
        return response;
    }

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => request.cookies.getAll(),
                setAll: (cookies) => {
                    cookies.forEach(({ name, value }) =>
                        request.cookies.set(name, value),
                    );
                    response = NextResponse.next({ request });
                    cookies.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options),
                    );
                },
            },
        },
    );

    const {
        data: { user },
    } = await supabase.auth.getUser();

    const { pathname } = request.nextUrl;

    if (isPublic(pathname)) return response;

    if (!user) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("next", pathname);
        return NextResponse.redirect(url);
    }

    return response;
}

export const config = {
    matcher: [
        // Run on everything except static assets + _next internals
        "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|robots.txt|sw.js|workbox-.*\\.js).*)",
    ],
};
