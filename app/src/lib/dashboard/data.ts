/**
 * Everything the dashboard tabs read, loaded once by the page and handed to
 * each tab's view. Internal projects (our own company) carry no deal and no
 * money: `external` and `externalClients` leave them out for Sales, Money and
 * Clients; Delivery and Team use the full lists.
 *
 * The Month dropdown also offers All time (`?month=all`): `month` is then
 * ALL_TIME and `allTime` is true, and each tab reads its whole history instead
 * of one month (see each tab's maths module for what that means there).
 */
import type { AgencyProfile } from "@/lib/data/agency";
import type { Client } from "@/lib/data/clients";
import type { ContentPost } from "@/lib/data/content";
import type { Contract } from "@/lib/data/contracts";
import type { Invoice } from "@/lib/data/invoices";
import type { Lead } from "@/lib/data/leads";
import type { OnboardingSubmission } from "@/lib/data/onboarding";
import type { Quotation } from "@/lib/data/quotations";
import type { SprintTask } from "@/lib/data/sprint-tasks";
import type { TeamMember } from "@/lib/data/team";
import type { Work } from "@/lib/data/works";

/** The Month dropdown value for "every month": `?month=all`. */
export const ALL_TIME = "all";

export type DashboardData = {
    team: TeamMember[];
    clients: Client[];
    externalClients: Client[];
    contracts: Contract[];
    external: Contract[];
    works: Work[];
    invoices: Invoice[];
    leads: Lead[];
    quotes: Quotation[];
    content: ContentPost[];
    submissions: OnboardingSubmission[];
    sprintTasks: SprintTask[];
    agency: AgencyProfile;
    /** YYYY-MM-DD. */
    today: string;
    /** YYYY-MM the numbers are read for (the Month dropdown), or ALL_TIME. */
    month: string;
    /** True when the Month dropdown is on All time; `month` is then ALL_TIME. */
    allTime: boolean;
    /** YYYY-MM of today. */
    current: string;
    /** Builds a dashboard link that keeps `?as=` and the month. */
    href: (q: { tab?: string; month?: string }) => string;
};

/** The last `n` months ending at `month` (inclusive), oldest first, plus `ahead` future months. */
export function monthsAround(month: string, back: number, ahead = 0): string[] {
    const [y, m] = month.split("-").map(Number);
    const out: string[] = [];
    for (let i = -(back - 1); i <= ahead; i += 1) {
        const d = new Date(Date.UTC(y, m - 1 + i, 1));
        out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    }
    return out;
}

/** "Nov" for a YYYY-MM. */
export function monthShort(ym: string): string {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-MY", { month: "short", timeZone: "UTC" });
}

/**
 * Chart label for the month at `i` in `months`: "Nov", with the year added
 * ("Jan '27") on January and on the first point when the run spans more than
 * one year, so a long All time axis still says which year it is in.
 */
export function axisLabel(months: string[], i: number): string {
    const ym = months[i];
    const crosses = months.length > 0 && months[0].slice(0, 4) !== months[months.length - 1].slice(0, 4);
    if (!crosses || (i > 0 && !ym.endsWith("-01"))) return monthShort(ym);
    return `${monthShort(ym)} '${ym.slice(2, 4)}`;
}

/** "Nov 2026" for a YYYY-MM. */
export function monthYear(ym: string): string {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-MY", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** True for a well-formed YYYY-MM (task months, contract dates sliced to the month). */
export function isYm(s: string | null | undefined): s is string {
    return typeof s === "string" && /^\d{4}-\d{2}$/.test(s);
}

/** Every month from `from` to `to` inclusive (YYYY-MM), capped at ten years so a bad date cannot loop forever. */
export function monthsBetween(from: string, to: string): string[] {
    if (!isYm(from) || !isYm(to) || from > to) return [];
    const [y, m] = from.split("-").map(Number);
    const out: string[] = [];
    for (let i = 0; i < 120; i += 1) {
        const d = new Date(Date.UTC(y, m - 1 + i, 1));
        const s = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        if (s > to) break;
        out.push(s);
    }
    return out;
}

/** The last day of a YYYY-MM, as YYYY-MM-DD. */
export function monthEnd(ym: string): string {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
