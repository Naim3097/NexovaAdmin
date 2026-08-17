import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentClient, getCurrentUser } from "@/lib/auth";
import { buildClientMonthlyReport } from "@/lib/reports";
import { getAgencyProfile, formatAddress } from "@/lib/data/agency";
import { getReportInsights } from "@/lib/data/report-insights";
import { type ContentPost } from "@/lib/data/content";
import { ReportAssetThumb } from "@/components/report-asset-thumb";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

/**
 * Client-facing monthly report document. Lives in the bare (print) layout so
 * NO admin chrome (sidebar, nav, action bars) can leak into the PDF — the
 * admin report page is the working view; this is the deliverable.
 */

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

function fmtMonth(monthKey: string): string {
    const [y, m] = monthKey.split("-").map(Number);
    return `${MONTH_LABELS[m - 1]} ${y}`;
}

function fmtMyr(n: number) {
    return `MYR ${n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

function fmtDate(iso: string | null | undefined): string {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

function latestMedia(p: ContentPost) {
    return p.drafts[p.drafts.length - 1]?.media ?? [];
}

/** Client-facing delivery state — no internal workflow jargon. */
function deliveryLabel(p: ContentPost): string {
    if (p.status === "posted") {
        return `Published${p.postedAt ? ` · ${fmtDate(p.postedAt)}` : ""}`;
    }
    if (p.reviewStatus === "approved") {
        return `Approved${p.approvedAt ? ` · ${fmtDate(p.approvedAt)}` : ""}`;
    }
    return "Delivered";
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ client: string; month: string }>;
}) {
    const { client, month } = await params;
    const name = decodeURIComponent(client);
    // Absolute title → the browser's Save-as-PDF filename.
    return { title: { absolute: `${name} - Monthly Report ${month}` } };
}

export default async function ClientReportPrintPage({
    params,
}: {
    params: Promise<{ client: string; month: string }>;
}) {
    const { client: clientRaw, month } = await params;
    if (!/^\d{4}-\d{2}$/.test(month)) notFound();
    const client = decodeURIComponent(clientRaw);

    // Two audiences, two rules:
    //   agency  — any signed-in team member, matching the working view.
    //             (Finance surfaces stay admin-only; a client's monthly
    //             report is the whole delivery team's deliverable.)
    //   client  — their OWN report, and only once it has been published.
    // A failed client check is a 404 (not a redirect): probing another
    // client's URL should reveal nothing about whether it exists.
    const viewer = await getCurrentClient();
    const isClientViewer = viewer !== null;
    if (isClientViewer) {
        const ownReport =
            viewer.name.trim().toLowerCase() === client.trim().toLowerCase();
        if (!ownReport) notFound();
        const published = await getReportInsights(client, month);
        if (!published?.published) notFound();
    } else if (!(await getCurrentUser())) {
        // The (print) layout redirects signed-out users, but don't depend on
        // a layout for an access decision.
        notFound();
    }

    const [report, agency, insights] = await Promise.all([
        buildClientMonthlyReport(client, month),
        getAgencyProfile(),
        getReportInsights(client, month),
    ]);

    const agencyName = agency.displayName || agency.legalName || "NexOps";
    const monthLabel = fmtMonth(report.monthKey);

    // Only sections with data render; numbering stays sequential.
    let sectionNo = 0;
    const nextNo = () => String(++sectionNo).padStart(2, "0");

    const kpis: Array<{ label: string; value: string }> = [];
    if (report.contentDelivered.length > 0)
        kpis.push({
            label: "Content delivered",
            value: String(report.contentDelivered.length),
        });
    if (report.contentPostsPublished.length > 0)
        kpis.push({
            label: "Posts published",
            value: String(report.contentPostsPublished.length),
        });
    if (report.totals.spendMyr > 0) {
        kpis.push({ label: "Ad spend", value: fmtMyr(report.totals.spendMyr) });
        kpis.push({
            label: "Impressions",
            value: report.totals.impressions.toLocaleString(),
        });
        kpis.push({
            label: "Clicks",
            value: report.totals.clicks.toLocaleString(),
        });
        kpis.push({ label: "Leads", value: String(report.totals.crmLeads) });
    }
    if (report.seoArticlesPublished.length > 0)
        kpis.push({
            label: "SEO articles",
            value: String(report.seoArticlesPublished.length),
        });
    if (report.projects.length > 0)
        kpis.push({
            label: "Active projects",
            value: String(report.projects.length),
        });

    const hasAnything =
        kpis.length > 0 || report.billing.total > 0 || Boolean(insights);

    return (
        <>
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; }
                    @page {
                        margin: 18mm 16mm 22mm 16mm;
                        @bottom-right {
                            content: "Page " counter(page);
                            font-size: 9px;
                            color: #737373;
                        }
                    }
                    /* Clean pagination: never split a card, row, or KPI tile;
                       keep headings attached to what follows them. */
                    h1, h2, h3 { break-after: avoid; }
                    section { break-inside: auto; }
                    .avoid-break, tr, li { break-inside: avoid; }
                    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .print-footer { position: fixed; bottom: -14mm; left: 0; right: 0; }
                    .doc { box-shadow: none !important; border: 0 !important; max-width: none !important; padding: 0 !important; }
                }
            `}</style>

            {/* Action bar — screen only */}
            <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-card px-6 py-3">
                <Link
                    href={
                        isClientViewer
                            ? `/portal/reports/${month}`
                            : `/reports/client/${encodeURIComponent(client)}/${month}`
                    }
                    className="text-sm text-muted-foreground hover:underline"
                >
                    {isClientViewer ? "Back to my reports" : "Back to working view"}
                </Link>
                <div className="flex items-center gap-3">
                    <span className="hidden text-xs text-muted-foreground md:inline">
                        Use &ldquo;Save as PDF&rdquo; in the print dialog.
                    </span>
                    <PrintButton />
                </div>
            </div>

            <div className="doc mx-auto my-8 max-w-[830px] rounded-xl border bg-white p-12 text-neutral-900 shadow-sm print:my-0">
                {/* ─── Document header ─── */}
                <header className="flex items-start justify-between gap-6 border-b-2 border-neutral-900 pb-6">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={agency.logoUrl || "/brand/nexops-black.png"}
                        alt={agencyName}
                        className="h-8 w-auto"
                    />
                    <div className="text-right text-[11px] leading-relaxed text-neutral-500">
                        <p className="font-medium text-neutral-900">
                            {agency.legalName || agencyName}
                        </p>
                        {agency.registrationNo ? (
                            <p>Reg. No. {agency.registrationNo}</p>
                        ) : null}
                        {formatAddress(agency) ? (
                            <p>{formatAddress(agency)}</p>
                        ) : null}
                        {agency.email ? <p>{agency.email}</p> : null}
                    </div>
                </header>

                {/* ─── Title block ─── */}
                <div className="mt-10">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
                        Monthly Performance Report
                    </p>
                    <h1 className="mt-2 text-4xl font-semibold tracking-tight">
                        {report.clientName}
                    </h1>
                    <p className="mt-2 text-lg text-neutral-600">{monthLabel}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                        Reporting period: {fmtDate(report.monthStart)} –{" "}
                        {fmtDate(report.monthEnd)}
                    </p>
                </div>

                {!hasAnything ? (
                    <p className="mt-10 rounded-lg border border-dashed p-6 text-sm text-neutral-500">
                        No activity recorded for {report.clientName} in{" "}
                        {monthLabel}.
                    </p>
                ) : null}

                {/* ─── Executive summary ─── */}
                {insights ? (
                    <section className="mt-10">
                        <SectionTitle no={nextNo()}>
                            Executive summary
                        </SectionTitle>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
                            {insights.summary}
                        </p>
                        {insights.conclusion ? (
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
                                {insights.conclusion}
                            </p>
                        ) : null}
                        {insights.recommendations.length > 0 ? (
                            <div className="avoid-break mt-4 rounded-lg bg-neutral-50 p-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                                    Recommendations
                                </p>
                                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-neutral-700">
                                    {insights.recommendations.map((r, i) => (
                                        <li key={i}>{r}</li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                    </section>
                ) : null}

                {/* ─── Month at a glance ─── */}
                {kpis.length > 0 ? (
                    <section className="mt-10">
                        <SectionTitle no={nextNo()}>
                            Month at a glance
                        </SectionTitle>
                        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {kpis.map((k) => (
                                <div
                                    key={k.label}
                                    className="avoid-break rounded-lg border border-neutral-200 p-3"
                                >
                                    <p className="text-[11px] uppercase tracking-wide text-neutral-500">
                                        {k.label}
                                    </p>
                                    <p className="mt-1 text-xl font-semibold tabular-nums">
                                        {k.value}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null}

                {/* ─── Content delivered ─── */}
                {report.contentDelivered.length > 0 ? (
                    <section className="mt-10">
                        <SectionTitle no={nextNo()}>
                            Content delivered ({report.contentDelivered.length})
                        </SectionTitle>
                        <div className="mt-4 grid grid-cols-2 gap-4">
                            {report.contentDelivered.map((p) => (
                                <div key={p.id} className="avoid-break">
                                    <ReportAssetThumb
                                        media={latestMedia(p)}
                                        fallbackUrl={p.currentFileUrl}
                                        alt={p.title}
                                    />
                                    <p className="mt-2 text-sm font-medium leading-snug">
                                        {p.title}
                                    </p>
                                    <p className="mt-0.5 text-xs text-neutral-500">
                                        {p.platform} · {p.type} ·{" "}
                                        {deliveryLabel(p)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null}

                {/* ─── Posts published ─── */}
                {report.contentPostsPublished.length > 0 ? (
                    <section className="mt-10">
                        <SectionTitle no={nextNo()}>
                            Published this month (
                            {report.contentPostsPublished.length})
                        </SectionTitle>
                        <table className="mt-4 w-full text-sm">
                            <thead>
                                <tr className="border-b border-neutral-300 text-left text-[11px] uppercase tracking-wide text-neutral-500">
                                    <th className="py-2 pr-3 font-medium">
                                        Title
                                    </th>
                                    <th className="py-2 pr-3 font-medium">
                                        Platform
                                    </th>
                                    <th className="py-2 pr-3 font-medium">
                                        Format
                                    </th>
                                    <th className="py-2 text-right font-medium">
                                        Date
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {report.contentPostsPublished.map((p) => (
                                    <tr
                                        key={p.id}
                                        className="border-b border-neutral-100"
                                    >
                                        <td className="py-2 pr-3 font-medium">
                                            {p.title}
                                        </td>
                                        <td className="py-2 pr-3 text-neutral-600">
                                            {p.platform}
                                        </td>
                                        <td className="py-2 pr-3 text-neutral-600">
                                            {p.type}
                                        </td>
                                        <td className="py-2 text-right tabular-nums text-neutral-600">
                                            {fmtDate(
                                                p.postedAt ?? p.scheduledFor,
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>
                ) : null}

                {/* ─── Advertising ─── */}
                {report.campaigns.length > 0 && report.totals.spendMyr > 0 ? (
                    <section className="mt-10">
                        <SectionTitle no={nextNo()}>
                            Advertising performance
                        </SectionTitle>
                        <table className="mt-4 w-full text-sm">
                            <thead>
                                <tr className="border-b border-neutral-300 text-left text-[11px] uppercase tracking-wide text-neutral-500">
                                    <th className="py-2 pr-3 font-medium">
                                        Campaign
                                    </th>
                                    <th className="py-2 pr-3 font-medium">
                                        Platform
                                    </th>
                                    <th className="py-2 pr-3 text-right font-medium">
                                        Spend
                                    </th>
                                    <th className="py-2 pr-3 text-right font-medium">
                                        Impressions
                                    </th>
                                    <th className="py-2 pr-3 text-right font-medium">
                                        Clicks
                                    </th>
                                    <th className="py-2 text-right font-medium">
                                        Leads
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {report.campaigns
                                    .filter(
                                        (r) =>
                                            r.spendMyr > 0 ||
                                            r.impressions > 0 ||
                                            r.clicks > 0,
                                    )
                                    .map((r) => (
                                        <tr
                                            key={r.campaign.id}
                                            className="border-b border-neutral-100"
                                        >
                                            <td className="py-2 pr-3 font-medium">
                                                {r.campaign.name}
                                            </td>
                                            <td className="py-2 pr-3 text-neutral-600">
                                                {r.campaign.platform}
                                            </td>
                                            <td className="py-2 pr-3 text-right tabular-nums">
                                                {fmtMyr(r.spendMyr)}
                                            </td>
                                            <td className="py-2 pr-3 text-right tabular-nums">
                                                {r.impressions.toLocaleString()}
                                            </td>
                                            <td className="py-2 pr-3 text-right tabular-nums">
                                                {r.clicks.toLocaleString()}
                                            </td>
                                            <td className="py-2 text-right tabular-nums">
                                                {r.crmLeads}
                                            </td>
                                        </tr>
                                    ))}
                                <tr className="font-semibold">
                                    <td className="py-2 pr-3" colSpan={2}>
                                        Total
                                    </td>
                                    <td className="py-2 pr-3 text-right tabular-nums">
                                        {fmtMyr(report.totals.spendMyr)}
                                    </td>
                                    <td className="py-2 pr-3 text-right tabular-nums">
                                        {report.totals.impressions.toLocaleString()}
                                    </td>
                                    <td className="py-2 pr-3 text-right tabular-nums">
                                        {report.totals.clicks.toLocaleString()}
                                    </td>
                                    <td className="py-2 text-right tabular-nums">
                                        {report.totals.crmLeads}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </section>
                ) : null}

                {/* ─── Projects ─── */}
                {report.projects.length > 0 ? (
                    <section className="mt-10">
                        <SectionTitle no={nextNo()}>Projects</SectionTitle>
                        <ul className="mt-4 space-y-3">
                            {report.projects.map((r) => (
                                <li
                                    key={r.project.id}
                                    className="avoid-break flex items-baseline justify-between gap-4 border-b border-neutral-100 pb-3"
                                >
                                    <div>
                                        <p className="text-sm font-medium">
                                            {r.project.name}
                                        </p>
                                        <p className="mt-0.5 text-xs text-neutral-500">
                                            {r.project.phase.replace(/_/g, " ")}
                                            {r.deliverablesApprovedInMonth > 0
                                                ? ` · ${r.deliverablesApprovedInMonth} deliverable${r.deliverablesApprovedInMonth === 1 ? "" : "s"} approved this month`
                                                : ""}
                                        </p>
                                    </div>
                                    <span className="shrink-0 text-xs text-neutral-600">
                                        {r.signedOffInMonth
                                            ? "Signed off"
                                            : r.project.status.replace(
                                                  /_/g,
                                                  " ",
                                              )}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                {/* ─── SEO ─── */}
                {report.seoArticlesPublished.length > 0 ? (
                    <section className="mt-10">
                        <SectionTitle no={nextNo()}>
                            SEO articles published (
                            {report.seoArticlesPublished.length})
                        </SectionTitle>
                        <ul className="mt-4 space-y-3">
                            {report.seoArticlesPublished.map((a) => (
                                <li key={a.id} className="avoid-break">
                                    <p className="text-sm font-medium">
                                        {a.title}
                                    </p>
                                    <p className="mt-0.5 text-xs text-neutral-500">
                                        {a.targetKeyword
                                            ? `Target keyword: ${a.targetKeyword}`
                                            : ""}
                                        {a.targetKeyword && a.publishedUrl
                                            ? " · "
                                            : ""}
                                        {a.publishedUrl ? (
                                            <span className="break-all">
                                                {a.publishedUrl}
                                            </span>
                                        ) : null}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                {/* ─── Billing summary ─── */}
                {report.billing.total > 0 ? (
                    <section className="mt-10">
                        <SectionTitle no={nextNo()}>
                            Billing summary
                        </SectionTitle>
                        <table className="mt-4 w-full text-sm">
                            <tbody>
                                {report.billing.retainer > 0 ? (
                                    <tr className="border-b border-neutral-100">
                                        <td className="py-2 pr-3">
                                            {report.billing.packageName
                                                ? `${report.billing.packageName} retainer`
                                                : "Monthly retainer"}
                                            {report.billing.includedContents >
                                            0 ? (
                                                <span className="text-neutral-500">
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
                                            ) : null}
                                        </td>
                                        <td className="py-2 text-right tabular-nums">
                                            {fmtMyr(report.billing.retainer)}
                                        </td>
                                    </tr>
                                ) : null}
                                {report.extras.contentCount > 0 ? (
                                    <tr className="border-b border-neutral-100">
                                        <td className="py-2 pr-3">
                                            Additional visuals (
                                            {report.extras.contentCount} ×{" "}
                                            {fmtMyr(report.extras.contentPrice)}
                                            )
                                        </td>
                                        <td className="py-2 text-right tabular-nums">
                                            {fmtMyr(
                                                report.extras.contentCharge,
                                            )}
                                        </td>
                                    </tr>
                                ) : null}
                                {report.extras.revisionCount > 0 ? (
                                    <tr className="border-b border-neutral-100">
                                        <td className="py-2 pr-3">
                                            Additional revisions (
                                            {report.extras.revisionCount} ×{" "}
                                            {fmtMyr(
                                                report.extras.revisionPrice,
                                            )}
                                            )
                                        </td>
                                        <td className="py-2 text-right tabular-nums">
                                            {fmtMyr(
                                                report.extras.revisionCharge,
                                            )}
                                        </td>
                                    </tr>
                                ) : null}
                                <tr className="font-semibold">
                                    <td className="py-2 pr-3">Total</td>
                                    <td className="py-2 text-right tabular-nums">
                                        {fmtMyr(report.billing.total)}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </section>
                ) : null}

                {/* ─── Document footer ─── */}
                <footer className="mt-12 border-t border-neutral-200 pt-4 text-[11px] leading-relaxed text-neutral-500">
                    <p>
                        Prepared by {agencyName}
                        {agency.email ? ` · ${agency.email}` : ""}
                        {agency.phone ? ` · ${agency.phone}` : ""}
                    </p>
                    <p className="mt-0.5">
                        This report is confidential and prepared exclusively for{" "}
                        {report.clientName}.
                    </p>
                </footer>
            </div>

            {/* Running footer on every printed page */}
            <div className="print-footer hidden text-[9px] text-neutral-400 print:block">
                {agencyName} · Monthly report · {report.clientName} ·{" "}
                {monthLabel}
            </div>
        </>
    );
}

function SectionTitle({
    no,
    children,
}: {
    no: string;
    children: React.ReactNode;
}) {
    return (
        <h2 className="flex items-baseline gap-3 border-b border-neutral-200 pb-2 text-lg font-semibold tracking-tight">
            <span className="text-sm font-normal tabular-nums text-neutral-400">
                {no}
            </span>
            {children}
        </h2>
    );
}
