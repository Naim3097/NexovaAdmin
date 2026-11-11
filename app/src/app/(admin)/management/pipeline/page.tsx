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
import { getActingMember, requireTeamAccess } from "@/lib/auth";
import { seesEverything } from "@/lib/scope";
import { listClients } from "@/lib/data/clients";
import { listContracts } from "@/lib/data/contracts";
import { listWorks } from "@/lib/data/works";
import {
    listCampaigns,
    listContentPosts,
    listInvoices,
    listLeads,
    listQuotations,
} from "@/lib/data/reads";
import {
    buildPipelineSnapshot,
    RENEWAL_WINDOW_DAYS,
    STALE_LEAD_DAYS,
    type CloseableRow,
    type RetentionRow,
} from "@/lib/management/pipeline";
import { fmtMyrShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AsOf, Chip, Empty, HealthDot, HEALTH_TEXT, KpiTile, Section, fmtMyr, plural } from "../ui";

export const dynamic = "force-dynamic";

function CloseableTable({ rows }: { rows: CloseableRow[] }) {
    if (rows.length === 0) {
        return <Empty>Nothing at proposal stage and no quotes out. Push qualified leads forward or send a quote.</Empty>;
    }
    return (
        <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Opportunity</TableHead>
                        <TableHead>Stage</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Timing</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((r) => (
                        <TableRow key={`${r.kind}-${r.id}`}>
                            <TableCell>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <Badge variant={r.kind === "quote" ? "default" : "secondary"}>
                                        {r.kind === "quote" ? "Quote" : "Lead"}
                                    </Badge>
                                    <Link href={r.href} className="font-medium hover:underline">
                                        {r.title}
                                    </Link>
                                </div>
                            </TableCell>
                            <TableCell className="capitalize">{r.stage}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.valueMyr ? fmtMyr(r.valueMyr) : "—"}</TableCell>
                            <TableCell>{r.owner || <span className="text-muted-foreground">no owner</span>}</TableCell>
                            <TableCell>
                                <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                                    {r.kind === "quote" ? (
                                        <span>
                                            {r.expiresInDays !== null && r.expiresInDays < 0
                                                ? `expired ${-r.expiresInDays}d ago`
                                                : `valid ${r.expiresInDays}d more`}
                                        </span>
                                    ) : (
                                        <span>touched {r.ageDays}d ago</span>
                                    )}
                                    {r.flag === "stale" ? <Chip tone="warn">going cold</Chip> : null}
                                    {r.flag === "expiring" ? <Chip tone="warn">chase now</Chip> : null}
                                    {r.score !== null ? <Chip>score {r.score}</Chip> : null}
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function RetentionList({ rows }: { rows: RetentionRow[] }) {
    if (rows.length === 0) return <Empty>No active clients yet.</Empty>;
    return (
        <ul className="divide-y">
            {rows.map((r) => (
                <li key={r.id} className="grid gap-2 py-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)] md:items-start">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <HealthDot health={r.health} />
                            <Link href={r.href} className="font-medium hover:underline">
                                {r.name}
                            </Link>
                            {r.packageName ? <Badge variant="secondary">{r.packageName}</Badge> : null}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                            {r.mrr > 0 ? `${fmtMyr(r.mrr)}/mo` : "no retainer"} · AM {r.accountManager || "—"} ·{" "}
                            {r.renewsOn ? (
                                <span
                                    className={cn(
                                        r.renewsInDays !== null && r.renewsInDays <= 30 && "font-medium text-amber-700 dark:text-amber-400",
                                        r.renewsInDays !== null && r.renewsInDays < 0 && "text-red-600 dark:text-red-400",
                                    )}
                                >
                                    renews {r.renewsOn}
                                    {r.renewsInDays !== null
                                        ? r.renewsInDays < 0
                                            ? ` (${-r.renewsInDays}d overdue)`
                                            : ` (in ${r.renewsInDays}d)`
                                        : ""}
                                </span>
                            ) : (
                                "no renewal date"
                            )}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {r.reasons.length === 0 ? (
                            <Chip tone="good">
                                healthy · {plural(r.activeContracts, "active contract")} · {plural(r.openTasks, "open task")}
                            </Chip>
                        ) : (
                            r.reasons.map((reason) => (
                                <Chip key={reason} tone={r.health === "red" ? "bad" : "warn"}>
                                    {reason}
                                </Chip>
                            ))
                        )}
                        {r.awaitingClient > 0 ? <Chip>{r.awaitingClient} awaiting client</Chip> : null}
                        {r.contentQuota > 0 ? (
                            <Chip>
                                content {r.contentPosted}/{r.contentPlanned} posted · quota {r.contentQuota}
                            </Chip>
                        ) : null}
                    </div>
                </li>
            ))}
        </ul>
    );
}

export default async function ManagementPipelinePage() {
    await requireTeamAccess();
    // Managers only (or nobody picked under the dev bypass).
    if (!seesEverything(await getActingMember())) redirect("/home");
    const [leads, quotations, clients, contracts, works, content, invoices, campaigns] = await Promise.all([
        listLeads(),
        listQuotations(),
        listClients(),
        listContracts(),
        listWorks(),
        listContentPosts(),
        listInvoices(),
        listCampaigns(),
    ]);
    const snap = buildPipelineSnapshot({ leads, quotations, clients, contracts, works, content, invoices, campaigns });
    const k = snap.kpis;

    const kpis: Array<React.ComponentProps<typeof KpiTile>> = [
        {
            label: "Closeable now",
            value: fmtMyrShort(k.closeableMyr),
            hint: `${plural(k.closeableCount, "proposal / quote")} out`,
            href: "#close",
            tone: k.closeableCount > 0 ? "good" : "neutral",
        },
        {
            label: "Open pipeline",
            value: fmtMyrShort(k.openPipelineMyr),
            hint: `${plural(k.openLeads, "open lead")}`,
            href: "/pipeline",
        },
        {
            label: "Won this month",
            value: fmtMyrShort(k.wonMtdMyr),
            hint: `${plural(k.wonMtdCount, "deal")}`,
            href: "/pipeline",
            tone: k.wonMtdCount > 0 ? "good" : "neutral",
        },
        {
            label: "Win rate (90d)",
            value: k.conversion90Pct === null ? "n/a" : `${k.conversion90Pct}%`,
            hint: `${snap.recentlyWon.length} won · ${snap.recentlyLost.length} lost`,
            href: "/pipeline",
        },
        {
            label: "Active MRR",
            value: fmtMyrShort(k.activeMrr),
            hint: "retainers + campaign fees",
            href: "#retention",
        },
        {
            label: `Renewals ≤ ${RENEWAL_WINDOW_DAYS}d`,
            value: String(k.renewalsCount),
            hint: `${fmtMyrShort(k.renewalsMrr)}/mo to re-sign`,
            href: "#retention",
            tone: k.renewalsCount > 0 ? "warn" : "neutral",
        },
        {
            label: "Accounts at risk",
            value: String(k.atRiskCount),
            hint: `${fmtMyrShort(k.atRiskMrr)}/mo exposed`,
            href: "#retention",
            tone: k.atRiskCount > 0 ? "bad" : "good",
        },
        {
            label: "Win-back list",
            value: String(k.winBackCount),
            hint: "paused or churned",
            href: "#winback",
        },
    ];

    return (
        <div className="space-y-6">
            <AsOf today={snap.today}>
                Two questions: what can we close next, and which existing clients must we keep.
            </AsOf>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {kpis.map((t) => (
                    <KpiTile key={t.label} {...t} />
                ))}
            </div>

            <Section
                id="close"
                title="Contracts we can close"
                description={`Leads at proposal or qualified stage, plus quotations out for decision. Highest value first; a lead untouched for ${STALE_LEAD_DAYS}+ days is going cold.`}
            >
                <CloseableTable rows={snap.closeable} />
            </Section>

            <Section
                title="Early-stage leads"
                description="New and contacted. Qualify or drop them so the pipeline stays honest."
            >
                {snap.early.length === 0 ? (
                    <Empty>No new or contacted leads.</Empty>
                ) : (
                    <ul className="divide-y">
                        {snap.early.map((l) => (
                            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                                <div className="min-w-0">
                                    <Link href={l.href} className="text-sm font-medium hover:underline">
                                        {l.company ? `${l.company} · ${l.name}` : l.name}
                                    </Link>
                                    <p className="text-xs text-muted-foreground">
                                        {l.status} · {l.owner || "no owner"} · touched {l.ageDays}d ago
                                    </p>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Chip>score {l.score}</Chip>
                                    <span className="text-sm tabular-nums">{l.valueMyr ? fmtMyr(l.valueMyr) : "—"}</span>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </Section>

            <Section
                id="retention"
                title="Retention — keep what we have"
                description="Every active client with the reasons it could wobble: renewal date, delivery health, revisions sitting with us, content behind promise, unpaid invoices."
            >
                <RetentionList rows={snap.retention} />
            </Section>

            <Section
                id="winback"
                title="Win-back"
                description="Paused and churned accounts. Worth a call when capacity opens up."
            >
                {snap.winBack.length === 0 ? (
                    <Empty>No paused or churned clients.</Empty>
                ) : (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Client</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Last contract</TableHead>
                                    <TableHead>Last invoice</TableHead>
                                    <TableHead className="text-right">Lifetime billed</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {snap.winBack.map((w) => (
                                    <TableRow key={w.id}>
                                        <TableCell>
                                            <Link href={w.href} className="font-medium hover:underline">
                                                {w.name}
                                            </Link>
                                            <p className="text-xs text-muted-foreground">AM {w.accountManager || "—"}</p>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{w.status}</Badge>
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {w.lastContract || "—"}
                                            {w.lastContractAt ? (
                                                <span className="text-xs text-muted-foreground"> · {w.lastContractAt}</span>
                                            ) : null}
                                        </TableCell>
                                        <TableCell className="text-sm tabular-nums">{w.lastInvoiceAt || "—"}</TableCell>
                                        <TableCell className="text-right tabular-nums">{fmtMyr(w.lifetimeBilled)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </Section>

            {snap.recentlyWon.length + snap.recentlyLost.length > 0 ? (
                <Section title="Decided in the last 90 days" description="Won and lost, most recent first.">
                    <div className="grid gap-4 md:grid-cols-2">
                        {[
                            { label: "Won", rows: snap.recentlyWon, tone: "good" as const },
                            { label: "Lost", rows: snap.recentlyLost, tone: "bad" as const },
                        ].map((g) => (
                            <div key={g.label}>
                                <p className={cn("text-xs font-medium uppercase tracking-wider", HEALTH_TEXT[g.tone === "good" ? "green" : "red"])}>
                                    {g.label} ({g.rows.length})
                                </p>
                                {g.rows.length === 0 ? (
                                    <Empty>None.</Empty>
                                ) : (
                                    <ul className="mt-1 divide-y">
                                        {g.rows.map((l) => (
                                            <li key={l.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                                                <Link href={l.href} className="truncate hover:underline">
                                                    {l.company || l.name}
                                                </Link>
                                                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                                    {l.valueMyr ? fmtMyr(l.valueMyr) : "—"} · {l.ageDays}d ago
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ))}
                    </div>
                </Section>
            ) : null}
        </div>
    );
}
