/**
 * "This month across my accounts" — planned hours on my contracts by person,
 * so the account manager sees who is carrying their clients' work.
 */
import Link from "next/link";
import { fmtHours } from "@/lib/capacity/helpers";
import { monthLabel } from "@/lib/works/helpers";
import { cn } from "@/lib/utils";

export type LoadRow = {
    name: string;
    hours: number;
    tasks: number;
    /** An owner slot nobody holds yet ("(dm — unassigned)"). */
    unassigned: boolean;
    /** The Tasks list filtered to this person and month; "" when nobody holds the slot. */
    href: string;
};

export function MonthLoad({ month, rows }: { month: string; rows: LoadRow[] }) {
    const total = rows.reduce((s, r) => s + r.hours, 0);
    return (
        <section className="rounded-lg border bg-card p-3 md:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium">This month across my accounts</h2>
                <p className="text-xs text-muted-foreground">
                    {monthLabel(month)} · {fmtHours(total)} planned
                </p>
            </div>
            {rows.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No tasks planned this month.</p>
            ) : (
                <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    {rows.map((r) => {
                        const body = (
                            <>
                                <span className={cn("font-medium", r.unassigned && "italic text-muted-foreground")}>{r.name}</span>
                                <span className="tabular-nums text-muted-foreground">
                                    {" "}
                                    · {fmtHours(r.hours)} · {r.tasks} task{r.tasks === 1 ? "" : "s"}
                                </span>
                            </>
                        );
                        return (
                            <li key={r.name}>
                                {r.href ? (
                                    <Link href={r.href} className="inline-block rounded-md border bg-background px-2.5 py-1 hover:bg-accent">
                                        {body}
                                    </Link>
                                ) : (
                                    <span className="inline-block rounded-md border border-dashed px-2.5 py-1">{body}</span>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
