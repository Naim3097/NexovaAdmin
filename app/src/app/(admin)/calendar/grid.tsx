/**
 * The month grid + the same month as a list (phone-friendly). Server component,
 * shared by the overall calendar and the per-contract calendar view.
 */
import Link from "next/link";
import { WORK_DAYS, WORK_DAY_LABEL, isOffDay } from "@/lib/capacity/helpers";
import { WEEKDAYS, buildGrid, isoDate, type CalendarItem } from "@/lib/works/calendar";
import { monthLabel } from "@/lib/works/helpers";
import { cn } from "@/lib/utils";

/** WEEKDAYS starts on Monday (getDay() 1); true for the Fri–Sun columns. */
const OFF_COLUMN = WEEKDAYS.map((_, i) => !WORK_DAYS.includes((i + 1) % 7));
const OFF_TITLE = `Off day — the working week is ${WORK_DAY_LABEL}. Tasks due here still count as off-day work.`;

export function CalendarGrid({
    year,
    month,
    items,
    today,
    compact = false,
}: {
    year: number;
    month: number;
    items: CalendarItem[];
    today: string;
    /** Shorter cells, for embedding inside another page. */
    compact?: boolean;
}) {
    const ym = `${year}-${String(month + 1).padStart(2, "0")}`;
    const days = buildGrid(year, month);
    const byDate = new Map<string, CalendarItem[]>();
    for (const it of items) {
        if (!it.date) continue;
        byDate.set(it.date, [...(byDate.get(it.date) ?? []), it]);
    }
    const monthItems = items.filter((it) => it.date.startsWith(ym)).sort((a, b) => a.date.localeCompare(b.date));
    const perCell = compact ? 3 : 4;

    return (
        <div className="space-y-4">
            <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
                <div className="min-w-[900px] rounded-lg border bg-card md:min-w-0">
                    <div className="grid grid-cols-7 border-b text-xs font-medium text-muted-foreground">
                        {WEEKDAYS.map((d, i) => (
                            <div key={d} className={cn("px-2 py-1.5 leading-tight", OFF_COLUMN[i] && "bg-muted/40")} title={OFF_COLUMN[i] ? OFF_TITLE : undefined}>
                                {d}
                                {OFF_COLUMN[i] ? <span className="block text-[10px] font-normal text-muted-foreground/70">off</span> : null}
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7">
                        {days.map((d) => {
                            const iso = isoDate(d);
                            const inMonth = d.getMonth() === month;
                            const isToday = iso === today;
                            const off = isOffDay(iso);
                            const dayItems = byDate.get(iso) ?? [];
                            return (
                                <div
                                    key={iso}
                                    className={cn(
                                        "border-b border-r p-2 last:border-r-0",
                                        compact ? "min-h-20" : "min-h-28",
                                        // Off days (Fri–Sun) sit a shade back; days outside the month a shade further.
                                        !inMonth ? (off ? "bg-muted/50" : "bg-muted/30") : off ? "bg-muted/40" : "",
                                    )}
                                    title={off ? OFF_TITLE : undefined}
                                >
                                    <div className="flex items-center justify-between">
                                        <span
                                            className={cn(
                                                "text-xs",
                                                isToday
                                                    ? "rounded-full bg-primary px-2 py-0.5 font-medium text-primary-foreground"
                                                    : "text-muted-foreground",
                                            )}
                                        >
                                            {d.getDate()}
                                        </span>
                                        {dayItems.length > perCell ? (
                                            <span className="text-[10px] text-muted-foreground">{dayItems.length}</span>
                                        ) : null}
                                    </div>
                                    <ul className="mt-1 space-y-1">
                                        {dayItems.slice(0, perCell).map((it) => (
                                            <li key={it.key}>
                                                <Link
                                                    href={it.href}
                                                    className="flex items-start gap-1 text-[11px] leading-tight hover:underline"
                                                    title={`${it.label} — ${it.sub}`}
                                                >
                                                    <span className={cn("mt-1 inline-block size-1.5 shrink-0 rounded-full", it.dot)} />
                                                    <span
                                                        className={cn(
                                                            "truncate",
                                                            it.overdue && "font-medium text-red-600 dark:text-red-400",
                                                            it.kind === "waiting" && "text-amber-700 dark:text-amber-400",
                                                        )}
                                                    >
                                                        {it.label}
                                                    </span>
                                                </Link>
                                            </li>
                                        ))}
                                        {dayItems.length > perCell ? (
                                            <li className="text-[10px] text-muted-foreground">+{dayItems.length - perCell} more</li>
                                        ) : null}
                                    </ul>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <section className="rounded-lg border bg-card">
                <div className="border-b p-3 text-sm font-medium">
                    {monthLabel(ym)} as a list · {monthItems.length} item{monthItems.length === 1 ? "" : "s"}
                </div>
                {monthItems.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">Nothing scheduled in this scope.</p>
                ) : (
                    <ul className="divide-y text-sm">
                        {monthItems.map((it) => (
                            <li key={it.key} className="flex items-start gap-3 p-3">
                                <span
                                    className={cn(
                                        "w-20 shrink-0 text-xs tabular-nums",
                                        it.overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground",
                                    )}
                                >
                                    {it.date.slice(5)}
                                    {it.date === today ? " · today" : ""}
                                    {isOffDay(it.date) ? (
                                        <span className="block text-[10px] text-muted-foreground" title={OFF_TITLE}>
                                            off day
                                        </span>
                                    ) : null}
                                </span>
                                <span className={cn("mt-1.5 inline-block size-2 shrink-0 rounded-full", it.dot)} />
                                <div className="min-w-0">
                                    <Link
                                        href={it.href}
                                        className={cn("font-medium hover:underline", it.kind === "waiting" && "text-amber-700 dark:text-amber-400")}
                                    >
                                        {it.label}
                                    </Link>
                                    <p className="text-xs text-muted-foreground">{it.sub}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
