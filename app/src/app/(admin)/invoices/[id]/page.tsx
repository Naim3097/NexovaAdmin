import Link from "next/link";
import { notFound } from "next/navigation";
import {
    INVOICE_STATUSES,
    computeTotals,
    getInvoiceById,
} from "@/lib/data/invoices";
import { listProjects } from "@/lib/data/projects";
import { listServices } from "@/lib/data/services";
import {
    formatAddress,
    getAgencyProfile,
} from "@/lib/data/agency";
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
    addInvoiceItemAction,
    deleteInvoiceAction,
    deleteInvoiceItemAction,
    setInvoiceStatusAction,
    updateInvoiceAction,
} from "@/lib/invoices/actions";
import { PaymentSection } from "./payment-section";
import { ManualPaymentForm } from "./manual-payment-form";

export const dynamic = "force-dynamic";

function fmtMyr(n: number) {
    return `MYR ${n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

export default async function InvoiceDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const inv = await getInvoiceById(id);
    if (!inv) notFound();
    const projects = await listProjects();
    const agency = await getAgencyProfile();
    const totals = computeTotals(inv);
    const today = new Date().toISOString().slice(0, 10);
    const isOverdue = inv.status === "sent" && inv.dueDate < today;
    const agencyAddress = formatAddress(agency);

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/invoices"
                    className="text-sm text-muted-foreground hover:underline"
                >
                    Back to invoices
                </Link>
                <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <h1 className="text-2xl font-semibold md:text-3xl">
                        {inv.number}
                    </h1>
                    <div className="flex items-center gap-2">
                        <Badge
                            variant={isOverdue ? "destructive" : "secondary"}
                        >
                            {isOverdue ? "overdue" : inv.status}
                        </Badge>
                        <Link
                            href={`/invoices/${inv.id}/print`}
                            target="_blank"
                            rel="noopener"
                            className="text-sm text-muted-foreground hover:underline"
                        >
                            Print / PDF
                        </Link>
                    </div>
                </div>
                <p className="text-sm text-muted-foreground">
                    {inv.clientName}
                    {inv.projectId ? (
                        <>
                            {" · "}
                            <Link
                                href={`/projects/${inv.projectId}`}
                                className="underline"
                            >
                                project
                            </Link>
                        </>
                    ) : null}
                </p>
            </div>

            {/* Status pills */}
            <section className="rounded-lg border bg-card p-4 md:p-6">
                <h2 className="text-sm font-medium">Move to status</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                    {INVOICE_STATUSES.map((s) => (
                        <form key={s} action={setInvoiceStatusAction}>
                            <input type="hidden" name="id" value={inv.id} />
                            <input type="hidden" name="status" value={s} />
                            <Button
                                type="submit"
                                size="sm"
                                variant={inv.status === s ? "default" : "outline"}
                                disabled={inv.status === s}
                            >
                                {s}
                            </Button>
                        </form>
                    ))}
                </div>
                {inv.paidAt ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                        Paid on {new Date(inv.paidAt).toLocaleString()}
                    </p>
                ) : null}
            </section>

            {/* Manual payment (bank transfer / cheque / cash) — primary path for big clients */}
            <ManualPaymentForm
                invoiceId={inv.id}
                invoiceTotal={totals.total}
                isPaid={inv.status === "paid"}
            />

            {/* Online payment link (LeanX / FPX) — optional, for clients who want it */}
            <PaymentSection
                invoiceId={inv.id}
                paymentLink={inv.paymentLink}
                paymentExternalId={inv.paymentExternalId}
                paymentLinkCreatedAt={inv.paymentLinkCreatedAt}
                clientName={inv.clientName}
            />


            {/* Line items */}
            <section className="rounded-lg border bg-card p-4 md:p-6">
                <h2 className="text-sm font-medium">Line items</h2>

                <form
                    action={addInvoiceItemAction}
                    className="mt-3 grid gap-2 md:grid-cols-[1fr_90px_140px_auto] md:items-end"
                >
                    <input type="hidden" name="id" value={inv.id} />
                    <div className="space-y-1.5">
                        <Label className="text-sm">Description</Label>
                        <Input
                            name="description"
                            list="services-datalist"
                            required
                            placeholder="e.g. Website design — homepage"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Qty</Label>
                        <Input
                            name="quantity"
                            type="number"
                            min={1}
                            step={1}
                            defaultValue={1}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Unit (MYR)</Label>
                        <Input
                            name="unitPriceMyr"
                            type="number"
                            min={0}
                            step={0.01}
                            defaultValue={0}
                        />
                    </div>
                    <Button type="submit">Add</Button>
                </form>

                {inv.items.length === 0 ? (
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
                                {inv.items.map((it) => {
                                    const line = it.quantity * it.unitPriceMyr;
                                    return (
                                        <tr key={it.id}>
                                            <td className="py-2 pr-2">
                                                {it.description}
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
                                                    action={deleteInvoiceItemAction}
                                                    className="inline"
                                                >
                                                    <input
                                                        type="hidden"
                                                        name="id"
                                                        value={inv.id}
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
                                        Tax ({inv.taxRatePct}%)
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
                action={updateInvoiceAction}
                className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
            >
                <input type="hidden" name="id" value={inv.id} />
                <h2 className="text-sm font-medium">Details</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-sm">Client</Label>
                        <Input
                            name="clientName"
                            defaultValue={inv.clientName}
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Project</Label>
                        <Select
                            name="projectId"
                            defaultValue={inv.projectId ?? "none"}
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
                            defaultValue={inv.issueDate}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Due date</Label>
                        <Input
                            name="dueDate"
                            type="date"
                            defaultValue={inv.dueDate}
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
                            defaultValue={inv.taxRatePct}
                        />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-sm">Notes (visible on invoice)</Label>
                    <Textarea name="notes" defaultValue={inv.notes} rows={3} />
                </div>
                <div className="flex justify-end">
                    <Button type="submit">Save changes</Button>
                </div>
            </form>

            <section className="flex items-center justify-end rounded-lg border bg-card p-4 md:p-6">
                <form action={deleteInvoiceAction}>
                    <input type="hidden" name="id" value={inv.id} />
                    <Button type="submit" variant="destructive">
                        Delete invoice
                    </Button>
                </form>
            </section>

            {/* Issuer / payment / footer — pulled from agency profile */}
            <section className="rounded-lg border bg-card p-4 text-sm md:p-6">
                <div className="grid gap-6 md:grid-cols-3">
                    <div>
                        <h3 className="text-xs font-medium uppercase text-muted-foreground">
                            Issued by
                        </h3>
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
                        {(agency.email || agency.phone) ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                                {[agency.email, agency.phone]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </p>
                        ) : null}
                    </div>
                    <div>
                        <h3 className="text-xs font-medium uppercase text-muted-foreground">
                            Payment
                        </h3>
                        {agency.bankName ||
                            agency.bankAccountName ||
                            agency.bankAccountNo ? (
                            <>
                                <p className="mt-2">{agency.bankName}</p>
                                <p className="text-xs text-muted-foreground">
                                    {agency.bankAccountName}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {agency.bankAccountNo}
                                </p>
                            </>
                        ) : (
                            <p className="mt-2 text-xs text-muted-foreground">
                                No bank details set.{" "}
                                <Link
                                    href="/settings/agency"
                                    className="underline"
                                >
                                    Add in agency profile
                                </Link>
                                .
                            </p>
                        )}
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

            <HistoryPanel entity="invoice" entityId={inv.id} />

            <p className="text-xs text-muted-foreground">
                Created {new Date(inv.createdAt).toLocaleString()} · Last updated{" "}
                {new Date(inv.updatedAt).toLocaleString()}
            </p>
        </div>
    );
}
