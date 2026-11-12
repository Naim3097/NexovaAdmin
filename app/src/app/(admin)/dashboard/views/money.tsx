/**
 * Money tab: the head of P&L's view. Numbers first, then contracted against
 * billed and collected as one line chart, margin by project (revenue less
 * people and other costs), receivables ageing and the per-client table. Every
 * figure comes from buildMoneySnapshot; this file only lays it out. Under All
 * time the chart starts at the first project or invoice and "to date" means
 * today. Server component.
 */
import Link from "next/link";
import { BarList, Legend, type Series } from "@/components/bars";
import { LineChart } from "@/components/line-chart";
import type { DashboardData } from "@/lib/dashboard/data";
import { buildMoneySnapshot, CHART_AHEAD, DUE_WINDOW_DAYS, MARGIN_GOOD_PCT, MARGIN_WATCH_PCT, type MoneySnapshot } from "@/lib/dashboard/money";
import { fmtMyrShort, fmtMyrWhole } from "@/lib/format";
import { Chip, Empty, HealthDot, Section, plural, shortMonthLabel } from "@/app/(admin)/management/ui";
import { cn } from "@/lib/utils";
import { TileGrid } from "./tile-grid";

const SERIES: Series[] = [
    { key: "contracted", label: "Contracted", tone: "muted" },
    { key: "billed", label: "Billed", tone: "primary" },
    { key: "collected", label: "Collected", tone: "green" },
];

const TH = "py-1.5 pr-3 font-medium";
const TD = "py-2 pr-3";
const NUM = "text-right tabular-nums";
const RED = "text-red-600 dark:text-red-400";
const FINANCES = (
    <Link href="/invoices" className="text-xs underline">
        Finances
    </Link>
);

export function MoneyView({ data }: { data: DashboardData }) {
    const m = buildMoneySnapshot({
        invoices: data.invoices,
        contracts: data.external,
        clients: data.externalClients,
        works: data.works,
        team: data.team,
        today: data.today,
        month: data.month,
        current: data.current,
    });
    return (
        <>
            <TileGrid tiles={m.tiles} />
            <Contracted m={m} data={data} />
            <Margin m={m} />
            <div className="grid gap-4 lg:grid-cols-3">
                <Ageing m={m} />
                <div className="lg:col-span-2">
                    <Clients m={m} />
                </div>
            </div>
        </>
    );
}

/** "Dec 2026", or "today" under All time: what "to date" runs through. */
function throughLabel(m: MoneySnapshot): string {
    return m.allTime ? "today" : shortMonthLabel(m.through);
}

/** Contracted vs billed vs collected: three lines, the contract running on (dashed) into the months ahead. */
function Contracted({ m, data }: { m: MoneySnapshot; data: DashboardData }) {
    const { points, notBilledMyr, backlogMyr, horizon, openEnded } = m.chart;
    const any = points.some((p) => p.values.contracted || p.values.billed || p.values.collected);
    const span = m.allTime
        ? `From the first month with a project or an invoice to ${CHART_AHEAD} months ahead.`
        : `Six months to ${shortMonthLabel(m.through)} and ${CHART_AHEAD} after.`;
    return (
        <Section
            title="Contracted vs billed vs collected"
            description={`What the projects say we should bill each month, against what went out and what came in. ${span} Before SST, so the lines meet the contract values; months ahead show the contract only, dashed. Click a month to read the page on it.`}
            action={FINANCES}
        >
            {any ? (
                <>
                    <LineChart
                        points={points.map((p) => ({ key: p.month, label: p.label, values: p.values, future: p.future, href: data.href({ month: p.month }) }))}
                        series={SERIES}
                        format={fmtMyrShort}
                        height={200}
                        label="Contracted, billed and collected per month"
                    />
                    <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-t pt-3">
                        <Legend series={SERIES} />
                        <dl className="flex gap-6 text-sm">
                            <div>
                                <dt className="text-xs text-muted-foreground">Not yet billed</dt>
                                <dd className={cn("font-semibold tabular-nums", notBilledMyr > 0 && "text-amber-700 dark:text-amber-400")} title={`Contracted through ${throughLabel(m)} that no invoice covers yet`}>
                                    {fmtMyrShort(notBilledMyr)}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs text-muted-foreground">Backlog · to {shortMonthLabel(horizon)}</dt>
                                <dd
                                    className="font-semibold tabular-nums"
                                    title={openEnded ? `${plural(openEnded, "open-ended retainer")} counted to ${shortMonthLabel(horizon)}` : `Contracted after ${throughLabel(m)}, to the end of each active project`}
                                >
                                    {fmtMyrShort(backlogMyr)}
                                </dd>
                            </div>
                        </dl>
                    </div>
                </>
            ) : (
                <Empty>No projects or invoices in this window yet.</Empty>
            )}
        </Section>
    );
}

/** Unpaid invoices by how late they are today. */
function Ageing({ m }: { m: MoneySnapshot }) {
    const { buckets, totalMyr, count } = m.ageing;
    return (
        <Section title="Receivables ageing" description={count ? `${fmtMyrShort(totalMyr)} unpaid across ${plural(count, "invoice")}, by days past due today.` : "Unpaid invoices by days past due."} action={FINANCES}>
            {count ? (
                <BarList
                    rows={buckets.map((b) => ({
                        key: b.key,
                        label: b.label,
                        value: b.myr,
                        valueLabel: fmtMyrWhole(b.myr),
                        sub: b.count ? plural(b.count, "invoice") : "",
                        tone: b.count ? b.tone : "muted",
                        href: "/invoices",
                    }))}
                />
            ) : (
                <Empty>Nothing is unpaid.</Empty>
            )}
            <p className="mt-3 text-[11px] text-muted-foreground">Days late are counted at today; the Due in {DUE_WINDOW_DAYS} days tile is the not-yet-due part falling due soonest. Amounts include SST.</p>
        </Section>
    );
}

/** Revenue to date less the people cost of the planned hours and the project's other costs, per project. */
function Margin({ m }: { m: MoneySnapshot }) {
    const { rows, unrated } = m.margin;
    const through = throughLabel(m);
    return (
        <Section
            title="Margin by project"
            description={`Billed to date (before SST), less people cost and other costs, through ${through}. ${m.allTime ? "Running and finished projects" : "Running projects"}; thinnest margin first.`}
            action={
                <Link href="/projects" className="text-xs underline">
                    Projects
                </Link>
            }
        >
            {rows.length === 0 ? (
                <Empty>{m.allTime ? "No signed projects with a real client yet." : "No running projects with a real client."}</Empty>
            ) : (
                <div className="-mx-2 overflow-x-auto px-2">
                    <table className="w-full min-w-[640px] text-sm">
                        <thead>
                            <tr className="border-b text-left text-xs text-muted-foreground">
                                <th className={TH}>Project</th>
                                <th className={cn(TH, NUM)}>Revenue</th>
                                <th className={cn(TH, NUM)} title="Planned hours × each person's cost rate">
                                    People
                                </th>
                                <th className={cn(TH, NUM)} title="Ad spend, freelancers, software and other costs on the project">
                                    Other costs
                                </th>
                                <th className={cn(TH, NUM)}>Margin</th>
                                <th className={cn(TH, NUM)}>%</th>
                                <th className="w-6 py-1.5" aria-label="Health" />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.id} className="border-b last:border-0">
                                    <td className={TD}>
                                        <Link href={r.href} className="font-medium hover:underline">
                                            {r.name}
                                        </Link>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {r.code} · {r.clientName} · {r.hours}h planned
                                        </p>
                                    </td>
                                    <td className={cn(TD, NUM)}>
                                        {fmtMyrWhole(r.revenueMyr)}
                                        {r.estimated ? (
                                            <>
                                                {" "}
                                                <Chip tone="neutral" title="Nothing billed yet: the contracted amount to date">
                                                    est.
                                                </Chip>
                                            </>
                                        ) : null}
                                    </td>
                                    <td className={cn(TD, NUM)}>{fmtMyrWhole(r.peopleMyr)}</td>
                                    <td className={cn(TD, NUM)}>
                                        <Link href={r.href} className={cn("hover:underline", !r.otherMyr && "text-muted-foreground")} title="Add or check costs on the project's Contract tab">
                                            {r.otherMyr ? fmtMyrWhole(r.otherMyr) : "—"}
                                        </Link>
                                    </td>
                                    <td className={cn(TD, NUM, r.marginMyr < 0 && RED)}>{fmtMyrWhole(r.marginMyr)}</td>
                                    <td className={cn(TD, NUM, r.health === "red" && RED)}>{r.marginPct === null ? "—" : `${r.marginPct}%`}</td>
                                    <td className="py-2 text-right">
                                        <HealthDot health={r.health} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <p className="mt-3 text-[11px] text-muted-foreground">
                People cost = planned hours × cost rate (set by admin on each{" "}
                <Link href="/team" className="underline">
                    team member&rsquo;s page
                </Link>
                ). Other costs are added on the{" "}
                <Link href="/projects" className="underline">
                    project&rsquo;s
                </Link>{" "}
                Contract tab. Green from {MARGIN_GOOD_PCT}%, amber from {MARGIN_WATCH_PCT}%.
                {unrated.length ? (
                    <>
                        {" "}
                        Hours by {unrated.join(", ")} count as RM 0:{" "}
                        <Link href="/team" className="underline">
                            no cost rate set
                        </Link>
                        .
                    </>
                ) : null}
            </p>
        </Section>
    );
}

/** Every real client with money moving in the period or still owed, most owed first. */
function Clients({ m }: { m: MoneySnapshot }) {
    const rows = m.clients;
    const year = m.through.slice(0, 4);
    return (
        <Section
            title="By client"
            description={
                m.allTime
                    ? "Billed to date (before SST), what is still owed, what is past due and the monthly retainer. Most owed first."
                    : `Billed in ${year} to date (before SST), what is still owed, what is past due and the monthly retainer. Most owed first.`
            }
            action={
                <Link href="/settings/clients" className="text-xs underline">
                    Clients
                </Link>
            }
        >
            {rows.length === 0 ? (
                <Empty>{m.allTime ? "No client has billing or money outstanding." : "No client has billing this year or money outstanding."}</Empty>
            ) : (
                <div className="-mx-2 overflow-x-auto px-2">
                    <table className="w-full min-w-[480px] text-sm">
                        <thead>
                            <tr className="border-b text-left text-xs text-muted-foreground">
                                <th className={TH}>Client</th>
                                <th className={cn(TH, NUM)}>{m.allTime ? "Billed" : "Billed YTD"}</th>
                                <th className={cn(TH, NUM)}>Outstanding</th>
                                <th className={cn(TH, NUM)}>Overdue</th>
                                <th className={cn("py-1.5 font-medium", NUM)}>MRR</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.id} className="border-b last:border-0">
                                    <td className={TD}>
                                        <Link href={r.href} className="font-medium hover:underline">
                                            {r.name}
                                        </Link>
                                    </td>
                                    <td className={cn(TD, NUM)}>{fmtMyrWhole(r.billedMyr)}</td>
                                    <td className={cn(TD, NUM)}>{fmtMyrWhole(r.outstandingMyr)}</td>
                                    <td className={cn(TD, NUM, r.overdueMyr > 0 ? RED : "text-muted-foreground")}>{r.overdueMyr > 0 ? fmtMyrWhole(r.overdueMyr) : "—"}</td>
                                    <td className={cn("py-2", NUM, !r.mrrMyr && "text-muted-foreground")}>{r.mrrMyr ? fmtMyrWhole(r.mrrMyr) : "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Section>
    );
}
