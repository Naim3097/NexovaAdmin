/**
 * Billing tab (`?tab=money`): the contract value and how it is billed, the
 * invoices that bill this contract (one per month on a retainer), and the
 * billing settings. Summary amounts are short ("RM 54k"); invoice rows carry
 * the full amount.
 */
import Link from "next/link";
import { BILLING_CADENCES } from "@/lib/data/contracts";
import { computeTotals } from "@/lib/data/invoices";
import { monthLabel } from "@/lib/works/helpers";
import { createMonthInvoiceAction, linkInvoiceAction, saveBillingAction } from "@/lib/contracts/actions";
import { fmtMyrShort } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PendingButton } from "@/components/pending-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { cadenceLabel, fmtMyr } from "../../ui";
import { CARD, type ContractView } from "../shared";

export function MoneyTab({ v }: { v: ContractView }) {
    return (
        <>
            <section id="invoices" className="grid gap-4 lg:grid-cols-2">
                <Value v={v} />
                <Invoices v={v} />
            </section>
            <Billing v={v} />
        </>
    );
}

/** The value on the contract, what has been invoiced and paid against it, and what is still open. */
function Value({ v }: { v: ContractView }) {
    const { c, quotation, today, linkedInvoices, tabHref } = v;
    const total = (list: typeof linkedInvoices) => list.reduce((s, i) => s + computeTotals(i).total, 0);
    const invoiced = total(linkedInvoices);
    const paid = total(linkedInvoices.filter((i) => i.status === "paid"));
    const open = linkedInvoices.filter((i) => i.status === "sent" || i.status === "overdue");
    const outstanding = total(open);
    const overdue = total(open.filter((i) => i.status === "overdue" || i.dueDate < today));
    const left = c.valueMyr ? Math.max(0, c.valueMyr - invoiced) : null;
    const rows: Array<{ label: string; value: string; tone?: "bad" | "good" }> = [
        { label: "Invoiced", value: fmtMyrShort(invoiced) },
        { label: "Paid", value: fmtMyrShort(paid), tone: paid > 0 ? "good" : undefined },
        { label: "Unpaid", value: fmtMyrShort(outstanding), tone: overdue > 0 ? "bad" : undefined },
        ...(left !== null ? [{ label: "Still to invoice", value: fmtMyrShort(left) }] : []),
    ];
    return (
        <div className={CARD}>
            <h2 className="text-sm font-medium">Value</h2>
            <p className="mt-1 text-2xl font-semibold tabular-nums" title={c.valueMyr ? fmtMyr(c.valueMyr) : undefined}>
                {c.valueMyr ? fmtMyrShort(c.valueMyr) : <span className="text-base font-normal text-muted-foreground">no value set</span>}
            </p>
            <p className="text-xs text-muted-foreground">
                Billed {cadenceLabel(c.billing.cadence)}
                {c.billing.amountMyr ? ` · ${fmtMyrShort(c.billing.amountMyr)}` : ""}
                {c.billing.cadence === "monthly" ? ` · day ${c.billing.invoiceDay}` : ""}
                {quotation ? (
                    <>
                        {" · from quote "}
                        <Link href={`/quotes/${quotation.id}`} className="underline">
                            {quotation.number}
                        </Link>
                    </>
                ) : null}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3 text-sm sm:grid-cols-4">
                {rows.map((r) => (
                    <div key={r.label}>
                        <dt className="text-xs text-muted-foreground">{r.label}</dt>
                        <dd className={cn("font-medium tabular-nums", r.tone === "bad" && "text-red-600 dark:text-red-400", r.tone === "good" && "text-emerald-700 dark:text-emerald-400")}>
                            {r.value}
                        </dd>
                    </div>
                ))}
            </dl>
            {overdue > 0 ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">{fmtMyrShort(overdue)} is past its due date.</p> : null}
            <p className="mt-3 text-xs text-muted-foreground">
                The value and terms are set under{" "}
                <Link href={tabHref("setup")} className="underline">
                    Details
                </Link>
                ; the{" "}
                <Link href={`/contracts/${c.id}/document${v.asQ}`} className="underline">
                    Agreement
                </Link>{" "}
                sets it all out for the client.
            </p>
        </div>
    );
}

function Invoices({ v }: { v: ContractView }) {
    const { c, today, thisMonth, linkedInvoices, invoiceChecks, unlinkedClientInvoices } = v;
    const raiseLabel = `Raise invoice${c.billing.amountMyr ? ` · ${fmtMyrShort(c.billing.amountMyr)}` : ""}`;
    return (
        <div className={CARD}>
            <h2 className="text-sm font-medium">
                Invoices {c.billing.cadence === "monthly" ? "· one per month" : `· ${cadenceLabel(c.billing.cadence)}`}
            </h2>
            {linkedInvoices.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No invoices on this contract yet.</p>
            ) : (
                <ul className="mt-2 divide-y text-sm">
                    {linkedInvoices.map((i) => {
                        const overdue = i.status === "overdue" || (i.status === "sent" && i.dueDate < today);
                        return (
                            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                                <div>
                                    <Link href={`/invoices/${i.id}`} className="font-medium hover:underline">
                                        {i.number}
                                    </Link>{" "}
                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            i.status === "paid" && "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                                            overdue && "border-transparent bg-red-500/15 text-red-700 dark:text-red-400",
                                        )}
                                    >
                                        {overdue ? "overdue" : i.status}
                                    </Badge>
                                    <p className="text-xs text-muted-foreground tabular-nums">
                                        issued {i.issueDate} · due {i.dueDate}
                                        {i.paidAt ? ` · paid ${i.paidAt.slice(0, 10)}` : ""}
                                    </p>
                                </div>
                                <span className="tabular-nums">{fmtMyr(computeTotals(i).total)}</span>
                            </li>
                        );
                    })}
                </ul>
            )}

            {c.billing.cadence === "monthly" ? (
                <ul className="mt-3 divide-y border-t text-sm">
                    {invoiceChecks.map((x) => (
                        <li key={x.label} className="flex items-center justify-between gap-2 py-2">
                            <div>
                                <p className={cn("text-xs font-medium", !x.ok && x.urgent && "text-red-600 dark:text-red-400")}>
                                    {x.ok ? "✓" : x.urgent ? "✗" : "○"} {x.month ? monthLabel(x.month) : x.label}
                                </p>
                                <p className="text-xs text-muted-foreground">{x.detail}</p>
                            </div>
                            {x.ok ? (
                                x.month ? (
                                    <Link href={`/invoices/${linkedInvoices.find((i) => i.issueDate.startsWith(x.month!))?.id ?? ""}`} className="text-xs underline">
                                        open
                                    </Link>
                                ) : null
                            ) : x.month ? (
                                <form action={createMonthInvoiceAction}>
                                    <input type="hidden" name="id" value={c.id} />
                                    <input type="hidden" name="month" value={x.month} />
                                    {v.asField}
                                    <PendingButton size="sm" variant={x.urgent ? "default" : "outline"} pendingLabel="Raising…">
                                        {raiseLabel}
                                    </PendingButton>
                                </form>
                            ) : null}
                        </li>
                    ))}
                </ul>
            ) : null}

            <form action={linkInvoiceAction} className="mt-3 flex gap-2">
                <input type="hidden" name="id" value={c.id} />
                <Select name="invoiceId" defaultValue="none">
                    <SelectTrigger className="h-9 flex-1">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">Link an existing invoice…</SelectItem>
                        {unlinkedClientInvoices.map((i) => (
                            <SelectItem key={i.id} value={i.id}>
                                {i.number} · {i.issueDate} · {fmtMyr(computeTotals(i).total)} · {i.status}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button type="submit" size="sm" variant="outline">
                    Link
                </Button>
            </form>
            {c.billing.cadence !== "monthly" ? (
                <form action={createMonthInvoiceAction} className="mt-2">
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="month" value={thisMonth} />
                    {v.asField}
                    <Button type="submit" size="sm" variant="outline">
                        {raiseLabel}
                    </Button>
                </form>
            ) : null}
        </div>
    );
}

function Billing({ v }: { v: ContractView }) {
    const { c } = v;
    return (
        <section className={CARD}>
            <h2 className="text-sm font-medium">Billing · {cadenceLabel(c.billing.cadence)}</h2>
            <p className="text-xs text-muted-foreground">How often, how much per invoice, and the day of the month a monthly invoice goes out.</p>
            <form action={saveBillingAction} className="mt-3 grid max-w-xl grid-cols-3 gap-2">
                <input type="hidden" name="id" value={c.id} />
                <Select name="cadence" defaultValue={c.billing.cadence}>
                    <SelectTrigger className="h-9 w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {BILLING_CADENCES.map((b) => (
                            <SelectItem key={b} value={b}>
                                {cadenceLabel(b)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Input name="amountMyr" type="number" min={0} step={1} defaultValue={c.billing.amountMyr || ""} placeholder="MYR" />
                <div className="flex gap-2">
                    <Input name="invoiceDay" type="number" min={1} max={28} defaultValue={c.billing.invoiceDay} title="Invoice day of month" />
                    <Button type="submit" size="sm" variant="outline">
                        Save
                    </Button>
                </div>
            </form>
        </section>
    );
}
