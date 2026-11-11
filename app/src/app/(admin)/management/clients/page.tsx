import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { redirect } from "next/navigation";
import { getAccessLevel, getActingMember, requireTeamAccess } from "@/lib/auth";
import { seesEverything } from "@/lib/scope";
import { listClients } from "@/lib/data/clients";
import { listContracts } from "@/lib/data/contracts";
import { listWorks } from "@/lib/data/works";
import { listCampaigns, listContentPosts, listInvoices, listQuotations } from "@/lib/data/reads";
import {
    buildClientsSnapshot,
    CARE_AMBER,
    CARE_GREEN,
    type BillingMatrix,
    type CareRow,
} from "@/lib/management/clients";
import { fmtMyrShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AsOf, Chip, Empty, HealthDot, HEALTH_TEXT, KpiTile, Section, fmtMyr, plural } from "../ui";

export const dynamic = "force-dynamic";

function monthLabel(ym: string): string {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-MY", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function CareCard({ c }: { c: CareRow }) {
    return (
        <div className="rounded-lg border bg-card p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <HealthDot health={c.health} />
                        <Link href={c.href} className="font-medium hover:underline">
                            {c.name}
                        </Link>
                        {c.packageName ? <Badge variant="secondary">{c.packageName}</Badge> : null}
                        <span className="text-xs text-muted-foreground">AM {c.accountManager || "—"}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                        {c.nextMilestone ? (
                            <>
                                Next milestone:{" "}
                                <Link href={c.nextMilestone.href} className="hover:underline">
                                    {c.nextMilestone.label}
                                </Link>
                                {c.nextMilestone.contract ? ` (${c.nextMilestone.contract})` : ""} due {c.nextMilestone.due}
                            </>
                        ) : (
                            "No dated milestone"
                        )}
                        {" · "}
                        {c.daysSinceDelivery === null ? "nothing delivered yet" : `last delivery ${c.daysSinceDelivery}d ago`}
                    </p>
                </div>
                <div className="text-right">
                    <p className={cn("text-2xl font-semibold tabular-nums leading-none", HEALTH_TEXT[c.health])}>{c.score}</p>
                    <p className="text-[10px] text-muted-foreground">care score</p>
                </div>
            </div>
            <ul className="mt-2 flex flex-wrap gap-1">
                {c.signals.map((s, i) => (
                    <li key={i}>
                        <Chip tone={s.tone} title={s.detail}>
                            {s.label}
                        </Chip>
                    </li>
                ))}
            </ul>
            <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                {c.signals
                    .filter((s) => s.tone !== "good")
                    .map((s, i) => (
                        <li key={i}>
                            <span className={cn("font-medium", s.tone === "bad" ? HEALTH_TEXT.red : HEALTH_TEXT.amber)}>
                                {s.label}:
                            </span>{" "}
                            {s.detail}
                        </li>
                    ))}
            </ul>
        </div>
    );
}

function BillingTable({ b, today }: { b: BillingMatrix; today: string }) {
    const month = today.slice(0, 7);
    if (b.rows.length === 0) return <Empty>No invoices yet.</Empty>;
    return (
        <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="min-w-40">Client</TableHead>
                        <TableHead className="text-right">Contract / mo</TableHead>
                        {b.months.map((m) => (
                            <TableHead key={m} className={cn("text-right", m === month && "text-foreground")}>
                                {monthLabel(m)}
                            </TableHead>
                        ))}
                        <TableHead className="text-right">Outstanding</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {b.rows.map((r) => (
                        <TableRow key={r.id}>
                            <TableCell>
                                <Link href={r.href} className="font-medium hover:underline">
                                    {r.name}
                                </Link>
                                {r.status !== "active" ? (
                                    <span className="ml-1 text-xs text-muted-foreground">({r.status})</span>
                                ) : null}
                                {r.missingMonths.length > 0 ? (
                                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                                        not invoiced: {r.missingMonths.map(monthLabel).join(", ")}
                                    </p>
                                ) : null}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                                {r.contractMyr ? fmtMyr(r.contractMyr) : "—"}
                            </TableCell>
                            {r.cells.map((cell) => {
                                const missing = r.contractMyr > 0 && cell.count === 0 && cell.month < month;
                                const tone = cell.count === 0
                                    ? missing
                                        ? "text-amber-700 dark:text-amber-400"
                                        : "text-muted-foreground/60"
                                    : cell.overdue
                                      ? "font-medium text-red-600 dark:text-red-400"
                                      : cell.outstandingMyr > 0
                                        ? "text-amber-700 dark:text-amber-400"
                                        : "text-emerald-700 dark:text-emerald-400";
                                const title = cell.count === 0
                                    ? missing
                                        ? "Contracted but not invoiced"
                                        : "No invoice"
                                    : `${plural(cell.count, "invoice")} · ${fmtMyr(cell.paidMyr)} paid · ${fmtMyr(cell.outstandingMyr)} open${cell.overdue ? " · OVERDUE" : ""}`;
                                return (
                                    <TableCell key={cell.month} className={cn("text-right tabular-nums", tone)} title={title}>
                                        {cell.count === 0 ? (missing ? "missing" : "—") : fmtMyr(cell.invoicedMyr)}
                                        {cell.count > 0 && cell.outstandingMyr > 0 ? (
                                            <span className="block text-[10px] font-normal">
                                                {cell.overdue ? "overdue" : "unpaid"} {fmtMyr(cell.outstandingMyr)}
                                            </span>
                                        ) : null}
                                    </TableCell>
                                );
                            })}
                            <TableCell
                                className={cn(
                                    "text-right tabular-nums",
                                    r.outstanding > 0 ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground",
                                )}
                            >
                                {r.outstanding ? fmtMyr(r.outstanding) : "—"}
                            </TableCell>
                        </TableRow>
                    ))}
                    <TableRow className="bg-muted/40 font-medium">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMyr(b.contractedPerMonth)}</TableCell>
                        {b.monthTotals.map((t) => (
                            <TableCell key={t.month} className="text-right tabular-nums" title={`${fmtMyr(t.paidMyr)} paid`}>
                                {t.invoicedMyr ? fmtMyr(t.invoicedMyr) : "—"}
                            </TableCell>
                        ))}
                        <TableCell className="text-right tabular-nums">
                            {fmtMyr(b.rows.reduce((s, r) => s + r.outstanding, 0))}
                        </TableCell>
                    </TableRow>
                </TableBody>
            </Table>
            <p className="mt-2 text-[11px] text-muted-foreground">
                Cell = invoiced in that month (by issue date). Green paid in full · amber part unpaid · red overdue ·
                &ldquo;missing&rdquo; = contracted retainer with no invoice that month.
            </p>
        </div>
    );
}

export default async function ManagementClientsPage() {
    await requireTeamAccess();
    // Managers only (or nobody picked under the dev bypass).
    if (!seesEverything(await getActingMember())) redirect("/home");
    const [clients, contracts, works, content, invoices, campaigns, quotations, access] = await Promise.all([
        listClients(),
        listContracts(),
        listWorks(),
        listContentPosts(),
        listInvoices(),
        listCampaigns(),
        listQuotations(),
        getAccessLevel(),
    ]);
    const isAdmin = access === "admin";
    const snap = buildClientsSnapshot({ clients, contracts, works, content, invoices, campaigns, quotations });
    const k = snap.kpis;

    const kpis: Array<React.ComponentProps<typeof KpiTile>> = [
        { label: "Active clients", value: String(k.activeClients), href: "#roster" },
        { label: "Active MRR", value: fmtMyrShort(k.activeMrr), hint: "retainers + campaign fees", href: "#billing" },
        {
            label: "Avg care score",
            value: k.avgCare === null ? "n/a" : String(k.avgCare),
            hint: `${CARE_GREEN}+ good · <${CARE_AMBER} at risk`,
            href: "#care",
            tone: k.avgCare === null ? "neutral" : k.avgCare >= CARE_GREEN ? "good" : k.avgCare >= CARE_AMBER ? "warn" : "bad",
        },
        {
            label: "Accounts needing care",
            value: String(k.needCare),
            hint: "score below good",
            href: "#care",
            tone: k.needCare > 0 ? "warn" : "good",
        },
        {
            label: "Paused / churned",
            value: `${k.pausedClients} / ${k.churnedClients}`,
            hint: `${plural(k.prospects, "prospect")} not yet signed`,
            href: "#inactive",
        },
        ...(isAdmin
            ? [
                  { label: "Invoiced this year", value: fmtMyrShort(k.invoicedYtd), href: "#billing" },
                  {
                      label: "Outstanding",
                      value: fmtMyrShort(k.outstanding),
                      hint: "sent + overdue",
                      href: "/invoices",
                      tone: (k.outstanding > 0 ? "warn" : "good") as "warn" | "good",
                  },
              ]
            : []),
    ];

    return (
        <div className="space-y-6">
            <AsOf today={snap.today}>
                Who we serve, how well each account is looked after, and what was contracted versus invoiced.
            </AsOf>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {kpis.map((t) => (
                    <KpiTile key={t.label} {...t} />
                ))}
            </div>

            <Section
                id="care"
                title="Client care tracker"
                description="Care score per active account: 100 minus points for anything the client would feel. Lowest first — these are the calls to make this week."
            >
                {snap.care.length === 0 ? (
                    <Empty>No active clients.</Empty>
                ) : (
                    <div className="grid gap-3 lg:grid-cols-2">
                        {snap.care.map((c) => (
                            <CareCard key={c.id} c={c} />
                        ))}
                    </div>
                )}
            </Section>

            <Section id="roster" title="Active clients" description="Everyone we are servicing right now.">
                {snap.roster.length === 0 ? (
                    <Empty>No active clients.</Empty>
                ) : (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Client</TableHead>
                                    <TableHead>Package</TableHead>
                                    <TableHead className="text-right">MRR</TableHead>
                                    <TableHead>AM</TableHead>
                                    <TableHead>Since</TableHead>
                                    <TableHead>Renews</TableHead>
                                    <TableHead className="text-right">Contracts</TableHead>
                                    <TableHead className="text-right">Open tasks</TableHead>
                                    <TableHead className="text-right">Campaigns</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {snap.roster.map((r) => (
                                    <TableRow key={r.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <HealthDot health={r.health} />
                                                <Link href={r.href} className="font-medium hover:underline">
                                                    {r.name}
                                                </Link>
                                            </div>
                                            {r.industry ? <p className="text-xs text-muted-foreground">{r.industry}</p> : null}
                                        </TableCell>
                                        <TableCell>{r.packageName || "—"}</TableCell>
                                        <TableCell className="text-right tabular-nums">{r.mrr ? fmtMyr(r.mrr) : "—"}</TableCell>
                                        <TableCell>{r.accountManager || "—"}</TableCell>
                                        <TableCell className="tabular-nums">{r.since}</TableCell>
                                        <TableCell className="tabular-nums">{r.renewsOn || "—"}</TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {r.activeContracts} active
                                            {r.completedContracts ? ` · ${r.completedContracts} completed` : ""}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {r.openTasks ? (
                                                <Link href={`/works?client=${encodeURIComponent(r.name)}`} className="hover:underline">
                                                    {r.openTasks}
                                                </Link>
                                            ) : (
                                                "—"
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">{r.liveCampaigns || "—"}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </Section>

            <Section
                id="inactive"
                title="Previous & inactive clients"
                description="Paused and churned accounts — the history that is worth a win-back call."
            >
                {snap.inactive.length === 0 ? (
                    <Empty>No inactive clients.</Empty>
                ) : (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Client</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>AM</TableHead>
                                    <TableHead>Since</TableHead>
                                    <TableHead>Last contract</TableHead>
                                    <TableHead>Last invoice</TableHead>
                                    {isAdmin ? <TableHead className="text-right">Lifetime billed</TableHead> : null}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {snap.inactive.map((r) => (
                                    <TableRow key={r.id}>
                                        <TableCell>
                                            <Link href={r.href} className="font-medium hover:underline">
                                                {r.name}
                                            </Link>
                                            {r.industry ? <p className="text-xs text-muted-foreground">{r.industry}</p> : null}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{r.status}</Badge>
                                        </TableCell>
                                        <TableCell>{r.accountManager || "—"}</TableCell>
                                        <TableCell className="tabular-nums">{r.since}</TableCell>
                                        <TableCell>
                                            {r.lastContract || "—"}
                                            {r.lastContractAt ? <span className="text-xs text-muted-foreground"> · {r.lastContractAt}</span> : null}
                                        </TableCell>
                                        <TableCell className="tabular-nums">{r.lastInvoiceAt || "—"}</TableCell>
                                        {isAdmin ? (
                                            <TableCell className="text-right tabular-nums">{fmtMyr(r.lifetimeBilled)}</TableCell>
                                        ) : null}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </Section>

            {isAdmin ? (
                <>
                    <Section
                        id="billing"
                        title="Contracts & invoices by month"
                        description={`Per client, the contracted monthly amount against what was actually invoiced and paid, last ${snap.billing.months.length} months.`}
                    >
                        <BillingTable b={snap.billing} today={snap.today} />
                    </Section>

                    <Section
                        id="contracts"
                        title="Signed contracts"
                        description="Accepted and converted quotations — the scope each client agreed to."
                    >
                        {snap.contracts.length === 0 ? (
                            <Empty>No accepted quotations yet.</Empty>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Client</TableHead>
                                            <TableHead>Quote</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Accepted</TableHead>
                                            <TableHead className="text-right">Value</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {snap.contracts.map((q) => (
                                            <TableRow key={q.id}>
                                                <TableCell className="font-medium">{q.clientName}</TableCell>
                                                <TableCell>
                                                    <Link href={q.href} className="hover:underline">
                                                        {q.number}
                                                    </Link>
                                                    {q.subject ? <span className="text-muted-foreground"> · {q.subject}</span> : null}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">{q.status}</Badge>
                                                </TableCell>
                                                <TableCell className="tabular-nums">{q.acceptedAt || q.issueDate}</TableCell>
                                                <TableCell className="text-right tabular-nums">{fmtMyr(q.totalMyr)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </Section>
                </>
            ) : null}
        </div>
    );
}
