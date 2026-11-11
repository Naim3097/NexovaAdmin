/**
 * Links back into the Dashboard. Defaults are left out of the URL, so a
 * plain /dashboard means "everything, this month, last 30 days".
 */
import type { DashboardTab } from "@/lib/roles";

export const DASHBOARD_PATH = "/dashboard";
/** Default range of the Activity tab. */
export const DEFAULT_RANGE = "30d";

export type DashboardQuery = {
    tab?: DashboardTab;
    /** YYYY-MM; left out when it is the current month. */
    month?: string;
    /** Dev bypass: who the page acts as. */
    as?: string;
    /** Activity tab filters. */
    entity?: string;
    range?: string;
};

export function dashboardHref(q: DashboardQuery, currentMonth: string): string {
    const p = new URLSearchParams();
    if (q.tab && q.tab !== "all") p.set("tab", q.tab);
    if (q.month && q.month !== currentMonth) p.set("month", q.month);
    if (q.entity && q.entity !== "all") p.set("entity", q.entity);
    if (q.range && q.range !== DEFAULT_RANGE) p.set("range", q.range);
    if (q.as) p.set("as", q.as);
    const s = p.toString();
    return s ? `${DASHBOARD_PATH}?${s}` : DASHBOARD_PATH;
}
