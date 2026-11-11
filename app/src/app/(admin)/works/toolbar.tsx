/**
 * The chrome the Tasks and My tasks pages share: the header (title, one-line
 * subtitle, the Website · Other tasks · Calendar links and an optional primary
 * action) and the toolbar — the shared FilterRow on the left, View and Group
 * dropdowns on the right (Group only in the list view). Server components.
 */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { SelectNav } from "@/components/select-nav";
import { FilterRow } from "./filter-bar";

export type TaskView = "list" | "board";

export function parseView(v: string): TaskView {
    return v === "board" ? "board" : "list";
}

export type GroupOption = { value: string; label: string };

export function TaskHeader({
    title,
    subtitle,
    asQ,
    calendarHref,
    action,
}: {
    title: ReactNode;
    subtitle: ReactNode;
    /** `?as=…` for the Website / Other tasks links ("" with a real login). */
    asQ: string;
    calendarHref: string;
    /** The primary button, top right. */
    action?: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
                <h1 className="text-2xl font-semibold md:text-3xl">{title}</h1>
                <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-wrap gap-3 text-sm font-medium">
                    <Link href={`/website${asQ}`} className="underline">
                        Website
                    </Link>
                    <Link href={`/custom-tasks${asQ}`} className="underline">
                        Other tasks
                    </Link>
                    <Link href={calendarHref} className="underline">
                        Calendar
                    </Link>
                </div>
                {action}
            </div>
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
    const viewOptions = [
        { value: "list", label: "List", href: href({ view: undefined }) },
        { value: "board", label: "Board", href: href({ view: "board" }) },
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
