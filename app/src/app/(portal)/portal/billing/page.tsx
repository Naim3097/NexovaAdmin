import { getCurrentClient } from "@/lib/auth";
import { buildClientMonthlyReport } from "@/lib/reports";
import { computeTotals, listInvoices } from "@/lib/data/invoices";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

function currentMonth() {
    return new Date().toISOString().slice(0, 7);
}
function fmtMyr(n: number) {
    return `MYR ${n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

export default async function PortalBillingPage() {
    const client = await getCurrentClient();
    if (!client) {
        return (
            <div className="space-y-2">
                <h1 className="text-2xl font-semibold">Billing</h1>
                <p className="text-sm text-muted-foreground">
                    This account isn&apos;t linked to a client workspace yet.
                </p>
            </div>
        );
    }

    const month = currentMonth();
    const [report, allInvoices] = await Promise.all([
        buildClientMonthlyReport(client.name, month),
        listInvoices(),
    ]);
    const myInvoices = allInvoices
        .filter(
            (i) =>
                i.clientName.trim().toLowerCase() ===
                    client.name.trim().toLowerCase() &&
                // Only invoices the agency has issued — never drafts.
                i.status !== "draft" &&
                i.status !== "void",
        )
        .sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));

    const { billing, extras } = report;

    return (
        <div className="space-y-6">
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; }
                    @page { margin: 16mm; }
                    [data-card] { break-inside: avoid; }
                    tr, li { break-inside: avoid; }
                }
            `}</style>
            <div className="flex items-start justify-between gap-2">
                <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {client.name}
                    </p>
                    <h1 className="text-2xl font-semibold">Billing</h1>
                </div>
                <div className="no-print">
                    <PrintButton />
                </div>
            </div>

            {/* This month */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                        This month
                        {billing.packageName
                            ? ` · ${billing.packageName}`
                            : ""}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                    <Row
                        label={`Monthly retainer (${billing.deliveredContents}/${billing.includedContents} contents delivered)`}
                        value={fmtMyr(billing.retainer)}
                    />
                    {extras.contentCount > 0 ? (
                        <Row
                            label={`Extra content × ${extras.contentCount}`}
                            value={fmtMyr(extras.contentCharge)}
                        />
                    ) : null}
                    {extras.revisionCount > 0 ? (
                        <Row
                            label={`Extra revisions × ${extras.revisionCount}`}
                            value={fmtMyr(extras.revisionCharge)}
                        />
                    ) : null}
                    <div className="mt-1 flex items-center justify-between border-t pt-1 font-semibold">
                        <span>Estimated total</span>
                        <span>{fmtMyr(billing.total)}</span>
                    </div>
                    <p className="pt-1 text-xs text-muted-foreground">
                        An estimate for {month}. Your formal invoice appears below
                        once issued.
                    </p>
                </CardContent>
            </Card>

            {/* Invoices */}
            <div>
                <h2 className="mb-3 text-sm font-medium">
                    Invoices ({myInvoices.length})
                </h2>
                {myInvoices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No invoices yet.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {myInvoices.map((inv) => {
                            const t = computeTotals(inv);
                            return (
                                <Card key={inv.id}>
                                    <CardHeader className="pb-2">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <CardTitle className="text-sm">
                                                {inv.number}
                                            </CardTitle>
                                            <Badge
                                                variant={
                                                    inv.status === "paid"
                                                        ? "default"
                                                        : inv.status ===
                                                            "overdue"
                                                          ? "destructive"
                                                          : "secondary"
                                                }
                                            >
                                                {inv.status}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Issued {inv.issueDate} · due{" "}
                                            {inv.dueDate}
                                        </p>
                                    </CardHeader>
                                    <CardContent className="text-sm">
                                        <ul className="divide-y">
                                            {inv.items.map((it) => (
                                                <li
                                                    key={it.id}
                                                    className="flex items-center justify-between gap-2 py-1.5"
                                                >
                                                    <span>
                                                        {it.description}
                                                        {it.quantity > 1
                                                            ? ` × ${it.quantity}`
                                                            : ""}
                                                    </span>
                                                    <span className="shrink-0">
                                                        {fmtMyr(
                                                            it.quantity *
                                                                it.unitPriceMyr,
                                                        )}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                        <div className="mt-2 flex items-center justify-between border-t pt-2 font-semibold">
                                            <span>Total</span>
                                            <span>{fmtMyr(t.total)}</span>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{label}</span>
            <span>{value}</span>
        </div>
    );
}
