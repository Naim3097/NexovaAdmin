/**
 * Dashboard — the landing page for management. Each tab is the view of one
 * head: numbers first (every tile is one big number, a short hint, a colour and
 * a link to the page that fixes it), then a few plain bar pictures and the
 * table of what needs attention. It opens on Delivery.
 *
 * Who "I" am: the linked login, else the `?as=` pick (DEV_AUTH_BYPASS), else
 * the acting-as cookie the sidebar picker set; nobody picked = manager view.
 * Anyone who is not management (no tabs) is sent to their own home.
 *
 * The Month dropdown carries an "All time" option (`?month=all`) on every tab
 * but Activity; each tab then reads its whole history (see DashboardData).
 */
import { redirect } from "next/navigation";
import { getActingMember, getCurrentTeamMember, requireTeamAccess } from "@/lib/auth";
import { listActivityFiltered } from "@/lib/activity";
import { getAgencyProfile } from "@/lib/data/agency";
import { listClients } from "@/lib/data/clients";
import { listContentPosts, listContracts, listInvoices, listLeads, listQuotations, listSubmissions, listWorks } from "@/lib/data/reads";
import { listSprintTasks } from "@/lib/data/sprint-tasks";
import { listTeamMembers } from "@/lib/data/team";
import { ALL_TIME, type DashboardData } from "@/lib/dashboard/data";
import { resolveMonth, todayYmd } from "@/lib/management/metrics";
import { DASHBOARD_TABS, DEFAULT_DASHBOARD_TAB, dashboardTabsFor, homeFor, type DashboardTab } from "@/lib/roles";
import { externalClients, externalOnly } from "@/lib/clients/internal";
import { MonthSelect } from "@/app/(admin)/management/ui";
import { ActivityFeed, FEED_LIMIT, parseActivityParams } from "./activity-feed";
import { dashboardHref, type DashboardQuery } from "./href";
import { DashboardTabs } from "./tabs";
import { ClientsView } from "./views/clients";
import { DeliveryView } from "./views/delivery";
import { MoneyView } from "./views/money";
import { SalesView } from "./views/sales";
import { TeamView } from "./views/team";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(sp: SearchParams, key: string): string {
    const v = sp[key];
    return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
}

function isTab(s: string): s is DashboardTab {
    return (DASHBOARD_TABS as readonly string[]).includes(s);
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    await requireTeamAccess();
    const sp = await searchParams;
    const as = one(sp, "as");
    const [member, linked] = await Promise.all([getActingMember(as || undefined), getCurrentTeamMember()]);
    // Management only: no tabs means no Dashboard, so land on My tasks.
    const tabs = dashboardTabsFor(member);
    if (tabs.length === 0) redirect(homeFor(member));

    const wanted = one(sp, "tab");
    const tab: DashboardTab = isTab(wanted) && tabs.includes(wanted) ? wanted : DEFAULT_DASHBOARD_TAB;
    const today = todayYmd();
    const current = today.slice(0, 7);
    // "all" is the All time pick; anything else falls back to a real month.
    const allTime = one(sp, "month") === ALL_TIME;
    const month = allTime ? ALL_TIME : resolveMonth(sp.month, today);
    // `?as=` rides along on links only under the dev bypass, when it came from the URL.
    const asParam = as && !linked ? as : "";
    const href = (q: DashboardQuery) => dashboardHref({ ...q, as: asParam }, current);

    const activity = parseActivityParams(one(sp, "entity"), one(sp, "range"));
    const [team, clients, contracts, works, invoices, leads, quotes, content, submissions, sprintTasks, agency, events] = await Promise.all([
        listTeamMembers(),
        listClients(),
        listContracts(),
        listWorks(),
        listInvoices(),
        listLeads(),
        listQuotations(),
        listContentPosts(),
        listSubmissions(),
        tab === "team" ? listSprintTasks() : Promise.resolve([]),
        getAgencyProfile(),
        tab === "activity" ? listActivityFiltered({ entity: activity.entity, sinceDays: activity.range.days || undefined, limit: FEED_LIMIT }) : Promise.resolve([]),
    ]);

    const data: DashboardData = {
        team,
        clients,
        externalClients: externalClients(clients),
        contracts,
        external: externalOnly(contracts, clients),
        works,
        invoices,
        leads,
        quotes,
        content,
        submissions,
        sprintTasks,
        agency,
        today,
        month,
        allTime,
        current,
        href: (q) => href({ tab: (q.tab as DashboardTab | undefined) ?? tab, month: q.month }),
    };

    const tabHref = (t: DashboardTab) => href({ tab: t, month: month !== current ? month : undefined });
    const monthHref = (m: string) => href({ tab, month: m });

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                    <h1 className="text-2xl font-semibold sm:text-3xl">Dashboard</h1>
                    <p className="text-sm text-muted-foreground">Numbers first. Click one to fix it.</p>
                </div>
                <p className="text-xs text-muted-foreground">As of {today}</p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
                <DashboardTabs tabs={tabs} active={tab} hrefFor={tabHref} />
                {tab !== "activity" ? <MonthSelect selected={month} today={today} hrefFor={monthHref} allTime /> : null}
            </div>

            {tab === "activity" ? (
                <ActivityFeed events={events} params={activity} today={today} hrefFor={(next) => href({ tab, entity: next.entity ?? activity.entity, range: next.range ?? activity.range.key })} />
            ) : tab === "sales" ? (
                <SalesView data={data} />
            ) : tab === "money" ? (
                <MoneyView data={data} />
            ) : tab === "team" ? (
                <TeamView data={data} />
            ) : tab === "clients" ? (
                <ClientsView data={data} />
            ) : (
                <DeliveryView data={data} />
            )}
        </div>
    );
}
