/**
 * Supabase server client (RSC, Server Actions, Route Handlers).
 * Reads/writes auth cookies using Next.js's async cookies() API.
 * Always honours RLS — never use the service-role key here.
 */
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";
import { env } from "@/lib/env";

export async function createClient() {
    const cookieStore = await cookies();

    return createServerClient<Database>(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options),
                        );
                    } catch {
                        // Setting cookies from a Server Component is not allowed.
                        // Safe to ignore if middleware refreshes the session.
                    }
                },
            },
        },
    );
}

/**
 * Service-role client — bypasses RLS. Server-only.
 * Use ONLY for trusted background jobs (webhooks, cron). Never in user-facing requests.
 */
export function createServiceClient() {
    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    }
    return createServerClient<Database>(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY,
        {
            cookies: {
                getAll: () => [],
                setAll: () => { },
            },
            auth: { persistSession: false },
        },
    );
}
