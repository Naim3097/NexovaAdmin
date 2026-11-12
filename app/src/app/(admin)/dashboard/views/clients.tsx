/**
 * Clients tab: the head of client relationships' view. Numbers first, then the
 * client health grid, revenue concentration, projects ending soon and the
 * clients table. The maths lives in @/lib/dashboard/clients; this only renders.
 */
import Link from "next/link";
import { BarList, HealthDot, type BarRow } from "@/components/bars";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DashboardData } from "@/lib/dashboard/data";
import {
    CLIENTS_PATH,
    CONCENTRATION_PCT,
    ENDING_LIST_DAYS,
    clientRelations,
    type ClientCard,
    type ClientRow,
    type EndingMonth,
} from "@/lib/dashboard/clients";
import { Chip, Empty, HEALTH_TEXT, Section, fmtMyr, plural } from "@/app/(admin)/management/ui";
import { cn } from "@/lib/utils";
import { TileGrid } from "./tile-grid";

export function ClientsView({ data }: { data: DashboardData }) {
    const rel = clientRelations({ clients: data.externalClients, contracts: data.external, works: data.works, invoices: data.invoices, today: data.today });
    const allClients = (
        <Link href={CLIENTS_PATH} className="text-xs underline">
            All clients
        </Link>
    );
    return (
        <>
            <TileGrid tiles={rel.tiles} />

            <Section
                id="health"
                title="Client health"
                description="Every active and paused client, worst first. One line says why: money owed, an approval stuck, a renewal nobody has raised, or too long since we spoke."
                action={allClients}
            >
                {rel.cards.length === 0 ? <Empty>No active clients to look after yet.</Empty> : <HealthGrid cards={rel.cards} />}
            </Section>

            <Section
                id="concentration"
                title="Revenue concentration"
                description={
                    rel.concentration.basis === "mrr"
                        ? `Each client's share of ${fmtMyr(rel.concentration.totalMyr)} a month in retainers. One client above ${CONCENTRATION_PCT}% is a risk worth spreading.`
                        : `Nobody bills monthly, so shares of ${fmtMyr(rel.concentration.totalMyr)} in active contracted value instead.`
                }
            >
                <BarList rows={shareRows(rel)} empty="No revenue on active projects yet." />
            </Section>

            <Section
                id="ending"
                title={`Ending within ${ENDING_LIST_DAYS} days`}
                description="Active projects with an end date in sight, by month. Set where the renewal stands on the client page; red means nobody has raised it."
                action={
                    <Link href="/projects" className="text-xs underline">
                        All projects
                    </Link>
                }
            >
                {rel.ending.length === 0 ? <Empty>No project ends in the next {ENDING_LIST_DAYS} days.</Empty> : <EndingList months={rel.ending} />}
            </Section>

            <Section
                id="clients"
                title="Clients"
                description={`${plural(rel.counts.active, "active client")}, ${rel.counts.paused} paused; ${rel.counts.prospects} prospects and ${rel.counts.churned} churned sit out. Sorted worst first, then by retainer.`}
                action={allClients}
            >
                {rel.rows.length === 0 ? <Empty>No active or paused clients.</Empty> : <ClientsTable rows={rel.rows} />}
            </Section>
        </>
    );
}

/** The bar rows for revenue concentration: amber and labelled when a client is over the line. */
function shareRows(rel: ReturnType<typeof clientRelations>): BarRow[] {
    return rel.concentration.rows.map((r) => ({
        key: r.key,
        label: r.name,
        value: r.valueMyr,
        valueLabel: `${fmtMyr(r.valueMyr)} · ${r.pct}%`,
        sub: r.over ? `over ${CONCENTRATION_PCT}% of revenue` : undefined,
        tone: r.over ? "amber" : "primary",
        href: r.href,
    }));
}

function HealthGrid({ cards }: { cards: ClientCard[] }) {
    return (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((c) => (
                <Link key={c.id} href={c.href} className={cn("block rounded-lg border p-3 transition-colors hover:bg-accent", c.status === "paused" && "opacity-70")}>
                    <div className="flex items-center gap-2">
                        <HealthDot tone={c.tone} title={c.reason} />
                        <span className="truncate text-sm font-medium">{c.name}</span>
                        {c.status === "paused" ? <Chip tone="neutral">paused</Chip> : null}
                    </div>
                    <p className={cn("mt-0.5 text-xs", c.status !== "paused" && c.health !== "green" ? HEALTH_TEXT[c.health] : "text-muted-foreground")}>{c.reason}</p>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <Fact label="MRR" value={c.mrrMyr ? fmtMyr(c.mrrMyr) : "—"} />
                        <Fact label="Projects" value={String(c.projects)} />
                        <Fact label="Account manager" value={c.accountManagers.join(", ") || "—"} />
                        <Fact label="Last check-in" value={c.lastCheckIn} />
                    </dl>
                </Link>
            ))}
        </div>
    );
}

function Fact({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="truncate font-medium tabular-nums">{value}</dd>
        </div>
    );
}

function EndingList({ months }: { months: EndingMonth[] }) {
    return (
        <div className="space-y-4">
            {months.map((m) => (
                <div key={m.month}>
                    <h3 className="mb-1 text-xs font-medium text-muted-foreground">{m.label}</h3>
                    <ul className="divide-y">
                        {m.rows.map((r) => (
                            <li key={r.id} className="grid gap-1 py-2.5 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <Link href={r.href} className="text-sm font-medium hover:underline">
                                            {r.name}
                                        </Link>
                                        <span className="text-xs text-muted-foreground">{r.code}</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        <Link href={r.clientHref} className="hover:underline">
                                            {r.clientName}
                                        </Link>
                                        {r.accountManager ? ` · AM ${r.accountManager}` : ""}
                                    </p>
                                </div>
                                <p className={cn("text-xs tabular-nums", r.daysLeft <= 30 ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
                                    ends {r.endDate} · {r.daysLeft}d
                                </p>
                                <p className="text-sm font-medium tabular-nums md:text-right">{r.amountLabel}</p>
                                <Chip tone={r.renewalTone}>{r.renewalLabel}</Chip>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
}

function ClientsTable({ rows }: { rows: ClientRow[] }) {
    return (
        <Table className="text-xs">
            <TableHeader>
                <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Deal owner</TableHead>
                    <TableHead>Account manager</TableHead>
                    <TableHead className="text-right">Projects</TableHead>
                    <TableHead className="text-right">MRR</TableHead>
                    <TableHead className="text-right">Approvals</TableHead>
                    <TableHead className="text-right">Overdue inv.</TableHead>
                    <TableHead>Last check-in</TableHead>
                    <TableHead>Renewal</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((r) => (
                    <TableRow key={r.id} className={cn(r.status === "paused" && "text-muted-foreground")}>
                        <TableCell>
                            <span className="inline-flex items-center gap-2">
                                <HealthDot tone={r.tone} title={r.reason} />
                                <Link href={r.href} className="font-medium hover:underline">
                                    {r.name}
                                </Link>
                            </span>
                        </TableCell>
                        <TableCell>{r.dealOwner || "—"}</TableCell>
                        <TableCell>{r.accountManagers.join(", ") || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.projects}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.mrrMyr ? fmtMyr(r.mrrMyr) : "—"}</TableCell>
                        <TableCell className={cn("text-right tabular-nums", r.approvalsWaiting && "font-medium text-amber-700 dark:text-amber-400")}>{r.approvalsWaiting || "—"}</TableCell>
                        <TableCell className={cn("text-right tabular-nums", r.overdueInvoices && "font-medium text-red-600 dark:text-red-400")}>{r.overdueInvoices || "—"}</TableCell>
                        <TableCell className="tabular-nums">{r.lastCheckIn}</TableCell>
                        <TableCell>{r.renewal ? <Chip tone={r.renewal.tone}>{r.renewal.label}</Chip> : "—"}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
