import Link from "next/link";
import { notFound } from "next/navigation";
import { computeTotals, getInvoiceById } from "@/lib/data/invoices";
import {
    formatAddress,
    getAgencyProfile,
} from "@/lib/data/agency";
import { PrintButton } from "./print-button";

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

export default async function InvoicePrintPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const inv = await getInvoiceById(id);
    if (!inv) notFound();
    const agency = await getAgencyProfile();
    const totals = computeTotals(inv);
    const agencyAddress = formatAddress(agency);

    return (
        <>
            {/* Print-only stylesheet: hides chrome, sets A4-ish margin. */}
            {/* eslint-disable-next-line @next/next/no-css-tags */}
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; }
                    @page { margin: 18mm; }
                }
            `}</style>

            {/* Action bar (screen only) */}
            <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-card px-6 py-3">
                <Link
                    href={`/invoices/${inv.id}`}
                    className="text-sm text-muted-foreground hover:underline"
                >
                    Back to invoice
                </Link>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Tip: use your browser&apos;s &ldquo;Print&rdquo; → &ldquo;Save as PDF&rdquo; for a clean export.</span>
                    <PrintButton />
                </div>
            </div>

            <div className="mx-auto max-w-3xl bg-white p-8 text-sm text-black md:p-12">
                {/* Header */}
                <div className="flex items-start justify-between gap-6 border-b pb-6">
                    <div>
                        <p className="text-2xl font-semibold">
                            {agency.legalName || agency.displayName || "Invoice"}
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
                        {(agency.email || agency.phone) ? (
                            <p className="text-xs text-neutral-600">
                                {[agency.email, agency.phone]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </p>
                        ) : null}
                    </div>
                    <div className="text-right">
                        <p className="text-xs uppercase tracking-wide text-neutral-500">
                            Invoice
                        </p>
                        <p className="text-xl font-semibold">{inv.number}</p>
                        <p className="mt-2 text-xs text-neutral-600">
                            Issue date: {fmtDate(inv.issueDate)}
                        </p>
                        <p className="text-xs text-neutral-600">
                            Due date: {fmtDate(inv.dueDate)}
                        </p>
                        {inv.paidAt ? (
                            <p className="mt-1 text-xs font-medium text-emerald-700">
                                PAID {fmtDate(inv.paidAt.slice(0, 10))}
                            </p>
                        ) : null}
                    </div>
                </div>

                {/* Bill to */}
                <div className="mt-6">
                    <p className="text-xs uppercase tracking-wide text-neutral-500">
                        Bill to
                    </p>
                    <p className="mt-1 font-medium">{inv.clientName}</p>
                </div>

                {/* Items */}
                <table className="mt-8 w-full text-sm">
                    <thead className="border-b text-left text-xs uppercase tracking-wide text-neutral-500">
                        <tr>
                            <th className="pb-2 pr-4 font-medium">
                                Description
                            </th>
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
                        {inv.items.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={4}
                                    className="py-6 text-center text-neutral-500"
                                >
                                    No line items.
                                </td>
                            </tr>
                        ) : (
                            inv.items.map((it) => {
                                const line =
                                    (it.quantity || 0) *
                                    (it.unitPriceMyr || 0);
                                return (
                                    <tr
                                        key={it.id}
                                        className="border-b align-top"
                                    >
                                        <td className="py-2 pr-4">
                                            {it.description}
                                        </td>
                                        <td className="py-2 pr-4 text-right">
                                            {it.quantity}
                                        </td>
                                        <td className="py-2 pr-4 text-right">
                                            {it.unitPriceMyr.toLocaleString(
                                                undefined,
                                                {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                },
                                            )}
                                        </td>
                                        <td className="py-2 text-right">
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
                            <td className="py-2 text-right">
                                {fmtMyr(totals.subtotal)}
                            </td>
                        </tr>
                        <tr>
                            <td
                                colSpan={3}
                                className="py-1 pr-4 text-right text-neutral-600"
                            >
                                Tax ({inv.taxRatePct}%)
                            </td>
                            <td className="py-1 text-right">
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
                            <td className="py-2 text-right text-base font-semibold">
                                {fmtMyr(totals.total)}
                            </td>
                        </tr>
                    </tfoot>
                </table>

                {/* Notes */}
                {inv.notes ? (
                    <div className="mt-8">
                        <p className="text-xs uppercase tracking-wide text-neutral-500">
                            Notes
                        </p>
                        <p className="mt-1 whitespace-pre-line text-sm">
                            {inv.notes}
                        </p>
                    </div>
                ) : null}

                {/* Bank */}
                {agency.bankName ||
                    agency.bankAccountName ||
                    agency.bankAccountNo ? (
                    <div className="mt-8 rounded border bg-neutral-50 p-4">
                        <p className="text-xs uppercase tracking-wide text-neutral-500">
                            Payment details
                        </p>
                        <p className="mt-1 font-medium">{agency.bankName}</p>
                        <p className="text-xs text-neutral-700">
                            {agency.bankAccountName}
                        </p>
                        <p className="text-xs text-neutral-700">
                            {agency.bankAccountNo}
                        </p>
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
