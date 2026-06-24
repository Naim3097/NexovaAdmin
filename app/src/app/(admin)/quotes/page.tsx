import Link from "next/link";
import {
    QUOTATION_STATUSES,
    computeTotals,
    listQuotations,
    type QuotationStatus,
} from "@/lib/data/quotations";
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
import { createQuotationAction } from "@/lib/quotations/actions";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<
    QuotationStatus,
    "default" | "secondary" | "destructive" | "outline"
> = {
    draft: "secondary",
    sent: "outline",
    accepted: "default",
    declined: "destructive",
    expired: "outline",
    converted: "default",
};

function fmtMyr(n: number) {
    return `MYR ${n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

export default async function QuotationsPage() {
    const [quotes, projects] = await Promise.all([
        listQuotations(),
        listProjects(),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    // Outstanding = quotes awaiting a decision (sent and not yet expired).
    const outstanding = quotes
        .filter((q) => q.status === "sent" && q.validUntil >= today)
        .reduce((sum, q) => sum + computeTotals(q).total, 0);
    const acceptedOpen = quotes.filter(
        (q) => q.status === "accepted",
    ).length;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">
                        Quotations
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Estimates for prospective work. Accept &amp; convert into an
                        invoice in one click.
                    </p>
                </div>
                <div className="flex gap-3 text-sm">
                    <div className="rounded-md border bg-card px-3 py-2">
                        Outstanding: <strong>{fmtMyr(outstanding)}</strong>
                    </div>
                    {acceptedOpen > 0 ? (
                        <div className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-primary">
                            {acceptedOpen} accepted · ready to invoice
                        </div>
                    ) : null}
                </div>
            </div>

            <form
                action={createQuotationAction}
                className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
            >
                <h2 className="text-sm font-medium">New quotation</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-sm">Client</Label>
                        <Input
                            name="clientName"
                            list="clients-datalist"
                            required
                            placeholder="Acme Sdn Bhd"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Project (optional)</Label>
                        <Select name="projectId" defaultValue="none">
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
                        <Input name="issueDate" type="date" defaultValue={today} />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Valid until</Label>
                        <Input name="validUntil" type="date" />
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
                    All quotations ({quotes.length})
                </div>
                {quotes.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">
                        No quotations yet. Create one above.
                    </p>
                ) : (
                    <ul className="divide-y">
                        {quotes.map((q) => {
                            const totals = computeTotals(q);
                            const isExpired =
                                q.status === "sent" && q.validUntil < today;
                            return (
                                <li
                                    key={q.id}
                                    className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
                                >
                                    <div className="min-w-0 flex-1">
                                        <Link
                                            href={`/quotes/${q.id}`}
                                            className="font-medium hover:underline"
                                        >
                                            {q.number}
                                        </Link>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {q.clientName} · Valid until{" "}
                                            {q.validUntil}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm">
                                            {fmtMyr(totals.total)}
                                        </span>
                                        <Badge
                                            variant={
                                                isExpired
                                                    ? "outline"
                                                    : STATUS_VARIANT[q.status]
                                            }
                                        >
                                            {isExpired ? "expired" : q.status}
                                        </Badge>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
                <div className="border-t p-3 text-xs text-muted-foreground">
                    Statuses: {QUOTATION_STATUSES.join(" · ")}
                </div>
            </div>
        </div>
    );
}
