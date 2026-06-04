import Link from "next/link";
import { notFound } from "next/navigation";
import { buildClientMonthlyReport } from "@/lib/reports";
import { getAgencyProfile, formatAddress } from "@/lib/data/agency";
import { Badge } from "@/components/ui/badge";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

const MONTH_LABELS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

function fmtMyr(n: number) {
    return `MYR ${n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

function fmtMonth(monthKey: string): string {
    const [y, m] = monthKey.split("-").map(Number);
    return `${MONTH_LABELS[m - 1]} ${y}`;
}

export default async function ClientMonthlyReportPage({
    params,
}: {
    params: Promise<{ client: string; month: string }>;
}) {
    const { client: clientRaw, month } = await params;
    if (!/^\d{4}-\d{2}$/.test(month)) notFound();
    const client = decodeURIComponent(clientRaw);

    const [report, agency] = await Promise.all([
        buildClientMonthlyReport(client, month),
        getAgencyProfile(),
    ]);

    const hasAnything =
        report.campaigns.length > 0 ||
        report.projects.length > 0 ||
        report.contentPostsPublished.length > 0 ||
        report.seoArticlesPublished.length > 0 ||
        report.invoicesIssued.length > 0;

    return (
        <div className="space-y-6">
            {/* Print stylesheet — hides the no-print bar, forces white. */}
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; }
                    @page { margin: 16mm; }
                }
            `}</style>

            {/* Action bar */}
            <div className="no-print sticky top-0 z-10 -mx-4 flex items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
                <Link
                    href="/reports/client"
                    className="text-sm text-muted-foreground hover:underline"
                >
                    ← Pick another client / month
                </Link>
                <div className="flex items-center gap-2">
                    <span className="hidden text-xs text-muted-foreground md:inline">
                        Use browser &quot;Save as PDF&quot; when printing.
                    </span>
                    <PrintButton />
                </div>
            </div>

            <article className="mx-auto max-w-4xl space-y-8">
                {/* Header */}
                <header className="border-b pb-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {agency.legalName || "Nexov"}
                        {formatAddress(agency)
                            ? ` · ${formatAddress(agency)}`
                            : ""}
                    </p>
                    <h1 className="mt-2 text-3xl font-semibold">
                        Monthly report — {fmtMonth(report.monthKey)}
                    </h1>
                    <p className="mt-1 text-lg">
                        Prepared for{" "}
                        <span className="font-medium">{report.clientName}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Coverage: {report.monthStart} → {report.monthEnd}
                    </p>
                </header>

                {!hasAnything ? (
                    <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
                        No activity recorded for {report.clientName} in{" "}
                        {fmtMonth(report.monthKey)}.
                    </p>
                ) : null}

                {/* Ads */}
                {report.campaigns.length > 0 ? (
                    <section className="space-y-3">
                        <h2 className="text-lg font-semibold">
                            Advertising performance
                        </h2>
                        <div className="grid gap-3 md:grid-cols-4">
                            <Kpi
                                label="Ad spend"
                                value={fmtMyr(report.totals.spendMyr)}
                            />
                            <Kpi
                                label="Impressions"
                                value={report.totals.impressions.toLocaleString()}
                            />
                            <Kpi
                                label="Clicks"
                                value={report.totals.clicks.toLocaleString()}
                            />
                            <Kpi
                                label="Leads (CRM)"
                                value={String(report.totals.crmLeads)}
                                sub={`platform reported: ${report.totals.leadsReported}`}
                            />
                        </div>
                        <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full text-sm">
                                <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                                    <tr>
                                        <th className="px-3 py-2 text-left">
                                            Campaign
                                        </th>
                                        <th className="px-3 py-2 text-left">
                                            Platform
                                        </th>
                                        <th className="px-3 py-2 text-right">
                                            Spend
                                        </th>
                                        <th className="px-3 py-2 text-right">
                                            Impr.
                                        </th>
                                        <th className="px-3 py-2 text-right">
                                            Clicks
                                        </th>
                                        <th className="px-3 py-2 text-right">
                                            Leads
                                        </th>
                                        <th className="px-3 py-2 text-right">
                                            Won
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {report.campaigns.map((r) => (
                                        <tr
                                            key={r.campaign.id}
                                            className="border-b last:border-b-0"
                                        >
                                            <td className="px-3 py-2 font-medium">
                                                {r.campaign.name}
                                            </td>
                                            <td className="px-3 py-2 text-muted-foreground">
                                                {r.campaign.platform}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {fmtMyr(r.spendMyr)}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {r.impressions.toLocaleString()}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {r.clicks.toLocaleString()}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {r.crmLeads}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {r.wonRevenueMyr > 0
                                                    ? fmtMyr(r.wonRevenueMyr)
                                                    : "—"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {report.totals.mgmtFeeMyr > 0 ? (
                            <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                                <p className="font-medium">Billing summary</p>
                                <dl className="mt-2 space-y-1">
                                    <Row
                                        label="Ad spend"
                                        value={fmtMyr(report.totals.spendMyr)}
                                    />
                                    <Row
                                        label="Management fee"
                                        value={fmtMyr(report.totals.mgmtFeeMyr)}
                                    />
                                    <Row
                                        label="Total billable"
                                        value={fmtMyr(
                                            report.totals.billableMyr,
                                        )}
                                        bold
                                    />
                                </dl>
                            </div>
                        ) : null}
                    </section>
                ) : null}

                {/* Projects */}
                {report.projects.length > 0 ? (
                    <section className="space-y-3">
                        <h2 className="text-lg font-semibold">Projects</h2>
                        <ul className="divide-y rounded-lg border">
                            {report.projects.map((r) => (
                                <li key={r.project.id} className="p-4">
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <p className="font-medium">
                                            {r.project.name}
                                        </p>
                                        <div className="flex gap-2">
                                            <Badge variant="outline">
                                                {r.project.phase.replace(
                                                    /_/g,
                                                    " ",
                                                )}
                                            </Badge>
                                            <Badge variant="secondary">
                                                {r.project.status.replace(
                                                    /_/g,
                                                    " ",
                                                )}
                                            </Badge>
                                            {r.signedOffInMonth ? (
                                                <Badge>signed off</Badge>
                                            ) : null}
                                        </div>
                                    </div>
                                    {r.deliverablesApprovedInMonth > 0 ? (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {r.deliverablesApprovedInMonth}{" "}
                                            deliverable
                                            {r.deliverablesApprovedInMonth === 1
                                                ? ""
                                                : "s"}{" "}
                                            approved this month
                                        </p>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                {/* Content */}
                {report.contentPostsPublished.length > 0 ? (
                    <section className="space-y-3">
                        <h2 className="text-lg font-semibold">
                            Content published ({report.contentPostsPublished.length})
                        </h2>
                        <ul className="divide-y rounded-lg border">
                            {report.contentPostsPublished.map((p) => (
                                <li key={p.id} className="p-3 text-sm">
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <span className="font-medium">
                                            {p.title}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {p.platform} · {p.type} ·{" "}
                                            {(p.postedAt ?? p.scheduledFor).slice(0, 10)}
                                        </span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                {/* SEO */}
                {report.seoArticlesPublished.length > 0 ? (
                    <section className="space-y-3">
                        <h2 className="text-lg font-semibold">
                            SEO articles published ({report.seoArticlesPublished.length})
                        </h2>
                        <ul className="divide-y rounded-lg border">
                            {report.seoArticlesPublished.map((a) => (
                                <li key={a.id} className="p-3 text-sm">
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <div>
                                            <p className="font-medium">
                                                {a.title}
                                            </p>
                                            {a.targetKeyword ? (
                                                <p className="text-xs text-muted-foreground">
                                                    Target:{" "}
                                                    <code>{a.targetKeyword}</code>
                                                </p>
                                            ) : null}
                                        </div>
                                        {a.publishedUrl ? (
                                            <a
                                                href={a.publishedUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="break-all text-xs text-primary hover:underline"
                                            >
                                                {a.publishedUrl}
                                            </a>
                                        ) : null}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                {/* Invoices */}
                {report.invoicesIssued.length > 0 ||
                    report.invoicesPaid.length > 0 ? (
                    <section className="space-y-3">
                        <h2 className="text-lg font-semibold">Invoicing</h2>
                        <div className="grid gap-3 md:grid-cols-2">
                            <Kpi
                                label={`Issued (${report.invoicesIssued.length})`}
                                value={fmtMyr(report.invoiceTotals.issuedMyr)}
                            />
                            <Kpi
                                label={`Paid (${report.invoicesPaid.length})`}
                                value={fmtMyr(report.invoiceTotals.paidMyr)}
                            />
                        </div>
                    </section>
                ) : null}

                {/* Footer */}
                <footer className="border-t pt-4 text-xs text-muted-foreground">
                    Generated {new Date().toLocaleString()} ·{" "}
                    {agency.legalName || "Nexov"}
                    {agency.email ? ` · ${agency.email}` : ""}
                </footer>
            </article>
        </div>
    );
}

function Kpi({
    label,
    value,
    sub,
}: {
    label: string;
    value: string;
    sub?: string;
}) {
    return (
        <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-lg font-semibold">{value}</p>
            {sub ? (
                <p className="text-xs text-muted-foreground">{sub}</p>
            ) : null}
        </div>
    );
}

function Row({
    label,
    value,
    bold,
}: {
    label: string;
    value: string;
    bold?: boolean;
}) {
    return (
        <div
            className={`flex items-center justify-between ${bold ? "border-t pt-1 font-semibold" : ""}`}
        >
            <dt className={bold ? "" : "text-muted-foreground"}>{label}</dt>
            <dd>{value}</dd>
        </div>
    );
}
