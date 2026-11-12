/**
 * Contract tab (`?tab=money`): the agreement inside the project — the terms
 * on file (signed date, reference, signed copy, terms text), the contract
 * value and how it is billed, the invoices that bill this project (one per
 * month on a retainer, one for the lot on a one-off), the billing settings
 * (Monthly or One-off) and the project's costs (ad spend, freelancers,
 * software: anyone on the project adds one, only an admin deletes). Not shown
 * on an internal project. Summary amounts are short ("RM 54k"); invoice and
 * cost rows carry the full amount.
 */
import Link from "next/link";
import { BILLING_CADENCES } from "@/lib/data/contracts";
import { computeTotals } from "@/lib/data/invoices";
import { computeTotals as quoteTotals } from "@/lib/data/quotations";
import { monthLabel } from "@/lib/works/helpers";
import { addProjectCostAction, createMonthInvoiceAction, deleteProjectCostAction, linkInvoiceAction, saveBillingAction, saveTermsAction } from "@/lib/contracts/actions";
import { COST_KINDS, COST_KIND_LABEL, costsTotal, type CostKind } from "@/lib/contracts/costs";
import { isAdmin } from "@/lib/roles";
import { fmtMyr as fmtMyrExact, fmtMyrShort } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PendingButton } from "@/components/pending-button";
import { SaveButton } from "@/components/save-button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { cadenceLabel, cadenceOption, fmtMyr } from "../../ui";
import { CARD, SEL, type ContractView } from "../shared";

export function MoneyTab({ v }: { v: ContractView }) {
    return (
        <>
            <Terms v={v} />
            <section id="invoices" className="grid gap-4 scroll-mt-4 lg:grid-cols-2">
                <Value v={v} />
                <Invoices v={v} />
            </section>
            <Billing v={v} />
            <Costs v={v} />
        </>
    );
}

/**
 * The terms on file: signed or not, the setup checks (terms, signed, invoices),
 * and the form for the reference, quote, value, signed date / by / copy and the
 * terms text printed on the Agreement. The #terms id is a link target.
 */
function Terms({ v }: { v: ContractView }) {
    const { c, checks, invoiceChecks, clientQuotes, asField } = v;
    return (
        <section id="terms" className={cn(CARD, "scroll-mt-4")}>
            <h2 className="text-sm font-medium">
                Terms{" "}
                {c.signedAt ? (
                    <span className="text-emerald-700 dark:text-emerald-400">· signed {c.signedAt}</span>
                ) : (
                    <span className="text-red-600 dark:text-red-400">· not signed</span>
                )}
            </h2>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {checks
                    .filter((x) => x.key !== "invoice")
                    .map((x) => (
                        <li key={x.key} className={cn(!x.ok && x.urgent ? "text-red-600 dark:text-red-400" : x.ok ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
                            {x.ok ? "✓" : x.urgent ? "✗" : "○"} {x.label}
                            <span className="text-muted-foreground"> · {x.detail}</span>
                        </li>
                    ))}
                <li className={cn(invoiceChecks.some((x) => !x.ok && x.urgent) ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400")}>
                    {invoiceChecks.some((x) => !x.ok && x.urgent) ? "✗" : "✓"} Invoices
                    <span className="text-muted-foreground">
                        {" "}
                        · {invoiceChecks.filter((x) => x.ok).length}/{invoiceChecks.length} in place ·{" "}
                        <Link href={v.tabHref("money", {}, "#invoices")} className="underline">
                            see below
                        </Link>
                    </span>
                </li>
            </ul>

            <form action={saveTermsAction} className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
                <input type="hidden" name="id" value={c.id} />
                {asField}
                <div className="space-y-1.5">
                    <Label className="text-xs">Reference / contract no.</Label>
                    <Input name="reference" defaultValue={c.reference} placeholder="e.g. MSA-2026-04 or quote no." />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">From quote</Label>
                    <Select name="quotationId" defaultValue={c.quotationId ?? "none"}>
                        <SelectTrigger className="h-9 w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">— none —</SelectItem>
                            {clientQuotes.map((q) => (
                                <SelectItem key={q.id} value={q.id}>
                                    {q.number} · {q.status} · {fmtMyr(quoteTotals(q).total)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Contract value (MYR)</Label>
                    <Input name="valueMyr" type="number" min={0} step={1} defaultValue={c.valueMyr || ""} />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Signed on</Label>
                    <Input name="signedAt" type="date" defaultValue={c.signedAt ?? ""} />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Signed by</Label>
                    <Input name="signedBy" defaultValue={c.signedBy} placeholder="Client signatory" />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Signed copy link</Label>
                    <Input name="fileUrl" type="url" defaultValue={c.fileUrl} placeholder="https://drive…" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">Terms</Label>
                    <Textarea name="terms" rows={3} defaultValue={c.terms} placeholder="What the client is paying for, in a few lines. Printed on the Agreement." />
                </div>
                <div className="flex justify-end sm:col-span-2 lg:col-span-4">
                    <SaveButton label="Save terms" />
                </div>
            </form>
        </section>
    );
}

/** The value on the contract, what has been invoiced and paid against it, and what is still open. */
function Value({ v }: { v: ContractView }) {
    const { c, quotation, today, linkedInvoices } = v;
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
                The value and terms are set{" "}
                <Link href={v.tabHref("money", {}, "#terms")} className="underline">
                    above
                </Link>
                ; the{" "}
                <Link href={`/projects/${c.id}/document${v.asQ}`} className="underline">
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
                <p className="mt-2 text-xs text-muted-foreground">No invoices on this project yet.</p>
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
            <p className="text-xs text-muted-foreground">Monthly (one invoice a month, on the invoice day) or One-off (one invoice for the whole amount), how much per invoice, and the day of the month it goes out.</p>
            <form action={saveBillingAction} className="mt-3 grid max-w-xl grid-cols-3 gap-2">
                <input type="hidden" name="id" value={c.id} />
                <Select name="cadence" defaultValue={c.billing.cadence} items={BILLING_CADENCES.map((b) => ({ value: b, label: cadenceOption(b) }))}>
                    <SelectTrigger className="h-9 w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {BILLING_CADENCES.map((b) => (
                            <SelectItem key={b} value={b}>
                                {cadenceOption(b)}
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

const COST_KIND_CLASS: Record<CostKind, string> = {
    ad_spend: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
    freelancer: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
    software: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    other: "bg-muted text-muted-foreground",
};

/**
 * Money spent on the project besides people's time, newest first, with the
 * total and a one-line add form. Anyone who can open the project adds a row;
 * only an admin sees Remove (the action checks again). The #costs id is a
 * link target.
 */
function Costs({ v }: { v: ContractView }) {
    const { c, today, asField, member } = v;
    const canRemove = isAdmin(member);
    const total = costsTotal(c.costs);
    return (
        <section id="costs" className={cn(CARD, "scroll-mt-4")}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-medium">Costs</h2>
                {c.costs.length ? (
                    <p className="text-sm tabular-nums">
                        <span className="text-xs text-muted-foreground">Total </span>
                        <span className="font-semibold">{fmtMyrExact(total)}</span>
                    </p>
                ) : null}
            </div>
            <p className="text-xs text-muted-foreground">What this project costs besides people&apos;s time: ad spend paid for the client, freelancers, software.</p>

            {c.costs.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">No costs recorded yet.</p>
            ) : (
                <div className="-mx-4 mt-3 overflow-x-auto px-4 md:mx-0 md:px-0">
                    <table className="w-full min-w-[560px] text-sm">
                        <thead>
                            <tr className="border-b text-left text-xs text-muted-foreground">
                                <th className="py-1.5 pr-3 font-medium">Date</th>
                                <th className="py-1.5 pr-3 font-medium">What</th>
                                <th className="py-1.5 pr-3 font-medium">Kind</th>
                                <th className="py-1.5 pr-3 text-right font-medium">Amount</th>
                                <th className="py-1.5 pr-3 font-medium">Added by</th>
                                {canRemove ? <th className="py-1.5 font-medium" aria-label="Remove" /> : null}
                            </tr>
                        </thead>
                        <tbody>
                            {c.costs.map((x) => (
                                <tr key={x.id} className="border-b last:border-0">
                                    <td className="py-1.5 pr-3 text-xs tabular-nums text-muted-foreground">{x.date}</td>
                                    <td className="py-1.5 pr-3">{x.label || <span className="text-muted-foreground">—</span>}</td>
                                    <td className="py-1.5 pr-3">
                                        <Badge variant="outline" className={cn("border-transparent", COST_KIND_CLASS[x.kind])}>
                                            {COST_KIND_LABEL[x.kind]}
                                        </Badge>
                                    </td>
                                    <td className="py-1.5 pr-3 text-right tabular-nums">{fmtMyrExact(x.amountMyr)}</td>
                                    <td className="py-1.5 pr-3 text-xs text-muted-foreground">{x.addedBy || "—"}</td>
                                    {canRemove ? (
                                        <td className="py-1.5 text-right">
                                            <form action={deleteProjectCostAction}>
                                                <input type="hidden" name="id" value={c.id} />
                                                <input type="hidden" name="costId" value={x.id} />
                                                {asField}
                                                <PendingButton size="sm" variant="ghost" pendingLabel="Removing…" title={`Remove ${x.label || "this cost"}`}>
                                                    Remove
                                                </PendingButton>
                                            </form>
                                        </td>
                                    ) : null}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <form action={addProjectCostAction} className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_8rem_10rem_auto] lg:items-end">
                <input type="hidden" name="id" value={c.id} />
                {asField}
                <div className="space-y-1.5">
                    <Label className="text-xs">What</Label>
                    <Input name="label" required maxLength={120} placeholder="e.g. Meta ads, November" className="h-9" />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Kind</Label>
                    <select name="kind" defaultValue="ad_spend" className={SEL}>
                        {COST_KINDS.map((k) => (
                            <option key={k} value={k}>
                                {COST_KIND_LABEL[k]}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Amount (MYR)</Label>
                    <Input name="amountMyr" type="number" required min={0.01} step={0.01} placeholder="0.00" className="h-9" />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Date</Label>
                    <Input name="date" type="date" required defaultValue={today} className="h-9" />
                </div>
                <PendingButton size="sm" variant="outline" pendingLabel="Adding…" className="h-9">
                    Add cost
                </PendingButton>
            </form>
            <p className="mt-2 text-[11px] text-muted-foreground">Margin on the Money dashboard subtracts these and people&apos;s planned hours times their cost rate.</p>
        </section>
    );
}
