/**
 * CI guard: every public table must have RLS enabled.
 * Run with:  npm run db:check-rls
 *
 * Requires env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";

async function main() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
        process.exit(2);
    }

    const sb = createClient(url, key, { auth: { persistSession: false } });

    // Query Postgres metadata for tables in `public` and check rowsecurity.
    // Uses Supabase's PostgREST -> we need an RPC or direct REST query.
    // Easiest: a tiny SQL function. Until that's installed, query pg_tables view.
    const { data, error } = await sb
        .from("pg_tables_meta")
        .select("schemaname,tablename,rowsecurity")
        .eq("schemaname", "public");

    if (error) {
        console.error(
            "Could not read pg_tables_meta. Create the helper view from supabase/migrations/0004_rls_check.sql, or run check manually.",
            error.message,
        );
        process.exit(2);
    }

    const offenders = (data ?? []).filter((t) => !t.rowsecurity);
    if (offenders.length > 0) {
        console.error("❌ Tables without RLS:");
        offenders.forEach((t) => console.error(`  - ${t.schemaname}.${t.tablename}`));
        process.exit(1);
    }
    console.log(`✅ RLS enabled on all ${data?.length ?? 0} public tables.`);
}

void main();
