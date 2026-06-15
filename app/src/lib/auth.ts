/**
 * Permission helper backed by the SQL function `user_has_permission(uid, perm)`.
 * Used in Server Components, Server Actions, and Route Handlers.
 *
 * Permission keys follow `entity.action` (e.g. `leads.view`, `deals.edit`)
 * with `*` wildcards (e.g. `leads.*` or top-level `*`).
 */
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * DEV-ONLY auth bypass. When `DEV_AUTH_BYPASS=1` and not in production,
 * `getCurrentUser` returns a fake admin user so layouts/pages render without
 * a real Supabase session. `hasPermission` returns true for everything.
 * Force-disabled in production builds.
 */
function devBypassUser() {
    if (
        process.env.NODE_ENV !== "production" &&
        process.env.DEV_AUTH_BYPASS === "1"
    ) {
        return {
            id: "00000000-0000-0000-0000-000000000000",
            email: "dev@nexova.local",
            aud: "authenticated",
            role: "authenticated",
            app_metadata: {},
            user_metadata: { name: "Dev User" },
            created_at: new Date(0).toISOString(),
        } as unknown as Awaited<
            ReturnType<
                Awaited<ReturnType<typeof createClient>>["auth"]["getUser"]
            >
        >["data"]["user"];
    }
    return null;
}

/**
 * Wrapped in React `cache()` so the (network) auth validation runs at most once
 * per request, even though the layout, page, and helpers all call it.
 */
export const getCurrentUser = cache(async () => {
    const bypass = devBypassUser();
    if (bypass) return bypass;
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return data.user;
});

export async function requireUser() {
    const user = await getCurrentUser();
    if (!user) {
        throw new Error("UNAUTHENTICATED");
    }
    return user;
}

/**
 * Resolve the signed-in auth user to their linked `team_members` row, so pages
 * have team context (name/role, "my work" default, default assignee). Returns
 * null if not signed in or the user has no linked member row yet.
 */
export const getCurrentTeamMember = cache(async () => {
    const user = await getCurrentUser();
    if (!user) return null;
    // Imported lazily to avoid pulling the data layer into every auth import.
    const { getTeamMemberByUserId } = await import("@/lib/data/team");
    return getTeamMemberByUserId(user.id).catch(() => null);
});

/**
 * Resolve the signed-in auth user to the CLIENT they belong to (via
 * clients.user_id), if any. A non-null result means this user is a client —
 * the admin layout uses this to redirect them out to /portal, and the portal
 * uses it to scope to their own content. Returns null for team/agency users.
 */
export const getCurrentClient = cache(async () => {
    const user = await getCurrentUser();
    if (!user) return null;
    const { getClientByUserId } = await import("@/lib/data/clients");
    return getClientByUserId(user.id).catch(() => null);
});

/**
 * Permissions are intentionally OPEN: any signed-in user (or the dev-bypass
 * user) can do anything. We only check authentication, not authorization.
 * Restore role/permission checks here when the team needs them.
 */
export async function hasPermission(_perm: string): Promise<boolean> {
    if (devBypassUser()) return true;
    const user = await getCurrentUser();
    return user !== null;
}

export async function requirePermission(_perm: string) {
    const user = await getCurrentUser();
    if (!user) throw new Error("UNAUTHENTICATED");
}
