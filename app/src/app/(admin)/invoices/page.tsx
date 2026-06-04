import Link from "next/link";
import {
    INVOICE_STATUSES,
    computeTotals,
    listInvoices,
    type InvoiceStatus,
} from "@/lib/data/invoices";
import { listProjects } from "@/lib/data/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { createInvoiceAction } from "@/lib/invoices/actions";

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

function fmtMyr(n: number) {
    return `MYR ${n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

export default async function InvoicesPage() {
    const [invoices, projects] = await Promise.all([
        listInvoices(),
        listProjects(),
    ]);

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
                        Local-only for now. Lean.x / Stripe integration is on hold.
                    </p>
                </div>
                <div className="flex gap-3 text-sm">
                    <div className="rounded-md border bg-card px-3 py-2">
                        AR open: <strong>{fmtMyr(arOpen)}</strong>
                    </div>
                    {overdueCount > 0 ? (
                        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive">
                            {overdueCount} overdue
                        </div>
                    ) : null}
                </div>
            </div>

            <form
                action={createInvoiceAction}
                className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
            >
                <h2 className="text-sm font-medium">New invoice</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-sm">Client</Label>
                        <Input name="clientName" list="clients-datalist" required placeholder="Lean.x Sdn Bhd" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Project (optional)</Label>
                        <Select name="projectId" defaultValue="none">
                            <SelectTrigger className="h-11">
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

            <div className="rounded-lg border bg-card">
                <div className="border-b p-4 text-sm font-medium">
                    All invoices ({invoices.length})
                </div>
                {invoices.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">
                        No invoices yet. Create one above.
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
