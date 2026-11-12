/**
 * Who sees what. Pure functions.
 *
 * SYSTEM ROLE (admin | management | user) = permissions. Management sees
 * everything; admin is management plus adding team members and deleting
 * things. DUTIES (delivery | finance) open pages for a user: delivery is every
 * page except the Dashboard and Finances, finance adds Finances. Being an
 * account manager or a deal owner is not a duty: it follows from the projects
 * and clients a person is set on.
 *
 * Nothing is scoped by assignment any more except the two personal pages, My
 * tasks and My accounts; every other page shows everything and filters.
 */
import type { SystemRole, TeamFunction, TeamMember } from "@/lib/data/team";

export type { SystemRole, TeamFunction } from "@/lib/data/team";
export { SYSTEM_ROLES, SYSTEM_ROLE_LABEL, FUNCTIONS, FUNCTION_LABEL, isSystemRole, isFunction } from "@/lib/data/team";

type RoleLike = Pick<TeamMember, "systemRoles"> & Partial<Pick<TeamMember, "functions">>;

export function rolesOf(member: RoleLike | null | undefined): SystemRole[] {
    return member?.systemRoles?.length ? member.systemRoles : ["user"];
}

export function functionsOf(member: RoleLike | null | undefined): TeamFunction[] {
    return member?.functions?.length ? member.functions : ["delivery"];
}

export function hasRole(member: RoleLike | null | undefined, ...roles: SystemRole[]): boolean {
    const mine = rolesOf(member);
    return roles.some((r) => mine.includes(r));
}

export function hasFunction(member: RoleLike | null | undefined, ...fns: TeamFunction[]): boolean {
    const mine = functionsOf(member);
    return fns.some((f) => mine.includes(f));
}

/** Admin or management: sees everything, hands out duties. Nobody resolved (dev bypass) counts as management. */
export function isManager(member: RoleLike | null | undefined): boolean {
    return !member || hasRole(member, "admin", "management");
}

/** Admin only: adds team members, deletes records. */
export function isAdmin(member: RoleLike | null | undefined): boolean {
    return !member || hasRole(member, "admin");
}

/** Finances (quotes, invoices, money): management and the finance duty. */
export function seesFinance(member: RoleLike | null | undefined): boolean {
    return isManager(member) || hasFunction(member, "finance");
}

/**
 * Landing: management opens the Dashboard (numbers, tabs); everyone else opens
 * My tasks. /home, /management, /finance and /activity redirect into these.
 */
export const DASHBOARD = "/dashboard";
export const MY_TASKS = "/my-work";
export const HOME_BY_ROLE: Record<SystemRole, string> = { admin: DASHBOARD, management: DASHBOARD, user: MY_TASKS };

export function homeFor(member: RoleLike | null | undefined): string {
    return isManager(member) ? DASHBOARD : MY_TASKS;
}

/** Routes every signed-in team member may open. */
const BASE_ROUTES = ["/my-work", "/my-clients", "/calendar", "/notifications", "/profile", "/settings", "/team"] as const;

/** Routes a duty opens. */
export const ROUTES_BY_FUNCTION: Record<TeamFunction, readonly string[]> = {
    delivery: [
        "/projects",
        "/works",
        "/campaigns",
        "/content",
        "/seo",
        "/website",
        "/custom-tasks",
        "/leads",
        "/pipeline",
        "/onboarding",
        "/reports",
        "/activity",
    ],
    finance: ["/finance", "/invoices", "/quotes", "/reports"],
};

/** Management only. */
const MANAGER_ROUTES = ["/dashboard", "/settings/agency"] as const;

/** Dashboard tabs, in order. Opens on Delivery; there is no "all". */
export const DASHBOARD_TABS = ["delivery", "sales", "money", "team", "clients", "activity"] as const;
export type DashboardTab = (typeof DASHBOARD_TABS)[number];
export const DASHBOARD_TAB_LABEL: Record<DashboardTab, string> = {
    delivery: "Delivery",
    sales: "Sales",
    money: "Money",
    team: "Team",
    clients: "Clients",
    activity: "Activity",
};
export const DEFAULT_DASHBOARD_TAB: DashboardTab = "delivery";

/** The Dashboard is management's: every tab for them, none for anyone else. */
export function dashboardTabsFor(member: RoleLike | null | undefined): DashboardTab[] {
    return isManager(member) ? [...DASHBOARD_TABS] : [];
}

function matches(allowed: readonly string[], href: string): boolean {
    for (const a of allowed) {
        if (a === "*") return true;
        if (href === a || href.startsWith(`${a}/`) || href.startsWith(`${a}?`)) return true;
    }
    return false;
}

export function canSee(member: RoleLike | null | undefined, href: string): boolean {
    if (isManager(member)) return true;
    if (matches(MANAGER_ROUTES, href)) return false;
    if (matches(BASE_ROUTES, href)) return true;
    for (const f of functionsOf(member)) if (matches(ROUTES_BY_FUNCTION[f], href)) return true;
    return false;
}
