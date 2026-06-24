import Link from "next/link";
import { notFound } from "next/navigation";
import { computeTotals, getQuotationById } from "@/lib/data/quotations";
import {
    formatAddress,
    getAgencyProfile,
    resolveDocumentLogo,
} from "@/lib/data/agency";
import { PrintButton } from "@/app/(print)/invoices/[id]/print/print-button";

export const dynamic = "force-dynamic";

function fmtMyr(n: number): string {
    return `MYR ${n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

function fmtDate(iso: string): string {
    if (!iso) return "";
    return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export default async function QuotationPrintPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const quote = await getQuotationById(id);
    if (!quote) notFound();
    const agency = await getAgencyProfile();
    const totals = computeTotals(quote);
    const agencyAddress = formatAddress(agency);
    const logo = resolveDocumentLogo(quote.logoChoice, agency);
    const preparedForLines = quote.billToAddress
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    const toBullets = (s: string) =>
        s.split("\n").map((l) => l.trim()).filter(Boolean);
    const scopeLines = toBullets(quote.scopeIncludes);
    const exclusionLines = toBullets(quote.exclusions);
    const termsLines = toBullets(quote.terms);

    return (
        <>
            {/* Print-only stylesheet: hides chrome, A4 margins, clean page breaks. */}
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; }
                    @page { margin: 16mm; }
                    table { page-break-inside: auto; }
                    thead { display: table-header-group; }
                    tfoot { display: table-row-group; }
                    tr { page-break-inside: avoid; }
                    .avoid-break { page-break-inside: avoid; }
                    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            `}</style>

            {/* Action bar (screen only) */}
            <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-card px-6 py-3">
                <Link
                    href={`/quotes/${quote.id}`}
                    className="text-sm text-muted-foreground hover:underline"
                >
                    Back to quotation
                </Link>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>
                        Tip: use your browser&apos;s &ldquo;Print&rdquo; →
                        &ldquo;Save as PDF&rdquo; for a clean export.
                    </span>
                    <PrintButton />
                </div>
            </div>

            <div className="mx-auto max-w-3xl bg-white p-8 text-sm text-black md:p-12">
                {/* Header */}
                <div className="flex items-start justify-between gap-6 border-b pb-6">
                    <div className="min-w-0">
                        {logo ? (
                            <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={logo}
                                    alt={agency.displayName || "Logo"}
                                    className="mb-3 h-16 w-auto object-contain"
                                />
                            </>
                        ) : null}
                        <p className="text-2xl font-semibold">
                            {agency.legalName || agency.displayName || "Quotation"}
                        </p>
                        {agency.registrationNo ? (
                            <p className="text-xs text-neutral-600">
                                Reg. {agency.registrationNo}
                            </p>
                        ) : null}
                        {agency.sstNo ? (
                            <p className="text-xs text-neutral-600">
                                SST {agency.sstNo}
                            </p>
                        ) : null}
                        {agencyAddress ? (
                            <p className="mt-2 text-xs text-neutral-600">
                                {agencyAddress}
                            </p>
                        ) : null}
                        {agency.email || agency.phone ? (
                            <p className="text-xs text-neutral-600">
                                {[agency.email, agency.phone]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </p>
                        ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                        <p className="text-xs uppercase tracking-wide text-neutral-500">
                            Quotation
                        </p>
                        <p className="whitespace-nowrap text-xl font-semibold">
                            {quote.number}
                        </p>
                        <p className="mt-2 whitespace-nowrap text-xs text-neutral-600">
                            Issue date: {fmtDate(quote.issueDate)}
                        </p>
                        <p className="whitespace-nowrap text-xs text-neutral-600">
                            Valid until: {fmtDate(quote.validUntil)}
                        </p>
                    </div>
                </div>

                {/* Quote for */}
                <div className="mt-6">
                    <p className="text-xs uppercase tracking-wide text-neutral-500">
                        Prepared for
                    </p>
                    <p className="mt-1 font-medium">{quote.clientName}</p>
                    {preparedForLines.length > 0 ? (
                        <div className="mt-0.5 text-sm text-neutral-700">
                            {preparedForLines.map((l, i) => (
                                <p key={i}>{l}</p>
                            ))}
                        </div>
                    ) : null}
                </div>

                {/* Subject / project title */}
                {quote.subject ? (
                    <div className="mt-6">
                        <p className="text-xs uppercase tracking-wide text-neutral-500">
                            Project
                        </p>
                        <p className="mt-1 text-base font-semibold">
                            {quote.subject}
                        </p>
                    </div>
                ) : null}

                {/* Items */}
                <table className="mt-8 w-full text-sm">
                    <thead className="border-b text-left text-xs uppercase tracking-wide text-neutral-500">
                        <tr>
                            <th className="pb-2 pr-4 font-medium">Description</th>
                            <th className="pb-2 pr-4 text-right font-medium">
                                Qty
                            </th>
                            <th className="pb-2 pr-4 text-right font-medium">
                                Unit (MYR)
                            </th>
                            <th className="pb-2 text-right font-medium">
                                Line total
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {quote.items.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={4}
                                    className="py-6 text-center text-neutral-500"
                                >
                                    No line items.
                                </td>
                            </tr>
                        ) : (
                            quote.items.map((it) => {
                                const line =
                                    (it.quantity || 0) * (it.unitPriceMyr || 0);
                                const bullets = it.details
                                    .split("\n")
                                    .map((b) => b.trim())
                                    .filter(Boolean);
                                return (
                                    <tr
                                        key={it.id}
                                        className="border-b align-top"
                                    >
                                        <td className="py-2 pr-4">
                                            {it.description}
                                            {bullets.length > 0 ? (
                                                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-neutral-600">
                                                    {bullets.map((b, bi) => (
                                                        <li key={bi}>{b}</li>
                                                    ))}
                                                </ul>
                                            ) : null}
                                        </td>
                                        <td className="py-2 pr-4 text-right">
                                            {it.quantity}
                                        </td>
                                        <td className="whitespace-nowrap py-2 pr-4 text-right">
                                            {it.unitPriceMyr.toLocaleString(
                                                undefined,
                                                {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                },
                                            )}
                                        </td>
                                        <td className="whitespace-nowrap py-2 text-right">
                                            {fmtMyr(line)}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td
                                colSpan={3}
                                className="py-2 pr-4 text-right text-neutral-600"
                            >
                                Subtotal
                            </td>
                            <td className="whitespace-nowrap py-2 text-right text-neutral-600">
                                {fmtMyr(totals.subtotal)}
                            </td>
                        </tr>
                        <tr>
                            <td
                                colSpan={3}
                                className="py-1 pr-4 text-right text-neutral-600"
                            >
                                Tax ({quote.taxRatePct}%)
                            </td>
                            <td className="whitespace-nowrap py-1 text-right text-neutral-600">
                                {fmtMyr(totals.tax)}
                            </td>
                        </tr>
                        <tr className="border-t">
                            <td
                                colSpan={3}
                                className="py-2 pr-4 text-right font-semibold"
                            >
                                Total
                            </td>
                            <td className="whitespace-nowrap py-2 text-right text-base font-semibold">
                                {fmtMyr(totals.total)}
                            </td>
                        </tr>
                    </tfoot>
                </table>

                {/* Scope includes */}
                {scopeLines.length > 0 ? (
                    <div className="avoid-break mt-8">
                        <p className="text-xs uppercase tracking-wide text-neutral-500">
                            Scope includes
                        </p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-neutral-700">
                            {scopeLines.map((l, i) => (
                                <li key={i}>{l}</li>
                            ))}
                        </ul>
                    </div>
                ) : null}

                {/* Exclusions */}
                {exclusionLines.length > 0 ? (
                    <div className="avoid-break mt-6">
                        <p className="text-xs uppercase tracking-wide text-neutral-500">
                            Exclusions
                        </p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-neutral-700">
                            {exclusionLines.map((l, i) => (
                                <li key={i}>{l}</li>
                            ))}
                        </ul>
                    </div>
                ) : null}

                {/* Notes */}
                {quote.notes ? (
                    <div className="avoid-break mt-8">
                        <p className="text-xs uppercase tracking-wide text-neutral-500">
                            Notes
                        </p>
                        <p className="mt-1 whitespace-pre-line text-sm">
                            {quote.notes}
                        </p>
                    </div>
                ) : null}

                {/* Payment details (when filled on the quote) */}
                {quote.paymentDetails.trim() ? (
                    <div className="avoid-break mt-8 rounded border bg-neutral-50 p-4">
                        <p className="text-xs uppercase tracking-wide text-neutral-500">
                            Payment details
                        </p>
                        <p className="mt-1 whitespace-pre-line text-sm text-neutral-700">
                            {quote.paymentDetails}
                        </p>
                    </div>
                ) : null}

                {/* Terms & Conditions */}
                {termsLines.length > 0 ? (
                    <div className="avoid-break mt-8">
                        <p className="text-xs uppercase tracking-wide text-neutral-500">
                            Terms &amp; Conditions
                        </p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-neutral-700">
                            {termsLines.map((l, i) => (
                                <li key={i}>{l}</li>
                            ))}
                        </ul>
                    </div>
                ) : null}

                {/* Validity note */}
                <p className="mt-8 text-xs text-neutral-500">
                    This quotation is valid until {fmtDate(quote.validUntil)}.
                    Prices are quoted in MYR and subject to the terms above.
                </p>

                {/* Acceptance / signature block */}
                {quote.showAcceptance ? (
                    <div className="avoid-break mt-8 border-t pt-4">
                        <p className="text-xs uppercase tracking-wide text-neutral-500">
                            Acceptance
                        </p>
                        <p className="mt-1 text-xs text-neutral-600">
                            Accepted by, for and on behalf of the client:
                        </p>
                        <div className="mt-3 space-y-3.5 text-sm text-neutral-800">
                            {[
                                "Name",
                                "Designation",
                                "Company",
                                "Signature & Company Stamp",
                                "Date",
                            ].map((label) => (
                                <div
                                    key={label}
                                    className="flex items-end gap-2"
                                >
                                    <span className="w-44 shrink-0 text-xs text-neutral-600">
                                        {label}
                                    </span>
                                    <span className="flex-1 border-b border-dotted border-neutral-400">
                                        &nbsp;
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {/* Footer */}
                {agency.invoiceFooter ? (
                    <p className="mt-10 border-t pt-4 text-center text-xs text-neutral-500 whitespace-pre-line">
                        {agency.invoiceFooter}
                    </p>
                ) : null}
            </div>
        </>
    );
}
