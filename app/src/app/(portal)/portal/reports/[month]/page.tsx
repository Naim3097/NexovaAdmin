import Link from "next/link";
import { notFound } from "next/navigation";
import { portalHref, resolveActingClient } from "@/lib/portal/resolve-client";
import { buildClientMonthlyReport } from "@/lib/reports";
import { getReportInsights } from "@/lib/data/report-insights";
import { type ContentPost } from "@/lib/data/content";
import { AssetPreview } from "@/components/asset-preview";
import { buttonVariants } from "@/components/ui/button";
import { fmtMyr } from "@/lib/format";

export const dynamic = "force-dynamic";

function fmtMonth(m: string) {
    const [y, mo] = m.split("-").map(Number);
    return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
    });
}
function latestMedia(p: ContentPost) {
    return p.drafts[p.drafts.length - 1]?.media ?? [];
}

export default async function PortalReportMonthPage({
    params,
    searchParams,
}: {
    params: Promise<{ month: string }>;
    searchParams: Promise<{ client?: string }>;
}) {
    const { month } = await params;
    if (!/^\d{4}-\d{2}$/.test(month)) notFound();
    const sp = await searchParams;
    const acting = await resolveActingClient(
        typeof sp.client === "string" ? sp.client : undefined,
    );
    if (!acting) notFound();
    const { client } = acting;

    const insights = await getReportInsights(client.name, month);
    // Only show reports the agency has published.
    if (!insights || !insights.published) notFound();

    const report = await buildClientMonthlyReport(client.name, month);

    return (
        <div className="space-y-6">
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; }
                    @page { margin: 16mm; }
                    article > section { break-inside: avoid; }
                    h1, h2, h3 { break-after: avoid; }
                    img, video, tr, li { break-inside: avoid; }
                }
            `}</style>

            <div className="no-print flex items-center justify-between gap-3">
                <Link
                    href={portalHref("/portal/reports", acting)}
                    className="text-sm text-muted-foreground hover:underline"
                >
                    ← All reports
                </Link>
                {/* The formatted document (letterhead, sections, pagination) —
                    the same file the agency sends out. */}
                <Link
                    href={`/reports/client/${encodeURIComponent(client.name)}/${month}/print`}
                    className={buttonVariants({ size: "sm" })}
                >
                    Download PDF
                </Link>
            </div>

            <article className="space-y-8">
                <header className="border-b pb-4">
                    <h1 className="text-2xl font-semibold md:text-3xl">
                        Monthly report — {fmtMonth(month)}
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {client.name}
                    </p>
                </header>

                {/* Overview */}
                <section className="space-y-4">
                    <h2 className="text-lg font-semibold">Overview</h2>
                    <div>
                        <h3 className="text-sm font-medium">Summary</h3>
                        <p className="mt-1 whitespace-pre-wrap text-sm">
                            {insights.summary}
                        </p>
                    </div>
                    <div>
                        <h3 className="text-sm font-medium">Conclusion</h3>
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
                </section>

                {/* Content delivered */}
                {report.contentDelivered.length > 0 ? (
                    <section className="space-y-3">
                        <h2 className="text-lg font-semibold">
                            Content delivered ({report.contentDelivered.length})
                        </h2>
                        <div className="grid gap-4 sm:grid-cols-2">
                            {report.contentDelivered.map((p) => (
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

                {/* Billing */}
                {report.billing.total > 0 ? (
                    <section className="space-y-3">
                        <h2 className="text-lg font-semibold">Billing</h2>
                        <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full text-sm">
                                <tbody>
                                    {report.billing.retainer > 0 ? (
                                        <tr className="border-b">
                                            <td className="px-3 py-2">
                                                Monthly retainer
                                                {report.billing.projects.length > 0
                                                    ? ` · ${report.billing.projects.join(", ")}`
                                                    : ""}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {fmtMyr(report.billing.retainer)}
                                            </td>
                                        </tr>
                                    ) : null}
                                    <tr className="font-semibold">
                                        <td className="px-3 py-2">Total</td>
                                        <td className="px-3 py-2 text-right">
                                            {fmtMyr(report.billing.total)}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        {report.extras.contentCount > 0 || report.extras.revisionCount > 0 ? (
                            <p className="text-xs text-muted-foreground">
                                Beyond your plan this month:{" "}
                                {[
                                    report.extras.contentCount > 0
                                        ? `${report.extras.contentCount} extra visual${report.extras.contentCount === 1 ? "" : "s"}`
                                        : "",
                                    report.extras.revisionCount > 0
                                        ? `${report.extras.revisionCount} extra revision${report.extras.revisionCount === 1 ? "" : "s"}`
                                        : "",
                                ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                . Your account manager will confirm any charge.
                            </p>
                        ) : null}
                    </section>
                ) : null}
            </article>
        </div>
    );
}
