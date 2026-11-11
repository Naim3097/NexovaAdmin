/**
 * Who sees what. Pure functions.
 *
 * SYSTEM ROLE (admin | management | user) = permissions. FUNCTIONS (account
 * manager, sales, finance) = duties an admin or manager hands to a user; they
 * add pages and work, never permissions. A user sees only what is assigned to
 * them (see src/lib/scope.ts); admin and management see everything.
 */
import type { SystemRole, TeamFunction, TeamMember } from "@/lib/data/team";

export type { SystemRole, TeamFunction } from "@/lib/data/team";
export { SYSTEM_ROLES, SYSTEM_ROLE_LABEL, FUNCTIONS, FUNCTION_LABEL, isSystemRole, isFunction } from "@/lib/data/team";

type RoleLike = Pick<TeamMember, "systemRoles"> & Partial<Pick<TeamMember, "functions">>;

export function rolesOf(member: RoleLike | null | undefined): SystemRole[] {
    return member?.systemRoles?.length ? member.systemRoles : ["user"];
}

export function functionsOf(member: RoleLike | null | undefined): TeamFunction[] {
    return member?.functions ?? [];
}

export function hasRole(member: RoleLike | null | undefined, ...roles: SystemRole[]): boolean {
    const mine = rolesOf(member);
    return roles.some((r) => mine.includes(r));
}

export function hasFunction(member: RoleLike | null | undefined, ...fns: TeamFunction[]): boolean {
    const mine = functionsOf(member);
    return fns.some((f) => mine.includes(f));
}

/** Admin or management: sees everything, assigns functions. */
export function isManager(member: RoleLike | null | undefined): boolean {
    return hasRole(member, "admin", "management");
}

/**
 * Landing: managers open the Dashboard (numbers, tabs); everyone else opens
 * My tasks. /home, /management, /finance and /activity redirect into these.
 */
export const DASHBOARD = "/dashboard";
export const MY_TASKS = "/my-work";
export const HOME_BY_ROLE: Record<SystemRole, string> = { admin: DASHBOARD, management: DASHBOARD, user: MY_TASKS };

export function homeFor(member: RoleLike | null | undefined): string {
    if (!member) return DASHBOARD;
    return isManager(member) ? DASHBOARD : MY_TASKS;
}

/** Routes every signed-in team member may open (scoped to their assignments for users). */
const BASE_ROUTES = [
    "/my-work", "/calendar", "/notifications",
    "/settings/clients", "/contracts",
    "/works", "/campaigns", "/content", "/seo", "/website", "/custom-tasks",
    "/team", "/profile",
] as const;

/** Extra routes a function unlocks (the Dashboard shows only that duty's tabs). */
export const ROUTES_BY_FUNCTION: Record<TeamFunction, readonly string[]> = {
    account_manager: ["/dashboard", "/my-clients", "/onboarding", "/reports", "/invoices", "/quotes"],
    sales: ["/dashboard", "/pipeline", "/leads", "/quotes"],
    finance: ["/dashboard", "/invoices", "/quotes", "/reports"],
};

/** Dashboard tabs. "all" shows every tab the member may see. */
export const DASHBOARD_TABS = ["all", "delivery", "sales", "money", "team", "clients", "activity"] as const;
export type DashboardTab = (typeof DASHBOARD_TABS)[number];
export const DASHBOARD_TAB_LABEL: Record<DashboardTab, string> = {
    all: "All",
    delivery: "Delivery",
    sales: "Sales",
    money: "Money",
    team: "Team",
    clients: "Clients",
    activity: "Activity",
};

/** Which Dashboard tabs a member may open: managers all; duties their own slice. */
export function dashboardTabsFor(member: RoleLike | null | undefined): DashboardTab[] {
    if (!member || isManager(member)) return [...DASHBOARD_TABS];
    const tabs = new Set<DashboardTab>(["all"]);
    if (hasFunction(member, "account_manager")) ["delivery", "clients", "activity"].forEach((t) => tabs.add(t as DashboardTab));
    if (hasFunction(member, "sales")) ["sales", "activity"].forEach((t) => tabs.add(t as DashboardTab));
    if (hasFunction(member, "finance")) ["money", "activity"].forEach((t) => tabs.add(t as DashboardTab));
    return DASHBOARD_TABS.filter((t) => tabs.has(t));
}

/** Routes per system role. "*" = everything. */
export const ROUTES_BY_ROLE: Record<SystemRole, readonly string[]> = {
    admin: ["*"],
    management: ["*"],
    user: BASE_ROUTES,
};

function matches(allowed: readonly string[], href: string): boolean {
    for (const a of allowed) {
        if (a === "*") return true;
        if (href === a || href.startsWith(`${a}/`)) return true;
    }
    return false;
}

export function canSee(member: RoleLike | null | undefined, href: string): boolean {
    for (const r of rolesOf(member)) if (matches(ROUTES_BY_ROLE[r], href)) return true;
    for (const f of functionsOf(member)) if (matches(ROUTES_BY_FUNCTION[f], href)) return true;
    return false;
}
