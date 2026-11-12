/**
 * The Sales tab's per-owner table: open deals and value, what each owner won
 * in the window, their win rate and how many of their deals are stuck. One
 * row per deal owner; a row with stuck deals links to the board to fix them.
 * Server component — no state.
 */
import Link from "next/link";
import type { OwnerStats } from "@/lib/dashboard/sales";
import { fmtMyrShort } from "@/lib/format";
import { cn } from "@/lib/utils";

const NUM = "px-2 py-1.5 text-right tabular-nums";

export function OwnerTable({ rows }: { rows: OwnerStats[] }) {
    return (
        <div className="-mx-2 overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                        <th className="px-2 py-1.5 text-left font-medium">Owner</th>
                        <th className={cn(NUM, "font-medium")}>Open</th>
                        <th className={cn(NUM, "font-medium")}>Open MYR</th>
                        <th className={cn(NUM, "font-medium")}>Won 90d</th>
                        <th className={cn(NUM, "font-medium")}>Win rate</th>
                        <th className={cn(NUM, "font-medium")}>Stuck</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {rows.map((r) => (
                        <tr key={r.name} className={cn(r.name === "Unassigned" && "text-muted-foreground")}>
                            <td className="px-2 py-1.5">
                                <Link href="/pipeline" className={cn("hover:underline", r.name === "Unassigned" ? "italic" : "font-medium")}>
                                    {r.name}
                                </Link>
                            </td>
                            <td className={NUM}>{r.open}</td>
                            <td className={NUM}>{r.openMyr > 0 ? fmtMyrShort(r.openMyr) : "—"}</td>
                            <td className={NUM} title={`${r.won90} won · ${r.lost90} lost`}>
                                {r.won90Myr > 0 ? fmtMyrShort(r.won90Myr) : r.won90 ? String(r.won90) : "—"}
                            </td>
                            <td className={cn(NUM, r.winRatePct !== null && r.winRatePct < 25 && "text-red-600 dark:text-red-400")}>
                                {r.winRatePct === null ? "—" : `${r.winRatePct}%`}
                            </td>
                            <td className={cn(NUM, r.stuck > 0 && "font-medium text-amber-700 dark:text-amber-400")}>{r.stuck || "—"}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
