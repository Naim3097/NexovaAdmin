/**
 * One line above the board: a chip per deal owner with their open deals and
 * value, how many are stuck and what they won this month. The numbers come
 * from the same maths as the Dashboard's Sales tab, so the two always agree.
 * Server component — no state.
 */
import { STUCK_DAYS, type OwnerStats } from "@/lib/dashboard/sales";
import { fmtMyrShort } from "@/lib/format";
import { cn } from "@/lib/utils";

export function OwnerStrip({ owners }: { owners: OwnerStats[] }) {
    if (owners.length === 0) return null;
    return (
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
            <ul className="flex min-w-max gap-2 text-xs" aria-label="Deal owners">
                {owners.map((o) => {
                    const unassigned = o.name === "Unassigned";
                    return (
                        <li
                            key={o.name}
                            className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border bg-card px-2.5 py-1.5 tabular-nums", unassigned && "border-dashed text-muted-foreground")}
                            title={`${o.name}: ${o.open} open · ${fmtMyrShort(o.openMyr)} · ${o.stuck} stuck (no touch ${STUCK_DAYS}d+) · ${fmtMyrShort(o.wonMonthMyr)} won this month`}
                        >
                            <span className={cn(unassigned ? "italic" : "font-medium")}>{o.name}</span>
                            <Dot />
                            <span>{o.open} open</span>
                            <Dot />
                            <span>{fmtMyrShort(o.openMyr)}</span>
                            <Dot />
                            <span className={cn(o.stuck > 0 && "font-medium text-amber-700 dark:text-amber-400")}>{o.stuck} stuck</span>
                            <Dot />
                            <span className={cn(o.wonMonthMyr > 0 && "text-emerald-700 dark:text-emerald-400")}>{fmtMyrShort(o.wonMonthMyr)} won</span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

function Dot() {
    return <span className="text-muted-foreground/60">·</span>;
}
