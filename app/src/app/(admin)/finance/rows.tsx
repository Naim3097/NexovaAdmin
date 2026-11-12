/**
 * Row lists for the Finance home. Server components — no state.
 */
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { dueLabel, type ContractRow, type InvoiceRow } from "@/lib/management/finance";
import { cn } from "@/lib/utils";
import { Chip, Empty, fmtMyr } from "@/app/(admin)/management/ui";

export type InvoiceMode = "overdue" | "due_soon" | "draft" | "receipt";

function timing(r: InvoiceRow, mode: InvoiceMode): { text: string; tone: string } {
    if (mode === "receipt") return { text: `paid ${r.paidAt}`, tone: "text-emerald-700 dark:text-emerald-400" };
    if (mode === "draft") {
        return r.daysLate > 0
            ? { text: `due ${r.dueDate} · ${r.daysLate}d past the schedule date`, tone: "font-medium text-red-600 dark:text-red-400" }
            : { text: `due ${r.dueDate} · ${dueLabel(r.daysLate)}`, tone: r.daysLate >= -7 ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground" };
    }
    if (r.daysLate > 0) return { text: `${r.daysLate}d late · was due ${r.dueDate}`, tone: "font-medium text-red-600 dark:text-red-400" };
    return { text: `due ${r.dueDate} · ${dueLabel(r.daysLate)}`, tone: r.daysLate >= -3 ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground" };
}

export function InvoiceRows({ rows, mode, empty }: { rows: InvoiceRow[]; mode: InvoiceMode; empty: string }) {
    if (rows.length === 0) return <Empty>{empty}</Empty>;
    return (
        <ul className="divide-y">
            {rows.map((r) => {
                const t = timing(r, mode);
                return (
                    <li key={r.id} className="grid gap-1 py-2.5 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_auto] md:items-center">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <Link href={r.href} className="text-sm font-medium hover:underline">
                                    {r.number}
                                </Link>
                                <span className="text-sm">{r.clientName}</span>
                                {r.contractId ? (
                                    <Link href={`/projects/${r.contractId}`} className="text-xs text-muted-foreground underline">
                                        {r.contractCode}
                                    </Link>
                                ) : (
                                    <Chip tone="neutral">no contract</Chip>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground">issued {r.issueDate}</p>
                        </div>
                        <p className={cn("text-xs tabular-nums", t.tone)}>{t.text}</p>
                        <p className="text-sm font-medium tabular-nums md:text-right">{fmtMyr(r.totalMyr)}</p>
                        <Link href={r.href} className="text-xs underline md:text-right">
                            {mode === "draft" ? "issue" : mode === "receipt" ? "open" : "chase"}
                        </Link>
                    </li>
                );
            })}
        </ul>
    );
}

export function ContractRows({ rows, empty, renewal = false }: { rows: ContractRow[]; empty: string; renewal?: boolean }) {
    if (rows.length === 0) return <Empty>{empty}</Empty>;
    return (
        <ul className="divide-y">
            {rows.map((c) => (
                <li key={c.id} className="grid gap-1 py-2.5 md:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_auto] md:items-center">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Link href={c.href} className="text-sm font-medium hover:underline">
                                {c.name}
                            </Link>
                            <span className="text-xs text-muted-foreground">{c.code}</span>
                            <Badge variant={c.status === "active" ? "default" : "outline"}>{c.status}</Badge>
                            {!c.signed && c.status === "active" ? <Chip tone="bad">unsigned</Chip> : null}
                            {renewal ? (
                                c.hasRenewal ? <Chip tone="good">renewal on file</Chip> : <Chip tone="warn">no renewal yet</Chip>
                            ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {c.clientName}
                            {c.accountManager ? ` · Account manager ${c.accountManager}` : ""}
                            {c.amountMyr ? ` · ${fmtMyr(c.amountMyr)}/${c.cadence === "monthly" ? "mo" : c.cadence.replace(/_/g, " ")}` : ""}
                            {c.valueMyr ? ` · value ${fmtMyr(c.valueMyr)}` : ""}
                        </p>
                    </div>
                    <p className={cn("text-xs", renewal && !c.hasRenewal && (c.endsInDays ?? 99) <= 30 ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
                        {c.note}
                    </p>
                    <Link href={c.href} className="text-xs underline md:text-right">
                        {renewal ? "open contract" : c.status === "draft" ? "open draft" : "set up"}
                    </Link>
                </li>
            ))}
        </ul>
    );
}
