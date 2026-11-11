/**
 * Dashboard — the one landing page for managers and anyone with a duty.
 * Numbers only: every tile is one big number, a short hint, a colour and a
 * link to the page that fixes it. The tabs are the filter; no tab means
 * everything that is red or amber across the tabs the member may see.
 *
 * Who "I" am: the linked login, else the `?as=` pick (DEV_AUTH_BYPASS), else
 * the acting-as cookie the sidebar picker set; nobody picked = manager view.
 * Non-managers see their own slice: an account manager the tasks, contracts
 * and clients they are on; sales the pipeline; finance all the money.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { getActingMember, getCurrentTeamMember, requireTeamAccess } from "@/lib/auth";
import { listActivityFiltered } from "@/lib/activity";
import { listClients } from "@/lib/data/clients";
import { listContentPosts, listContracts, listInvoices, listLeads, listQuotations, listSubmissions, listWorks } from "@/lib/data/reads";
import { listSprintTasks } from "@/lib/data/sprint-tasks";
import { listTeamMembers } from "@/lib/data/team";
import { buildFinanceSnapshot, type FinanceSnapshot } from "@/lib/management/finance";
import { buildManagementSnapshot, resolveMonth, todayYmd, type ManagementSnapshot } from "@/lib/management/metrics";
import { buildOverviewSnapshot, type OverviewSnapshot } from "@/lib/management/overview";
import { DASHBOARD_TABS, DASHBOARD_TAB_LABEL, canSee, dashboardTabsFor, homeFor, type DashboardTab } from "@/lib/roles";
import { seesEverything, visibleClients, visibleContracts, worksOnMyContracts } from "@/lib/scope";
import { cn } from "@/lib/utils";
import { HEALTH_DOT, MonthSelect, Section, StatTile } from "@/app/(admin)/management/ui";
import { ActivityFeed, FEED_LIMIT, parseActivityParams } from "./activity-feed";
import { AttentionList } from "./attention";
import { dashboardHref, type DashboardQuery } from "./href";
import { MoneyDetail } from "./money-detail";
import { DashboardTabs } from "./tabs";
import { TeamDetail } from "./team-detail";
import { attentionTiles, clientTiles, deliveryTiles, moneyTiles, salesTiles, teamTiles, type Tile, type TileTab } from "./tiles";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(sp: SearchParams, key: string): string {
    const v = sp[key];
    return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
}

function isTab(s: string): s is DashboardTab {
    return (DASHBOARD_TABS as readonly string[]).includes(s);
}

const norm = (s: string) => s.trim().toLowerCase();

/** Columns for a row of tiles: five or six fit side by side; seven wrap to four. */
const GRID: Record<number, string> = {
    5: "xl:grid-cols-5",
    6: "xl:grid-cols-6",
};

function TileGrid({ tiles }: { tiles: Tile[] }) {
    return (
        <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3", GRID[tiles.length] ?? "xl:grid-cols-4")}>
            {tiles.map((t) => (
                <StatTile key={t.key} label={t.label} value={t.value} hint={t.hint} health={t.health} href={t.href} quiet={t.health === "green" && t.count === 0} />
            ))}
        </div>
    );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    await requireTeamAccess();
    const sp = await searchParams;
    const as = one(sp, "as");
    const [member, linked] = await Promise.all([getActingMember(as || undefined), getCurrentTeamMember()]);
    // No duty, no numbers: plain users land on their tasks.
    if (member && !canSee(member, "/dashboard")) redirect(homeFor(member));

    const tabs = dashboardTabsFor(member);
    const wanted = one(sp, "tab");
    const tab: DashboardTab = isTab(wanted) && tabs.includes(wanted) ? wanted : "all";
    const today = todayYmd();
    const current = today.slice(0, 7);
    const month = resolveMonth(sp.month, today);
    // `?as=` rides along on links only under the dev bypass, when it came from the URL.
    const asParam = as && !linked ? as : "";
    const href = (q: DashboardQuery) => dashboardHref({ ...q, as: asParam }, current);
    const manager = seesEverything(member);
    const has = (t: DashboardTab) => tabs.includes(t);

    const activity = parseActivityParams(one(sp, "entity"), one(sp, "range"));
    const [team, clients, contracts, works, invoices, leads, quotes, content, submissions, sprintTasks, events] = await Promise.all([
        listTeamMembers(),
        listClients(),
        listContracts(),
        listWorks(),
        listInvoices(),
        listLeads(),
        listQuotations(),
        listContentPosts(),
        listSubmissions(),
        has("team") ? listSprintTasks() : Promise.resolve([]),
        tab === "activity" ? listActivityFiltered({ entity: activity.entity, sinceDays: activity.range.days || undefined, limit: FEED_LIMIT }) : Promise.resolve([]),
    ]);

    // ---- Scope: what this member may count
    const myWorks = manager ? works : worksOnMyContracts(member, contracts, works);
    const myContracts = visibleContracts(member, contracts, works);
    const myClients = visibleClients(member, clients, contracts, works);
    const myContractIds = new Set(myContracts.map((c) => c.id));
    const myClientNames = new Set([...myClients.map((c) => norm(c.name)), ...myContracts.map((c) => norm(c.clientName))]);
    const myContent = manager ? content : content.filter((c) => (c.contractId && myContractIds.has(c.contractId)) || myClientNames.has(norm(c.clientName)));
    const mySubmissions = manager ? submissions : submissions.filter((s) => myClientNames.has(norm(s.clientName)));

    // ---- Numbers per tab
    const byTab: Partial<Record<TileTab, Tile[]>> = {};
    let fin: FinanceSnapshot | undefined;
    let overview: OverviewSnapshot | undefined;
    let mgmt: ManagementSnapshot | undefined;
    if (has("delivery")) byTab.delivery = deliveryTiles({ works: myWorks, contracts: myContracts, content: myContent, month, today, manager });
    if (has("sales")) byTab.sales = salesTiles({ leads, quotes, contracts, today });
    if (has("money")) {
        fin = buildFinanceSnapshot({ invoices, contracts }, today);
        byTab.money = moneyTiles({ fin, invoices, today });
    }
    if (has("team")) {
        overview = buildOverviewSnapshot({ team, contracts, works, invoices, leads, month }, today);
        mgmt = buildManagementSnapshot({ team, clients, contracts, works, sprintTasks, content, invoices, month }, today);
        byTab.team = teamTiles({ overview, mgmt, team, today });
    }
    if (has("clients")) byTab.clients = clientTiles({ clients: myClients, contracts: myContracts, allContracts: contracts, works: myWorks, submissions: mySubmissions, today });

    const live = tab === "all" ? attentionTiles(byTab, tabs) : [];
    // Hours are planned per month; the Month dropdown shows where a month changes the numbers.
    const showMonth = tab === "team" || (tab === "all" && live.some((g) => g.tab === "team"));
    const tabHref = (t: DashboardTab) => href({ tab: t, month: t === "team" || t === "all" ? month : undefined });
    const monthHref = (m: string) => href({ tab, month: m });

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                    <h1 className="text-2xl font-semibold sm:text-3xl">Dashboard</h1>
                    <p className="text-sm text-muted-foreground">{member && !manager ? `${member.name} · your numbers. Click one to fix it.` : "Numbers only. Click one to fix it."}</p>
                </div>
                <p className="text-xs text-muted-foreground">As of {today}</p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
                <DashboardTabs tabs={tabs} active={tab} hrefFor={tabHref} />
                {showMonth ? <MonthSelect selected={month} today={today} hrefFor={monthHref} /> : null}
            </div>

            {tab === "all" ? (
                <>
                    {live.length === 0 ? (
                        <p className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm">
                            <span aria-hidden="true" className={cn("inline-block size-2.5 rounded-full", HEALTH_DOT.green)} />
                            <span className="font-medium text-emerald-700 dark:text-emerald-400">All clear</span>
                            <span className="text-muted-foreground">— nothing overdue, over or waiting.</span>
                        </p>
                    ) : (
                        live.map((g) => (
                            <section key={g.tab} className="space-y-2">
                                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    <Link href={tabHref(g.tab)} className="hover:underline">
                                        {DASHBOARD_TAB_LABEL[g.tab]}
                                    </Link>
                                </h2>
                                <TileGrid tiles={g.tiles} />
                            </section>
                        ))
                    )}
                    {manager && overview ? (
                        <Section id="attention" title="Attention" description="Ranked. Your call unless an owner is named.">
                            <AttentionList items={overview.decisions} more={overview.moreDecisions} />
                        </Section>
                    ) : null}
                </>
            ) : tab === "activity" ? (
                <ActivityFeed events={events} params={activity} today={today} hrefFor={(next) => href({ tab, entity: next.entity ?? activity.entity, range: next.range ?? activity.range.key })} />
            ) : (
                <>
                    <TileGrid tiles={byTab[tab] ?? []} />
                    {tab === "money" && fin ? <MoneyDetail fin={fin} /> : null}
                    {tab === "team" && overview && mgmt ? <TeamDetail overview={overview} mgmt={mgmt} hrefForMonth={monthHref} /> : null}
                </>
            )}
        </div>
    );
}
