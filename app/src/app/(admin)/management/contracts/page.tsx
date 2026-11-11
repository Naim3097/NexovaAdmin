import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { redirect } from "next/navigation";
import { getActingMember, requireTeamAccess } from "@/lib/auth";
import { seesEverything } from "@/lib/scope";
import { listClients } from "@/lib/data/clients";
import { listContracts } from "@/lib/data/contracts";
import { listWorks } from "@/lib/data/works";
import { listCampaigns, listContentPosts, listInvoices } from "@/lib/data/reads";
import {
    buildContractsSnapshot,
    type ClientJobRow,
    type ContractIssue,
    type ContractRow,
    type PaymentRow,
    type UnlinkedWork,
} from "@/lib/management/contracts";
import { CONTRACT_ENDING_SOON_DAYS } from "@/lib/contracts/helpers";
import { JobBadge } from "@/app/(admin)/contracts/ui";
import { fmtMyrShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AsOf, Chip, Empty, HealthDot, KpiTile, Section, fmtMyr, plural } from "../ui";

export const dynamic = "force-dynamic";

function ClientRows({ rows }: { rows: ClientJobRow[] }) {
    if (rows.length === 0) return <Empty>No clients on the books.</Empty>;
    return (
        <ul className="divide-y">
            {rows.map((c) => (
                <li key={c.id} className="flex flex-col gap-1 py-2.5 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Link href={c.href} className="text-sm font-medium hover:underline">
                                {c.name}
                            </Link>
                            <Badge variant="outline">{c.status}</Badge>
                            <JobBadge job={c.job} />
                            {c.unlinkedWork > 0 ? (
                                <Chip tone="warn" title="Live work not under any contract">
                                    {plural(c.unlinkedWork, "item")} without a contract
                                </Chip>
                            ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {c.accountManager ? `AM ${c.accountManager} · ` : ""}
                            {c.job.all.length === 0
                                ? "no contract on file"
                                : c.job.all.map((x) => `${x.code} ${x.name} (${x.status})`).join(" · ")}
                        </p>
                    </div>
                    <Link href={`/contracts/new?client=${encodeURIComponent(c.name)}`} className="text-xs underline">
                        {c.activeContracts === 0 ? "+ create contract" : "+ add contract"}
                    </Link>
                </li>
            ))}
        </ul>
    );
}

function ContractRows({ rows }: { rows: ContractRow[] }) {
    if (rows.length === 0) return <Empty>No contracts yet.</Empty>;
    return (
        <ul className="divide-y">
            {rows.map((r) => (
                <li key={r.id} className="grid gap-1 py-2.5 md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)] md:items-center">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <HealthDot health={r.health} />
                            <Link href={r.href} className="text-sm font-medium hover:underline">
                                {r.name}
                            </Link>
                            <span className="text-xs text-muted-foreground">{r.code}</span>
                            <Badge variant={r.status === "active" ? "default" : "outline"}>{r.status}</Badge>
                            {!r.signed && r.status === "active" ? <Chip tone="bad">unsigned</Chip> : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {r.clientName}
                            {r.accountManager ? ` · AM ${r.accountManager}` : ""} · {r.startDate}
                            {r.endDate ? ` → ${r.endDate}` : " → rolling"}
                            {r.amountMyr ? ` · ${fmtMyr(r.amountMyr)}/${r.cadence === "monthly" ? "mo" : r.cadence.replace(/_/g, " ")}` : ""}
                            {r.valueMyr ? ` · value ${fmtMyr(r.valueMyr)}` : ""}
                        </p>
                        <p className={cn("text-xs", r.health === "red" ? "text-red-600 dark:text-red-400" : r.health === "amber" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
                            {r.note}
                        </p>
                    </div>
                    <p className="text-xs text-muted-foreground tabular-nums">
                        <Link href={`${r.href}#works`} className="hover:underline">
                            {plural(r.work.tasks, "task")}
                        </Link>{" "}
                        ({r.work.tasksDone} done
                        {r.work.overdueTasks ? (
                            <span className="font-medium text-red-600 dark:text-red-400">, {r.work.overdueTasks} overdue</span>
                        ) : null}
                        ) · {r.work.content} content ({r.work.openContent} open) · {plural(r.work.campaigns, "campaign")} ({r.work.liveCampaigns} live)
                    </p>
                    <p className="text-xs tabular-nums md:text-right">
                        invoiced {fmtMyr(r.invoicedMyr)} · paid {fmtMyr(r.paidMyr)}
                        {r.outstandingMyr > 0 ? (
                            <span className={r.overdueInvoices > 0 ? "font-medium text-red-600 dark:text-red-400" : ""}>
                                {" "}
                                · owed {fmtMyr(r.outstandingMyr)}
                                {r.overdueInvoices > 0 ? ` (${r.overdueInvoices} overdue)` : ""}
                            </span>
                        ) : null}
                    </p>
                </li>
            ))}
        </ul>
    );
}

function IssueRows({ rows }: { rows: ContractIssue[] }) {
    if (rows.length === 0) return <Empty>Every active contract is signed, invoiced and inside its term.</Empty>;
    const KIND: Record<ContractIssue["kind"], string> = {
        no_terms: "No terms",
        unsigned: "Unsigned",
        ended: "Ended",
        ending: "Ending soon",
        no_invoice: "Not invoiced",
    };
    return (
        <ul className="divide-y">
            {rows.map((x, i) => (
                <li key={i} className="flex flex-col gap-1 py-2.5 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Chip tone={x.severity === "red" ? "bad" : "warn"}>{KIND[x.kind]}</Chip>
                            <Link href={x.href} className="text-sm font-medium hover:underline">
                                {x.name}
                            </Link>
                            <span className="text-xs text-muted-foreground">{x.code}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {x.clientName}
                            {x.accountManager ? ` · AM ${x.accountManager}` : ""} · {x.detail}
                        </p>
                    </div>
                </li>
            ))}
        </ul>
    );
}

function UnlinkedRows({ rows }: { rows: UnlinkedWork[] }) {
    if (rows.length === 0) return <Empty>All live work on serviced clients sits under a contract.</Empty>;
    return (
        <ul className="divide-y">
            {rows.map((u, i) => (
                <li key={i} className="flex flex-col gap-1 py-2 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Badge variant="secondary">{u.kind}</Badge>
                            <Link href={u.href} className="text-sm font-medium hover:underline">
                                {u.title}
                            </Link>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {u.clientName} · {u.detail}
                        </p>
                    </div>
                    <Link href={`/contracts?client=${encodeURIComponent(u.clientName)}`} className="text-xs underline">
                        open client&apos;s contracts
                    </Link>
                </li>
            ))}
        </ul>
    );
}

function PaymentRows({ rows }: { rows: PaymentRow[] }) {
    if (rows.length === 0) return <Empty>Nothing outstanding — every sent invoice is paid.</Empty>;
    return (
        <ul className="divide-y">
            {rows.map((p) => (
                <li key={p.invoiceId} className="grid gap-1 py-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-center">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Link href={p.href} className="text-sm font-medium hover:underline">
                                {p.number}
                            </Link>
                            <span className="text-xs text-muted-foreground">{p.clientName}</span>
                            {p.contractId ? (
                                <Link href={`/contracts/${p.contractId}`} className="text-xs text-muted-foreground underline">
                                    {p.contract}
                                </Link>
                            ) : (
                                <Chip tone="warn">no contract</Chip>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            issued {p.issueDate} · due {p.dueDate}
                        </p>
                    </div>
                    <p className="text-sm font-medium tabular-nums">{fmtMyr(p.totalMyr)}</p>
                    <p className={cn("text-xs md:text-right", p.daysOverdue > 0 ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                        {p.daysOverdue > 0 ? `${p.daysOverdue}d overdue` : "awaiting payment"}
                    </p>
                </li>
            ))}
        </ul>
    );
}

export default async function ManagementContractsPage() {
    await requireTeamAccess();
    // Managers only (or nobody picked under the dev bypass).
    if (!seesEverything(await getActingMember())) redirect("/home");
    const [contracts, clients, invoices, works, content, campaigns] = await Promise.all([
        listContracts(),
        listClients(),
        listInvoices(),
        listWorks(),
        listContentPosts(),
        listCampaigns(),
    ]);
    const snap = buildContractsSnapshot({ contracts, clients, invoices, works, content, campaigns });
    const k = snap.kpis;

    const kpis: Array<React.ComponentProps<typeof KpiTile>> = [
        {
            label: "Clients with a job",
            value: `${k.clientsWithJob} / ${k.clientsWithJob + k.clientsWithoutJob}`,
            hint: `${plural(k.activeContracts, "active contract")}`,
            href: "#clients",
            tone: k.clientsWithoutJob > 0 ? "warn" : "good",
        },
        {
            label: "Contracted / month",
            value: fmtMyrShort(k.contractedMonthlyMyr),
            hint: "monthly retainers on active contracts",
            href: "#contracts",
        },
        {
            label: "Unsigned",
            value: String(k.unsigned),
            hint: "active, no signed copy",
            href: "#issues",
            tone: k.unsigned > 0 ? "bad" : "good",
        },
        {
            label: "Ended / ending",
            value: `${k.ended} / ${k.endingSoon}`,
            hint: `past end date / ends ≤ ${CONTRACT_ENDING_SOON_DAYS}d`,
            href: "#issues",
            tone: k.ended > 0 ? "bad" : k.endingSoon > 0 ? "warn" : "neutral",
        },
        {
            label: "Months not invoiced",
            value: String(k.missingInvoices),
            hint: "monthly contracts, past or current month",
            href: "#issues",
            tone: k.missingInvoices > 0 ? "bad" : "good",
        },
        {
            label: "Work with no contract",
            value: String(k.unlinkedWork),
            hint: "live content / campaigns",
            href: "#unlinked",
            tone: k.unlinkedWork > 0 ? "warn" : "good",
        },
        {
            label: "Pending payments",
            value: fmtMyrShort(k.pendingPaymentsMyr),
            hint: `${plural(snap.payments.length, "invoice")} sent, unpaid`,
            href: "#payments",
            tone: k.overduePaymentsCount > 0 ? "warn" : "neutral",
        },
        {
            label: "Overdue payments",
            value: fmtMyrShort(k.overduePaymentsMyr),
            hint: `${plural(k.overduePaymentsCount, "invoice")} past due`,
            href: "#payments",
            tone: k.overduePaymentsCount > 0 ? "bad" : "good",
        },
    ];

    return (
        <div className="space-y-6">
            <AsOf today={snap.today}>
                Do we have a job with each client, is the contract in order, is the work under it, and has the money
                arrived.
            </AsOf>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {kpis.map((t) => (
                    <KpiTile key={t.label} {...t} />
                ))}
            </div>

            <Section
                id="clients"
                title="Do we have a job with them?"
                description="Every client we service, with the contract that says so. No contract means nothing is promised — or the paperwork never caught up with the work."
                action={
                    <Link href="/contracts" className="text-xs underline">
                        All contracts
                    </Link>
                }
            >
                <ClientRows rows={snap.clients} />
            </Section>

            <Section
                id="issues"
                title="Attention"
                description="Unsigned while work is running, past their end date, ending soon, or missing a month's invoice."
            >
                <IssueRows rows={snap.issues} />
            </Section>

            <Section
                id="unlinked"
                title="Work with no contract"
                description="Live content and campaigns on serviced clients that don't sit under any contract. Link them from the contract page, or create the contract."
            >
                <UnlinkedRows rows={snap.unlinked} />
            </Section>

            <Section
                id="contracts"
                title="Every contract"
                description="Worst first. Note says what is wrong, or that it is in order; the tasks and money columns say what runs under it and what has been paid."
            >
                <ContractRows rows={snap.contracts} />
            </Section>

            <Section
                id="payments"
                title="Pending payments"
                description="Every invoice that has been sent and not paid, most overdue first, with the contract it bills."
            >
                <PaymentRows rows={snap.payments} />
            </Section>
        </div>
    );
}
