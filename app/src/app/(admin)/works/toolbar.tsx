/**
 * The chrome the Tasks and My tasks pages share: the header (title, one-line
 * subtitle and an optional primary action) and the toolbar — the shared
 * FilterRow on the left, View (List · Board · Calendar) and Group dropdowns on
 * the right (Group only in the list view). Server components.
 */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { SelectNav } from "@/components/select-nav";
import { monthLabel } from "@/lib/works/helpers";
import { shiftMonth } from "@/lib/works/calendar";
import { FilterRow } from "./filter-bar";

export type TaskView = "list" | "board" | "calendar";

export function parseView(v: string): TaskView {
    return v === "board" || v === "calendar" ? v : "list";
}

export type GroupOption = { value: string; label: string };

export function TaskHeader({
    title,
    subtitle,
    action,
}: {
    title: ReactNode;
    subtitle: ReactNode;
    /** The primary button, top right. */
    action?: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
                <h1 className="text-2xl font-semibold md:text-3xl">{title}</h1>
                <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
            {action ? <div className="flex flex-wrap items-center gap-3">{action}</div> : null}
        </div>
    );
}

export function TaskToolbar({
    view,
    group,
    groups,
    href,
    ...filterRow
}: {
    view: TaskView;
    /** The current grouping; `groups[0]` is the page's default and travels without a `group` param. */
    group: string;
    groups: GroupOption[];
    /** This page with extra params changed (`undefined` drops one); the filter stays as it is. */
    href: (extra: Record<string, string | undefined>) => string;
} & ComponentProps<typeof FilterRow>) {
    // The calendar's month (`cm`) only means something in the calendar view.
    const viewOptions = [
        { value: "list", label: "List", href: href({ view: undefined, cm: undefined }) },
        { value: "board", label: "Board", href: href({ view: "board", cm: undefined }) },
        { value: "calendar", label: "Calendar", href: href({ view: "calendar" }) },
    ];
    const groupOptions = groups.map((g, i) => ({ ...g, href: href({ group: i === 0 ? undefined : g.value }) }));
    return (
        <div className="flex flex-wrap items-center justify-between gap-3">
            <FilterRow {...filterRow} />
            <div className="flex flex-wrap items-center gap-2">
                <SelectNav label="View" value={view} options={viewOptions} />
                {view === "list" ? <SelectNav label="Group" value={group} options={groupOptions} /> : null}
            </div>
        </div>
    );
}

/**
 * Prev · <month> · Next · Today above a calendar view, plus a one-line note.
 * `href` is the page's own link builder; the month travels in `?cm=`.
 */
export function CalendarNav({
    year,
    month,
    thisMonth,
    href,
    note,
}: {
    year: number;
    /** 0-based, as `parseMonth` returns it. */
    month: number;
    thisMonth: string;
    href: (extra: Record<string, string | undefined>) => string;
    note?: ReactNode;
}) {
    const ym = `${year}-${String(month + 1).padStart(2, "0")}`;
    return (
        <div className="flex flex-wrap items-center gap-1 text-xs">
            <Link href={href({ view: "calendar", cm: shiftMonth(year, month, -1) })} className="rounded-md border px-2 py-1 hover:bg-accent">
                Prev
            </Link>
            <span className="px-2 font-medium">{monthLabel(ym)}</span>
            <Link href={href({ view: "calendar", cm: shiftMonth(year, month, 1) })} className="rounded-md border px-2 py-1 hover:bg-accent">
                Next
            </Link>
            <Link href={href({ view: "calendar", cm: thisMonth })} className="ml-1 rounded-md border px-2 py-1 hover:bg-accent">
                Today
            </Link>
            {note ? <span className="ml-2 text-muted-foreground">{note}</span> : null}
        </div>
    );
}
