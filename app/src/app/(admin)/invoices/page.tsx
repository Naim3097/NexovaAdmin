import Link from "next/link";
import { redirect } from "next/navigation";
import { getActingMember, requireTeamAccess } from "@/lib/auth";
import { hasFunction } from "@/lib/roles";
import { seesFinance } from "@/lib/scope";
import {
    INVOICE_STATUSES,
    computeTotals,
    listInvoices,
    type InvoiceStatus,
} from "@/lib/data/invoices";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createInvoiceAction } from "@/lib/invoices/actions";
import { fmtMyr, fmtMyrShort } from "@/lib/format";
import { RetainerRunButton } from "./retainer-run-button";
import { NewButton, NewSection, newFormHref } from "@/components/new-button";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<
    InvoiceStatus,
    "default" | "secondary" | "destructive" | "outline"
> = {
    draft: "secondary",
    sent: "outline",
    paid: "default",
    overdue: "destructive",
    void: "outline",
};

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ as?: string; new?: string }> }) {
    await requireTeamAccess();
    // Money pages: managers, finance and account managers.
    const member = await getActingMember();
    if (!seesFinance(member) && !hasFunction(member, "account_manager")) redirect("/home");
    const sp = await searchParams;
    const invoices = await listInvoices();
    const newHref = newFormHref("/invoices", { as: sp.as });

    const today = new Date().toISOString().slice(0, 10);
    const arOpen = invoices
        .filter((i) => i.status === "sent" || i.status === "overdue")
        .reduce((sum, i) => sum + computeTotals(i).total, 0);
    const overdueCount = invoices.filter(
        (i) => i.status === "sent" && i.dueDate < today,
    ).length;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">Invoices</h1>
                    <p className="text-sm text-muted-foreground">
                        Monthly run: draft retainers on the 1st, send all by the 3rd.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                    <RetainerRunButton />
                    <div className="rounded-md border bg-card px-3 py-2">
                        Unpaid: <strong>{fmtMyrShort(arOpen)}</strong>
                    </div>
                    {overdueCount > 0 ? (
                        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive">
                            {overdueCount} overdue
                        </div>
                    ) : null}
                    <NewButton href={newHref}>+ New invoice</NewButton>
                </div>
            </div>

            {/* Add form, folded until the button above opens it */}
            <NewSection open={sp.new === "1"} title="New invoice">
                <form action={createInvoiceAction} className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label className="text-sm">Client</Label>
                            <Input name="clientName" list="clients-datalist" required placeholder="Lean.x Sdn Bhd" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Issue date</Label>
                            <Input name="issueDate" type="date" defaultValue={today} />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Due date</Label>
                            <Input name="dueDate" type="date" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Tax rate %</Label>
                            <Input
                                name="taxRatePct"
                                type="number"
                                min={0}
                                max={100}
                                step={0.5}
                                defaultValue={6}
                            />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <Button type="submit">Create draft</Button>
                    </div>
                </form>
            </NewSection>

            <div className="rounded-lg border bg-card">
                <div className="border-b p-4 text-sm font-medium">
                    All invoices ({invoices.length})
                </div>
                {invoices.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">
                        No invoices yet —{" "}
                        <Link href={newHref} className="underline">
                            create the first one
                        </Link>
                        .
                    </p>
                ) : (
                    <ul className="divide-y">
                        {invoices.map((i) => {
                            const totals = computeTotals(i);
                            const isOverdue =
                                i.status === "sent" && i.dueDate < today;
                            return (
                                <li
                                    key={i.id}
                                    className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
                                >
                                    <div className="min-w-0 flex-1">
                                        <Link
                                            href={`/invoices/${i.id}`}
                                            className="font-medium hover:underline"
                                        >
                                            {i.number}
                                        </Link>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {i.clientName} · Due {i.dueDate}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm">
                                            {fmtMyr(totals.total)}
                                        </span>
                                        <Badge
                                            variant={
                                                isOverdue
                                                    ? "destructive"
                                                    : STATUS_VARIANT[i.status]
                                            }
                                        >
                                            {isOverdue ? "overdue" : i.status}
                                        </Badge>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
                <div className="border-t p-3 text-xs text-muted-foreground">
                    Statuses: {INVOICE_STATUSES.join(" · ")}
                </div>
            </div>
        </div>
    );
}
