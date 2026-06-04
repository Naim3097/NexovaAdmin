/**
 * Supabase browser client.  Uses the anon key + RLS for safety.
 * Use in Client Components only.
 */
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";

// Read the public vars directly so the bundler inlines them and the browser
// client never pulls in the server-only env module (which throws if parsed
// client-side).
export function createClient() {
    return createBrowserClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
}
