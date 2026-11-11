/**
 * The filter row every task view shares: a one-click "Me" toggle (the
 * viewer's own tasks, plus what waits on them) and one dropdown per filter —
 * Month, Phase, Status, Owner, Type, Client, AM — each a link list, so the
 * filter stays in the URL and a filtered view can be shared. Server
 * component; only the dropdown itself (SelectNav) runs on the client.
 */
import Link from "next/link";
import { SelectNav, type SelectNavOption } from "@/components/select-nav";
import { LINE_TYPES, type LineType } from "@/lib/data/planners";
import { TASK_STATUSES } from "@/lib/data/works";
import { OPEN_STATUS, filterQuery, isFiltered, type WorkFilter } from "@/lib/works/filter";
import { TASK_STATUS_LABEL, monthLabel } from "@/lib/works/helpers";
import { cn } from "@/lib/utils";

/** Short, everyday type names for a dropdown. */
const TYPE_LABEL: Record<LineType, string> = {
    post: "Post",
    campaign: "Campaign",
    seo: "SEO article",
    website: "Website",
    branding: "Branding",
    custom: "Other",
};

/** `values` plus the current pick when it is not among them (an inactive member, a phase key from a link …). */
function withCurrent(values: string[], current: string): string[] {
    return current && !values.includes(current) ? [...values, current] : values;
}

export function FilterRow({
    basePath,
    filter,
    me,
    members,
    months,
    phases = [],
    clients = [],
    ams = [],
    types = LINE_TYPES,
    keep = {},
    anchor = "",
    compact = false,
}: {
    /** Page path the dropdowns navigate within, e.g. "/works" or "/contracts/abc". */
    basePath: string;
    filter: WorkFilter;
    /** The viewer (linked member or the acting-as pick). "" hides the Me toggle. */
    me: string;
    members: string[];
    /** Months to offer; [] hides the Month dropdown (the calendar has its own month nav). */
    months: string[];
    phases?: string[];
    clients?: string[];
    ams?: string[];
    /** Types to offer; a page that shows one type (Website, Other tasks) passes just that one and the dropdown hides. */
    types?: readonly LineType[];
    /** Extra params the page keeps across the filter (view, group, as …). */
    keep?: Record<string, string | undefined>;
    /** "#works" to land back on a section. */
    anchor?: string;
    /** Tighter row for embedding in a section header. */
    compact?: boolean;
}) {
    const href = (f: Partial<WorkFilter>) => `${basePath}${filterQuery(f, keep)}${anchor}`;
    const meOnly = Boolean(me) && filter.member === me;

    /** "Any" + one option per value; each option links to the current filter with that one field changed. */
    const pick = (set: (v: string) => Partial<WorkFilter>, values: string[], label: (v: string) => string, any: string): SelectNavOption[] => [
        { value: "", label: any, href: href({ ...filter, ...set("") }) },
        ...values.map((v) => ({ value: v, label: label(v), href: href({ ...filter, ...set(v) }) })),
    ];

    // Status folds the old Open / Overdue / Awaiting chips into one dropdown.
    const statusValue = filter.overdue ? "overdue" : filter.status || (filter.approval ? "pending_approval" : "");
    const statusOptions: SelectNavOption[] = [
        { value: "", label: "Any", href: href({ ...filter, status: "", overdue: false, approval: false }) },
        ...TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABEL[s], href: href({ ...filter, status: s, overdue: false, approval: false }) })),
        { value: OPEN_STATUS, label: "Open", href: href({ ...filter, status: OPEN_STATUS, overdue: false, approval: false }) },
        { value: "overdue", label: "Overdue", href: href({ ...filter, status: "", overdue: true, approval: false }) },
    ];

    return (
        <div className={cn("flex flex-wrap items-center text-xs", compact ? "gap-1.5" : "gap-2")}>
            {me ? (
                <Link
                    href={meOnly ? href({ ...filter, member: "" }) : href({ ...filter, member: me })}
                    className={cn(
                        "inline-flex h-8 items-center rounded-md border px-3 font-medium shadow-xs",
                        meOnly ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
                    )}
                    title={meOnly ? "Showing only your tasks — click to see everyone" : "Show only your tasks"}
                >
                    Me
                </Link>
            ) : null}
            {months.length ? <SelectNav label="Month" value={filter.month} options={pick((month) => ({ month }), withCurrent(months, filter.month), monthLabel, "Any")} /> : null}
            {phases.length || filter.phase ? (
                <SelectNav label="Phase" value={filter.phase} options={pick((phase) => ({ phase }), withCurrent(phases, filter.phase), (p) => p, "Any")} />
            ) : null}
            <SelectNav label="Status" value={statusValue} options={statusOptions} />
            {members.length || filter.member ? (
                <SelectNav label="Owner" value={filter.member} options={pick((member) => ({ member }), withCurrent(members, filter.member), (m) => m, "Everyone")} />
            ) : null}
            {types.length > 1 ? <SelectNav label="Type" value={filter.type} options={pick((type) => ({ type }), [...types], (t) => TYPE_LABEL[t as LineType] ?? t, "Any")} /> : null}
            {clients.length || filter.client ? (
                <SelectNav label="Client" value={filter.client} options={pick((client) => ({ client }), withCurrent(clients, filter.client), (c) => c, "Any")} />
            ) : null}
            {ams.length || filter.am ? <SelectNav label="AM" value={filter.am} options={pick((am) => ({ am }), withCurrent(ams, filter.am), (a) => a, "Any")} /> : null}
            {isFiltered(filter) ? (
                <Link href={href({})} className="px-1 text-muted-foreground hover:text-foreground hover:underline">
                    Clear
                </Link>
            ) : null}
        </div>
    );
}

/** Old name, kept so callers elsewhere still compile; prefer FilterRow. */
export const FilterBar = FilterRow;
