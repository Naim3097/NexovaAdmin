/**
 * Supabase browser client.  Uses the anon key + RLS for safety.
 * Use in Client Components only.
 */
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";
import { publicEnv } from "@/lib/env";

export function createClient() {
    return createBrowserClient<Database>(
        publicEnv.supabaseUrl,
        publicEnv.supabaseAnonKey,
    );
}
