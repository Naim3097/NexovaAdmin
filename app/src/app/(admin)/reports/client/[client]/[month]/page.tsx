import Link from "next/link";
import { notFound } from "next/navigation";
import { buildClientMonthlyReport } from "@/lib/reports";
import { getAgencyProfile, formatAddress } from "@/lib/data/agency";
import { type ContentPost } from "@/lib/data/content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AssetPreview } from "@/components/asset-preview";
import {
    createMonthlyInvoiceAction,
    saveReportInsightsAction,
    setReportPublishedAction,
} from "@/lib/reports/actions";
import { getReportInsights } from "@/lib/data/report-insights";
import { PrintButton } from "./print-button";
import { GenerateInsightsButton } from "./generate-insights-button";

export const dynamic = "force-dynamic";

function latestMedia(p: ContentPost) {
    return p.drafts[p.drafts.length - 1]?.media ?? [];
}

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

    const [report, agency, insights] = await Promise.all([
        buildClientMonthlyReport(client, month),
        getAgencyProfile(),
        getReportInsights(client, month),
    ]);

    const hasAnything =
        report.campaigns.length > 0 ||
        report.projects.length > 0 ||
        report.contentPostsPublished.length > 0 ||
        report.contentApproved.length > 0 ||
        report.billing.total > 0 ||
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
                    /* Clean page breaks: keep sections, cards, images, and table
                       rows from splitting across pages; keep headings with their
                       content. */
                    article > section { break-inside: avoid; }
                    h1, h2, h3 { break-after: avoid; }
                    img, video, tr, li { break-inside: avoid; }
                    details { display: none !important; }
                }
            `}</style>

            {/* Action bar */}
            <div className="no-print sticky top-0 z-10 -mx-4 flex items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
                <Link
                    href="/reports/client"
                    className="text-sm text-muted-foreground hover:underline"
                >
                    Pick another client / month
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

                {/* AI narrative — editable, then publish to the client portal */}
                <section className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-semibold">Overview</h2>
                            {insights?.published ? (
                                <Badge>Published</Badge>
                            ) : insights ? (
                                <Badge variant="outline">Draft</Badge>
                            ) : null}
                        </div>
                        <div className="no-print flex items-center gap-2">
                            <GenerateInsightsButton
                                client={report.clientName}
                                month={report.monthKey}
                                hasInsights={Boolean(insights)}
                            />
                            {insights ? (
                                <form action={setReportPublishedAction}>
                                    <input
                                        type="hidden"
                                        name="client"
                                        value={report.clientName}
                                    />
                                    <input
                                        type="hidden"
                                        name="month"
                                        value={report.monthKey}
                                    />
                                    <input
                                        type="hidden"
                                        name="published"
                                        value={insights.published ? "0" : "1"}
                                    />
                                    <Button
                                        type="submit"
                                        size="sm"
                                        variant={
                                            insights.published
                                                ? "outline"
                                                : "default"
                                        }
                                    >
                                        {insights.published
                                            ? "Unpublish"
                                            : "Publish to client"}
                                    </Button>
                                </form>
                            ) : null}
                        </div>
                    </div>

                    {insights ? (
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-sm font-medium">Summary</h3>
                                <p className="mt-1 whitespace-pre-wrap text-sm">
                                    {insights.summary}
                                </p>
                            </div>
                            <div>
                                <h3 className="text-sm font-medium">
                                    Conclusion
                                </h3>
                                <p className="mt-1 whitespace-pre-wrap text-sm">
                                    {insights.conclusion}
                                </p>
                            </div>
                            {insights.recommendations.length > 0 ? (
                                <div>
                                    <h3 className="text-sm font-medium">
                                        Recommendations
                                    </h3>
                                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                                        {insights.recommendations.map((r, i) => (
                                            <li key={i}>{r}</li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}

                            {/* Editable (hidden in print) */}
                            <details className="no-print rounded-lg border bg-muted/30 p-3">
                                <summary className="cursor-pointer text-sm font-medium">
                                    Edit overview
                                </summary>
                                <form
                                    action={saveReportInsightsAction}
                                    className="mt-3 space-y-3"
                                >
                                    <input
                                        type="hidden"
                                        name="client"
                                        value={report.clientName}
                                    />
                                    <input
                                        type="hidden"
                                        name="month"
                                        value={report.monthKey}
                                    />
                                    <div className="space-y-1.5">
                                        <Label className="text-sm">Summary</Label>
                                        <Textarea
                                            name="summary"
                                            rows={4}
                                            defaultValue={insights.summary}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-sm">
                                            Conclusion
                                        </Label>
                                        <Textarea
                                            name="conclusion"
                                            rows={3}
                                            defaultValue={insights.conclusion}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-sm">
                                            Recommendations (one per line)
                                        </Label>
                                        <Textarea
                                            name="recommendations"
                                            rows={5}
                                            defaultValue={insights.recommendations.join(
                                                "\n",
                                            )}
                                        />
                                    </div>
                                    <div className="flex justify-end">
                                        <Button type="submit" size="sm">
                                            Save overview
                                        </Button>
                                    </div>
                                </form>
                            </details>

                            <p className="text-[11px] text-muted-foreground">
                                Drafted by AI on{" "}
                                {new Date(
                                    insights.generatedAt,
                                ).toLocaleDateString()}{" "}
                                · edit, then publish to the client.
                            </p>
                        </div>
                    ) : (
                        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                            No overview yet. Click{" "}
                            <span className="font-medium">Generate insights</span>{" "}
                            to draft a Summary, Conclusion, and Recommendations
                            from this month&apos;s deliverables.
                        </p>
                    )}
                </section>

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

                {/* Content delivered — visual showcase */}
                {report.contentApproved.length > 0 ? (
                    <section className="space-y-3">
                        <h2 className="text-lg font-semibold">
                            Content delivered ({report.contentApproved.length})
                        </h2>
                        <div className="grid gap-4 sm:grid-cols-2">
                            {report.contentApproved.map((p) => (
                                <div
                                    key={p.id}
                                    className="space-y-2 rounded-lg border p-3"
                                >
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <span className="text-sm font-medium">
                                            {p.title}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {p.platform} · {p.type}
                                            {p.approvedAt
                                                ? ` · ${p.approvedAt.slice(0, 10)}`
                                                : ""}
                                        </span>
                                    </div>
                                    <AssetPreview
                                        media={latestMedia(p)}
                                        fallbackUrl={p.currentFileUrl}
                                    />
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null}

                {/* Billing this month — retainer + extras */}
                {report.billing.total > 0 ? (
                    <section className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h2 className="text-lg font-semibold">
                                Billing this month
                            </h2>
                            <form
                                action={createMonthlyInvoiceAction}
                                className="no-print"
                            >
                                <input
                                    type="hidden"
                                    name="client"
                                    value={report.clientName}
                                />
                                <input
                                    type="hidden"
                                    name="month"
                                    value={report.monthKey}
                                />
                                <Button type="submit" size="sm">
                                    Generate monthly invoice
                                </Button>
                            </form>
                        </div>
                        <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full text-sm">
                                <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                                    <tr>
                                        <th className="px-3 py-2 text-left">
                                            Item
                                        </th>
                                        <th className="px-3 py-2 text-right">
                                            Qty
                                        </th>
                                        <th className="px-3 py-2 text-right">
                                            Unit
                                        </th>
                                        <th className="px-3 py-2 text-right">
                                            Amount
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {report.billing.retainer > 0 ? (
                                        <tr className="border-b last:border-b-0">
                                            <td className="px-3 py-2">
                                                {report.billing.packageName
                                                    ? `${report.billing.packageName} retainer`
                                                    : "Monthly retainer"}
                                                <span className="text-muted-foreground">
                                                    {" "}
                                                    ·{" "}
                                                    {
                                                        report.billing
                                                            .deliveredContents
                                                    }
                                                    /
                                                    {
                                                        report.billing
                                                            .includedContents
                                                    }{" "}
                                                    contents delivered
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                1
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {fmtMyr(report.billing.retainer)}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {fmtMyr(report.billing.retainer)}
                                            </td>
                                        </tr>
                                    ) : null}
                                    {report.extras.contentCount > 0 ? (
                                        <tr className="border-b last:border-b-0">
                                            <td className="px-3 py-2">
                                                Extra content (beyond plan)
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {report.extras.contentCount}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {fmtMyr(
                                                    report.extras.contentPrice,
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {fmtMyr(
                                                    report.extras.contentCharge,
                                                )}
                                            </td>
                                        </tr>
                                    ) : null}
                                    {report.extras.revisionCount > 0 ? (
                                        <tr className="border-b last:border-b-0">
                                            <td className="px-3 py-2">
                                                Extra revisions (beyond limit)
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {report.extras.revisionCount}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {fmtMyr(
                                                    report.extras.revisionPrice,
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {fmtMyr(
                                                    report.extras.revisionCharge,
                                                )}
                                            </td>
                                        </tr>
                                    ) : null}
                                    <tr className="font-semibold">
                                        <td className="px-3 py-2" colSpan={3}>
                                            Total
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            {fmtMyr(report.billing.total)}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
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
