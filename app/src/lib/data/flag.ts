/**
 * Per-entity feature flag for the Supabase cutover.
 *
 * The USE_SUPABASE env var controls which entities read/write Supabase vs the
 * local .dev-data/ JSON store:
 *
 *   USE_SUPABASE=0          → all entities use dev-store (default)
 *   USE_SUPABASE=1          → all entities use Supabase
 *   USE_SUPABASE=leads,projects → only those entities use Supabase
 *
 * This lives in its own file (not lib/env.ts) so it can be re-evaluated per
 * request without restarting the server, and so adapter modules don't pull in
 * the full env Zod parser at import time.
 */

export const ENTITY_NAMES = [
    "agency",
    "services",
    "clients",
    "team",
    "leads",
    "onboarding",
    "projects",
    "workflows",
    "invoices",
    "campaigns",
    "content",
    "seo",
    "notifications",
    "audit",
] as const;

export type EntityName = (typeof ENTITY_NAMES)[number];

export function isSupabaseEnabled(entity: EntityName): boolean {
    const raw = (process.env.USE_SUPABASE ?? "0").trim().toLowerCase();
    if (raw === "" || raw === "0" || raw === "false" || raw === "off") return false;
    if (raw === "1" || raw === "true" || raw === "on" || raw === "all") return true;
    // Comma list of entity names.
    const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
    return list.includes(entity);
}
