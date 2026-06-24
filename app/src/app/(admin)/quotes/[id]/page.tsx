import Link from "next/link";
import { notFound } from "next/navigation";
import {
    computeTotals,
    getQuotationById,
    type QuotationStatus,
} from "@/lib/data/quotations";
import { getInvoiceById } from "@/lib/data/invoices";
import { listProjects } from "@/lib/data/projects";
import { listServices } from "@/lib/data/services";
import {
    formatAddress,
    getAgencyProfile,
    resolveDocumentLogo,
} from "@/lib/data/agency";
import { LineItemForm } from "@/components/line-item-form";
import { DocumentOverrideFields } from "@/components/document-override-fields";
import { Badge } from "@/components/ui/badge";
import { HistoryPanel } from "@/components/history-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    addQuotationItemAction,
    convertQuotationToInvoiceAction,
    deleteQuotationAction,
    deleteQuotationItemAction,
    setQuotationStatusAction,
    updateQuotationAction,
} from "@/lib/quotations/actions";

export const dynamic = "force-dynamic";

// Statuses the user can move to by hand. "converted" is set only by the
// convert action and is terminal, so it's excluded from the manual pills.
const MANUAL_STATUSES: QuotationStatus[] = [
    "draft",
    "sent",
    "accepted",
    "declined",
    "expired",
];

function fmtMyr(n: number) {
    return `MYR ${n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

export default async function QuotationDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const quote = await getQuotationById(id);
    if (!quote) notFound();
    const [projects, services, agency] = await Promise.all([
        listProjects(),
        listServices(),
        getAgencyProfile(),
    ]);
    const serviceOptions = services
        .filter((s) => s.active)
        .map((s) => ({
            id: s.id,
            name: s.name,
            details: s.details,
            defaultPrice: s.defaultPrice,
        }));
    const totals = computeTotals(quote);
    const today = new Date().toISOString().slice(0, 10);
    const isExpired = quote.status === "sent" && quote.validUntil < today;
    const agencyAddress = formatAddress(agency);
    const isConverted = quote.status === "converted";
    const convertedInvoice = quote.convertedInvoiceId
        ? await getInvoiceById(quote.convertedInvoiceId)
        : null;

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/quotes"
                    className="text-sm text-muted-foreground hover:underline"
                >
                    Back to quotations
                </Link>
                <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <h1 className="text-2xl font-semibold md:text-3xl">
                        {quote.number}
                    </h1>
                    <div className="flex items-center gap-2">
                        <Badge variant={isExpired ? "outline" : "secondary"}>
                            {isExpired ? "expired" : quote.status}
                        </Badge>
                        <Link
                            href={`/quotes/${quote.id}/print`}
                            target="_blank"
                            rel="noopener"
                            className="text-sm text-muted-foreground hover:underline"
                        >
                            Print / PDF
                        </Link>
                    </div>
                </div>
                <p className="text-sm text-muted-foreground">
                    {quote.clientName}
                    {quote.projectId ? (
                        <>
                            {" · "}
                            <Link
                                href={`/projects/${quote.projectId}`}
                                className="underline"
                            >
                                project
                            </Link>
                        </>
                    ) : null}
                </p>
                {quote.subject ? (
                    <p className="mt-1 text-sm font-medium">{quote.subject}</p>
                ) : null}
            </div>

            {/* Convert to invoice — the QuickBooks "Estimate → Invoice" move */}
            <section className="rounded-lg border bg-card p-4 md:p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-sm font-medium">Convert to invoice</h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {isConverted
                                ? "This quotation has been converted."
                                : "Copies the client, tax rate, and all line items into a new draft invoice."}
                        </p>
                    </div>
                    {isConverted && convertedInvoice ? (
                        <Link
                            href={`/invoices/${convertedInvoice.id}`}
                            className="text-sm font-medium text-primary hover:underline"
                        >
                            View invoice {convertedInvoice.number} →
                        </Link>
                    ) : (
                        <form action={convertQuotationToInvoiceAction}>
                            <input type="hidden" name="id" value={quote.id} />
                            <Button
                                type="submit"
                                disabled={quote.items.length === 0}
                            >
                                Convert to invoice
                            </Button>
                        </form>
                    )}
                </div>
            </section>

            {/* Status pills */}
            {!isConverted ? (
                <section className="rounded-lg border bg-card p-4 md:p-6">
                    <h2 className="text-sm font-medium">Move to status</h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {MANUAL_STATUSES.map((s) => (
                            <form key={s} action={setQuotationStatusAction}>
                                <input type="hidden" name="id" value={quote.id} />
                                <input type="hidden" name="status" value={s} />
                                <Button
                                    type="submit"
                                    size="sm"
                                    variant={
                                        quote.status === s ? "default" : "outline"
                                    }
                                    disabled={quote.status === s}
                                >
                                    {s}
                                </Button>
                            </form>
                        ))}
                    </div>
                    {quote.acceptedAt ? (
                        <p className="mt-3 text-xs text-muted-foreground">
                            Accepted on{" "}
                            {new Date(quote.acceptedAt).toLocaleString()}
                        </p>
                    ) : null}
                </section>
            ) : null}

            {/* Line items */}
            <section className="rounded-lg border bg-card p-4 md:p-6">
                <h2 className="text-sm font-medium">Line items</h2>

                <LineItemForm
                    docId={quote.id}
                    services={serviceOptions}
                    action={addQuotationItemAction}
                />

                {quote.items.length === 0 ? (
                    <p className="mt-4 text-sm text-muted-foreground">
                        No line items yet.
                    </p>
                ) : (
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-left text-xs text-muted-foreground">
                                <tr>
                                    <th className="py-2">Description</th>
                                    <th className="py-2 text-right">Qty</th>
                                    <th className="py-2 text-right">Unit</th>
                                    <th className="py-2 text-right">Line total</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {quote.items.map((it) => {
                                    const line = it.quantity * it.unitPriceMyr;
                                    const bullets = it.details
                                        .split("\n")
                                        .map((b) => b.trim())
                                        .filter(Boolean);
                                    return (
                                        <tr key={it.id}>
                                            <td className="py-2 pr-2">
                                                {it.description}
                                                {bullets.length > 0 ? (
                                                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                                                        {bullets.map((b, bi) => (
                                                            <li key={bi}>{b}</li>
                                                        ))}
                                                    </ul>
                                                ) : null}
                                            </td>
                                            <td className="py-2 pr-2 text-right">
                                                {it.quantity}
                                            </td>
                                            <td className="py-2 pr-2 text-right">
                                                {fmtMyr(it.unitPriceMyr)}
                                            </td>
                                            <td className="py-2 pr-2 text-right">
                                                {fmtMyr(line)}
                                            </td>
                                            <td className="py-2 text-right">
                                                <form
                                                    action={
                                                        deleteQuotationItemAction
                                                    }
                                                    className="inline"
                                                >
                                                    <input
                                                        type="hidden"
                                                        name="id"
                                                        value={quote.id}
                                                    />
                                                    <input
                                                        type="hidden"
                                                        name="itemId"
                                                        value={it.id}
                                                    />
                                                    <Button
                                                        type="submit"
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 text-xs text-muted-foreground"
                                                    >
                                                        Remove
                                                    </Button>
                                                </form>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="border-t text-sm">
                                <tr>
                                    <td colSpan={3} className="py-2 text-right text-muted-foreground">
                                        Subtotal
                                    </td>
                                    <td className="py-2 text-right">
                                        {fmtMyr(totals.subtotal)}
                                    </td>
                                    <td />
                                </tr>
                                <tr>
                                    <td colSpan={3} className="py-1 text-right text-muted-foreground">
                                        Tax ({quote.taxRatePct}%)
                                    </td>
                                    <td className="py-1 text-right">
                                        {fmtMyr(totals.tax)}
                                    </td>
                                    <td />
                                </tr>
                                <tr>
                                    <td colSpan={3} className="py-2 text-right font-medium">
                                        Total
                                    </td>
                                    <td className="py-2 text-right font-semibold">
                                        {fmtMyr(totals.total)}
                                    </td>
                                    <td />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </section>

            {/* Edit details */}
            <form
                action={updateQuotationAction}
                className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
            >
                <input type="hidden" name="id" value={quote.id} />
                <h2 className="text-sm font-medium">Details</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-sm">Client</Label>
                        <Input
                            name="clientName"
                            defaultValue={quote.clientName}
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Project</Label>
                        <Select
                            name="projectId"
                            defaultValue={quote.projectId ?? "none"}
                        >
                            <SelectTrigger className="h-10">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">— None —</SelectItem>
                                {projects.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                        {p.name} ({p.clientName})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Issue date</Label>
                        <Input
                            name="issueDate"
                            type="date"
                            defaultValue={quote.issueDate}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Valid until</Label>
                        <Input
                            name="validUntil"
                            type="date"
                            defaultValue={quote.validUntil}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Tax rate %</Label>
                        <Input
                            name="taxRatePct"
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            defaultValue={quote.taxRatePct}
                        />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-sm">Notes (visible on quotation)</Label>
                    <Textarea name="notes" defaultValue={quote.notes} rows={3} />
                </div>

                <div className="border-t pt-4">
                    <h3 className="mb-3 text-sm font-medium">
                        Prepared for · logo · payment
                    </h3>
                    <div className="space-y-4">
                        <DocumentOverrideFields
                            billToAddress={quote.billToAddress}
                            paymentDetails={quote.paymentDetails}
                            logoChoice={quote.logoChoice}
                            logos={agency.logos}
                            addressLabel="Prepared for — address"
                        />
                    </div>
                </div>

                <div className="space-y-4 border-t pt-4">
                    <h3 className="text-sm font-medium">Document sections</h3>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Subject / project title</Label>
                        <Input
                            name="subject"
                            defaultValue={quote.subject}
                            placeholder="Website Enhancement & Backend Optimization"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">
                            Scope includes (one per line)
                        </Label>
                        <Textarea
                            name="scopeIncludes"
                            rows={4}
                            defaultValue={quote.scopeIncludes}
                            placeholder={"Content & layout revisions for up to 10 existing pages\nBackend configuration adjustments\nTesting and deployment of approved changes"}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Exclusions (one per line)</Label>
                        <Textarea
                            name="exclusions"
                            rows={4}
                            defaultValue={quote.exclusions}
                            placeholder={"New page creation\nCustom plugin or software development\nThird-party subscriptions / licensing fees\nStock photos, premium plugins, paid assets"}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">
                            Terms &amp; Conditions (one per line) · pre-filled from
                            Settings → Agency
                        </Label>
                        <Textarea
                            name="terms"
                            rows={4}
                            defaultValue={quote.terms}
                            placeholder={"This quotation is valid for 30 days from the date of issue.\nAny work outside the stated scope may incur additional charges.\nAll pricing is in Malaysian Ringgit (MYR)."}
                        />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            name="showAcceptance"
                            defaultChecked={quote.showAcceptance}
                            className="size-4 rounded border-input"
                        />
                        Show acceptance / signature block on the PDF
                    </label>
                </div>

                <div className="flex justify-end">
                    <Button type="submit">Save changes</Button>
                </div>
            </form>

            <section className="flex items-center justify-end rounded-lg border bg-card p-4 md:p-6">
                <form action={deleteQuotationAction}>
                    <input type="hidden" name="id" value={quote.id} />
                    <Button type="submit" variant="destructive">
                        Delete quotation
                    </Button>
                </form>
            </section>

            {/* Issuer / footer — pulled from agency profile */}
            <section className="rounded-lg border bg-card p-4 text-sm md:p-6">
                <div className="grid gap-6 md:grid-cols-2">
                    <div>
                        <h3 className="text-xs font-medium uppercase text-muted-foreground">
                            Issued by
                        </h3>
                        {resolveDocumentLogo(quote.logoChoice, agency) ? (
                            <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={resolveDocumentLogo(quote.logoChoice, agency)}
                                    alt="Logo"
                                    className="mt-2 h-10 w-auto object-contain"
                                />
                            </>
                        ) : null}
                        <p className="mt-2 font-medium">
                            {agency.legalName || agency.displayName}
                        </p>
                        {agency.registrationNo ? (
                            <p className="text-xs text-muted-foreground">
                                Reg. {agency.registrationNo}
                            </p>
                        ) : null}
                        {agency.sstNo ? (
                            <p className="text-xs text-muted-foreground">
                                SST {agency.sstNo}
                            </p>
                        ) : null}
                        {agencyAddress ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                                {agencyAddress}
                            </p>
                        ) : null}
                        {agency.email || agency.phone ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                                {[agency.email, agency.phone]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </p>
                        ) : null}
                    </div>
                    <div>
                        <h3 className="text-xs font-medium uppercase text-muted-foreground">
                            Footer
                        </h3>
                        <p className="mt-2 text-xs text-muted-foreground whitespace-pre-line">
                            {agency.invoiceFooter}
                        </p>
                    </div>
                </div>
            </section>

            <HistoryPanel entity="quotation" entityId={quote.id} />

            <p className="text-xs text-muted-foreground">
                Created {new Date(quote.createdAt).toLocaleString()} · Last updated{" "}
                {new Date(quote.updatedAt).toLocaleString()}
            </p>
        </div>
    );
}
