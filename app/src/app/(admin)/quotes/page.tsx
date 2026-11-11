import Link from "next/link";
import { redirect } from "next/navigation";
import { getActingMember, requireTeamAccess } from "@/lib/auth";
import { hasFunction } from "@/lib/roles";
import { seesFinance } from "@/lib/scope";
import {
    QUOTATION_STATUSES,
    computeTotals,
    listQuotations,
    type QuotationStatus,
} from "@/lib/data/quotations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createQuotationAction } from "@/lib/quotations/actions";
import { fmtMyr, fmtMyrShort } from "@/lib/format";
import { NewButton, NewSection, newFormHref } from "@/components/new-button";

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

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<{ as?: string; new?: string }> }) {
    await requireTeamAccess();
    // Money pages: managers, finance and account managers.
    const member = await getActingMember();
    if (!seesFinance(member) && !hasFunction(member, "account_manager")) redirect("/home");
    const sp = await searchParams;
    const quotes = await listQuotations();
    const newHref = newFormHref("/quotes", { as: sp.as });

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
                        Quotes
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Prices for upcoming work; accept and turn one into an invoice in one click.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                    <div className="rounded-md border bg-card px-3 py-2">
                        Waiting on clients: <strong>{fmtMyrShort(outstanding)}</strong>
                    </div>
                    {acceptedOpen > 0 ? (
                        <div className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-primary">
                            {acceptedOpen} accepted · ready to invoice
                        </div>
                    ) : null}
                    <NewButton href={newHref}>+ New quote</NewButton>
                </div>
            </div>

            {/* Add form, folded until the button above opens it */}
            <NewSection open={sp.new === "1"} title="New quote">
                <form action={createQuotationAction} className="space-y-4">
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
            </NewSection>

            <div className="rounded-lg border bg-card">
                <div className="border-b p-4 text-sm font-medium">
                    All quotes ({quotes.length})
                </div>
                {quotes.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">
                        No quotes yet —{" "}
                        <Link href={newHref} className="underline">
                            create the first one
                        </Link>
                        .
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
