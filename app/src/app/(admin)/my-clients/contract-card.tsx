/**
 * One project on the My accounts page: who and where it stands, the same
 * health chips as the project header, and the one next move.
 */
import Link from "next/link";
import { CONTRACT_STAGE_LABEL } from "@/lib/data/contracts";
import { CONTRACT_ENDING_SOON_DAYS, endedDaysAgo, endsInDays } from "@/lib/contracts/helpers";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ClientCard } from "./derive";

const TONE: Record<ClientCard["action"]["tone"], string> = {
    bad: "text-red-600 dark:text-red-400",
    warn: "text-amber-700 dark:text-amber-400",
    ok: "text-emerald-700 dark:text-emerald-400",
};

export function ContractCard({ card, today, asQ }: { card: ClientCard; today: string; asQ: string }) {
    const { c, p, overdue, awaiting, nextMilestone, nextInvoice, invoiceOverdue, urgent, action, links } = card;
    const ended = endedDaysAgo(c, today);
    const endsIn = endsInDays(c, today);

    return (
        <li className={cn("rounded-lg border bg-card p-3 md:p-4", overdue > 0 && "border-red-500/40")}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <Link href={links.work} className="font-medium hover:underline">
                            {c.name}
                        </Link>
                        <Badge>{CONTRACT_STAGE_LABEL[c.stage]}</Badge>
                        {c.status === "draft" ? <Badge variant="outline">draft</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{c.clientName}</span> · {c.code} ·{" "}
                        <span className="tabular-nums">
                            {c.startDate || "—"}
                            {c.endDate ? ` → ${c.endDate}` : " → rolling"}
                        </span>
                        {ended !== null ? <span className="text-red-600 dark:text-red-400"> · ended {ended}d ago</span> : null}
                        {endsIn !== null && endsIn <= CONTRACT_ENDING_SOON_DAYS ? <span className="text-amber-700 dark:text-amber-400"> · ends in {endsIn}d</span> : null}
                    </p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                    <Link href={links.work} className="underline">
                        Tasks
                    </Link>
                    <Link href={links.document} className="underline">
                        Agreement
                    </Link>
                </div>
            </div>

            {/* Health strip — the project header's chips, same rules. */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <Link href={links.listOf({})}>
                    <Badge variant="outline" className="tabular-nums">
                        {p.done}/{p.total} tasks
                    </Badge>
                </Link>
                <Link href={links.listOf({ overdue: true })}>
                    <Badge variant={overdue > 0 ? "destructive" : "outline"} className="tabular-nums">
                        {overdue} overdue
                    </Badge>
                </Link>
                <Link href={links.listOf({ status: "pending_approval" })}>
                    <Badge variant="outline" className="tabular-nums">
                        {awaiting} in review
                    </Badge>
                </Link>
                {nextMilestone ? (
                    <Link href={`/works/${nextMilestone.id}${asQ}`}>
                        <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">
                            ◆ next milestone: {nextMilestone.title} · {nextMilestone.dueDate}
                        </Badge>
                    </Link>
                ) : null}
                {nextInvoice ? (
                    <Link href={`/invoices/${nextInvoice.id}`}>
                        <Badge variant={invoiceOverdue ? "destructive" : "outline"} className="tabular-nums">
                            next invoice: {nextInvoice.number} · due {nextInvoice.dueDate}
                            {invoiceOverdue ? " · overdue" : ""}
                        </Badge>
                    </Link>
                ) : null}
                {urgent.length > 0 ? (
                    <Link href={links.setup}>
                        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">{urgent.length} setup gap(s)</Badge>
                    </Link>
                ) : null}
            </div>

            {/* The one next move. */}
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-2 text-sm">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Next</span>
                <span className={cn("font-medium", TONE[action.tone])}>{action.text}</span>
                {action.cta ? (
                    <>
                        <span className="text-muted-foreground">→</span>
                        <Link href={action.href} className="underline">
                            {action.cta}
                        </Link>
                    </>
                ) : null}
            </div>
        </li>
    );
}
