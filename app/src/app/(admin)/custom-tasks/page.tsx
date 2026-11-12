/**
 * Other tasks: every one-off task (type `custom`) under a project, as a list
 * by month or phase, or a board by status. Lists, filters and links to each
 * task; nothing is created here: an other task starts on a project.
 */
import Link from "next/link";
import { getAccessLevel, getActingMember, getCurrentTeamMember, requireTeamAccess } from "@/lib/auth";
import { listWorks, type Work } from "@/lib/data/works";
import { listContracts } from "@/lib/data/contracts";
import { listTeamMembers } from "@/lib/data/team";
import { visibleContracts, visibleWorks } from "@/lib/scope";
import {
    TASK_STATUS_LABEL,
    TASK_STATUS_ORDER,
    byStatus,
    groupByMonth,
    groupByPhase,
    isAdjusted,
    isOverdue,
    monthLabel,
    monthsOf,
    pendingFrom,
    todayKey,
} from "@/lib/works/helpers";
import { applyFilter, filterQuery, isFiltered, parseFilter, withDefaultMember } from "@/lib/works/filter";
import { SelectNav } from "@/components/select-nav";
import { cn } from "@/lib/utils";
import { FilterRow } from "@/app/(admin)/works/filter-bar";
import { ActingAs, DueLabel, STATUS_DOT, SplitLabel, TaskStatusBadge, WorkCard } from "@/app/(admin)/works/ui";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(sp: SearchParams, key: string): string {
    const v = sp[key];
    return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
}

function byDue(list: Work[]): Work[] {
    return [...list].sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || a.title.localeCompare(b.title));
}

type Section = { key: string; label: string; works: Work[] };

export default async function CustomTasksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    await requireTeamAccess();
    const sp = await searchParams;
    const [allWorks, allContracts, team, linked, accessLevel, member] = await Promise.all([
        listWorks(),
        listContracts(),
        listTeamMembers(),
        getCurrentTeamMember(),
        getAccessLevel(),
        getActingMember(one(sp, "as") || undefined),
    ]);
    // A user sees only the tasks they own a part of or must sign off; managers (or nobody picked) see all.
    const contracts = visibleContracts(member, allContracts, allWorks);
    const today = todayKey();
    const view = one(sp, "view") === "board" ? "board" : "list";
    const group = one(sp, "group") === "phase" ? "phase" : "month";
    // The acting member: the linked login wins; otherwise the `?as=` pick (DEV_AUTH_BYPASS), else the acting-as cookie.
    const as = linked ? "" : one(sp, "as");
    const me = member?.name ?? as;
    const asQ = as ? `?as=${encodeURIComponent(as)}` : "";
    const activeTeam = team.filter((m) => m.active);
    const names = activeTeam.map((m) => m.name);

    const works = visibleWorks(member, allWorks).filter((w) => w.type === "custom");
    const filter = withDefaultMember(parseFilter(sp), sp, me, accessLevel === "standard");
    const filtered = applyFilter(works, filter, today);
    const keep: Record<string, string | undefined> = {
        view: view === "board" ? "board" : undefined,
        group: group === "phase" ? "phase" : undefined,
        as: as || undefined,
    };
    const href = (f: typeof filter, extra: Record<string, string | undefined> = {}) => `/custom-tasks${filterQuery(f, { ...keep, ...extra })}`;

    const phases = [...new Set(works.map((w) => w.phaseName).filter(Boolean))].sort();
    const clients = [...new Set(works.map((w) => w.clientName).filter(Boolean))].sort();
    const ams = [...new Set(contracts.map((c) => c.accountManager).filter(Boolean))].sort();
    const contractById = new Map(contracts.map((c) => [c.id, c]));

    const counts = byStatus(filtered);
    const open = filtered.filter((w) => w.status !== "completed").length;
    const overdue = filtered.filter((w) => isOverdue(w, today)).length;

    // List view: one section per month (default) or per phase name.
    const sections: Section[] =
        group === "phase"
            ? [...groupByPhase(filtered, []).entries()].map(([name, list]) => ({ key: name, label: name, works: byDue(list) }))
            : [...groupByMonth(filtered).entries()].map(([m, list]) => ({ key: m || "none", label: m ? monthLabel(m) : "No month", works: byDue(list) }));

    const viewOptions = [
        { value: "list", label: "List", href: href(filter, { view: undefined }) },
        { value: "board", label: "Board", href: href(filter, { view: "board" }) },
    ];
    const groupOptions = [
        { value: "month", label: "Month", href: href(filter, { group: undefined }) },
        { value: "phase", label: "Phase", href: href(filter, { group: "phase" }) },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">Other tasks</h1>
                    <p className="text-sm text-muted-foreground">One-off work under a project: workshops, strategy calls, audits, sprints.</p>
                    <p className="text-xs text-muted-foreground">
                        New items start as a task on a{" "}
                        <Link href={`/projects${asQ}`} className="underline">
                            project
                        </Link>
                        .
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <Link href={`/works${filterQuery({ type: "custom" }, { as: as || undefined })}`} className="text-sm font-medium underline">
                        All tasks
                    </Link>
                </div>
            </div>

            <ActingAs
                members={activeTeam}
                current={me}
                linkedMember={linked?.name ?? null}
                makeHref={(n) => `/custom-tasks${filterQuery({ ...filter, member: filter.member && filter.member === me ? n : filter.member }, { ...keep, as: n })}`}
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
                <FilterRow
                    basePath="/custom-tasks"
                    filter={filter}
                    me={me}
                    members={names}
                    months={monthsOf(works)}
                    phases={phases}
                    clients={clients}
                    ams={ams}
                    types={["custom"]}
                    keep={keep}
                />
                <div className="flex flex-wrap items-center gap-2">
                    <SelectNav label="View" value={view} options={viewOptions} />
                    {view === "list" ? <SelectNav label="Group" value={group} options={groupOptions} /> : null}
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
                    {isFiltered(filter) ? (
                        <>
                            Nothing matches —{" "}
                            <Link href={`/custom-tasks${filterQuery({}, keep)}`} className="underline">
                                clear the filter
                            </Link>
                            .
                        </>
                    ) : (
                        <>
                            No other tasks yet. New items start as a task on a{" "}
                            <Link href={`/projects${asQ}`} className="underline">
                                project
                            </Link>
                            .
                        </>
                    )}
                </div>
            ) : (
                <>
                    <p className="text-xs text-muted-foreground tabular-nums">
                        <span className="font-medium text-foreground">
                            {filtered.length} other task{filtered.length === 1 ? "" : "s"}
                        </span>
                        {works.length !== filtered.length ? ` of ${works.length}` : ""} · {open} open ·{" "}
                        <span className={cn(overdue > 0 && "font-medium text-red-600 dark:text-red-400")}>{overdue} overdue</span>
                    </p>

                    {view === "board" ? (
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            {TASK_STATUS_ORDER.map((s) => (
                                <div key={s} className="rounded-lg border bg-muted/30 p-2">
                                    <div className="flex items-center gap-2 px-1 py-1 text-xs font-medium">
                                        <span className={cn("inline-block size-2 rounded-full", STATUS_DOT[s])} />
                                        {TASK_STATUS_LABEL[s]}
                                        <span className="text-muted-foreground tabular-nums">{counts[s].length}</span>
                                    </div>
                                    {counts[s].length === 0 ? (
                                        <p className="px-1 py-3 text-xs text-muted-foreground">—</p>
                                    ) : (
                                        <ul className="mt-1 space-y-2">
                                            {byDue(counts[s]).map((w) => (
                                                <WorkCard key={w.id} w={w} today={today} showClient href={`/works/${w.id}${asQ}`} />
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-lg border bg-card">
                            <ul className="divide-y">
                                {sections.map((sec) => (
                                    <li key={sec.key} className="p-4">
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                                            <h2 className="font-medium">{sec.label}</h2>
                                            <span className="text-xs text-muted-foreground">
                                                · {sec.works.length} task{sec.works.length === 1 ? "" : "s"}
                                            </span>
                                        </div>
                                        <div className="mt-2 overflow-x-auto">
                                            <table className="w-full min-w-[800px] text-sm">
                                                <thead>
                                                    <tr className="text-left text-xs text-muted-foreground">
                                                        <th className="py-1 pr-3 font-medium">Task</th>
                                                        <th className="py-1 pr-3 font-medium">Client · project</th>
                                                        <th className="py-1 pr-3 font-medium">{group === "phase" ? "Month" : "Phase"}</th>
                                                        <th className="py-1 pr-3 font-medium">Owners</th>
                                                        <th className="py-1 pr-3 font-medium">Due</th>
                                                        <th className="py-1 pr-3 font-medium">Status</th>
                                                        <th className="py-1 font-medium">Waiting on</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {sec.works.map((w) => {
                                                        const c = contractById.get(w.contractId) ?? null;
                                                        return (
                                                            <tr key={w.id} className="border-t align-top">
                                                                <td className="py-2 pr-3">
                                                                    <Link href={`/works/${w.id}${asQ}`} className="font-medium hover:underline">
                                                                        {w.title}
                                                                    </Link>
                                                                    {w.milestone ? (
                                                                        <span title="Milestone" className="ml-1 text-amber-500">
                                                                            ◆
                                                                        </span>
                                                                    ) : null}
                                                                    {w.channel ? <span className="ml-1 text-xs text-muted-foreground">· {w.channel}</span> : null}
                                                                </td>
                                                                <td className="py-2 pr-3 text-xs">
                                                                    <div>{w.clientName || "No client"}</div>
                                                                    {c ? (
                                                                        <Link href={`/projects/${c.id}#works`} className="text-muted-foreground hover:underline">
                                                                            {c.code} · {c.name}
                                                                        </Link>
                                                                    ) : (
                                                                        <span className="text-muted-foreground">No project</span>
                                                                    )}
                                                                </td>
                                                                <td className="whitespace-nowrap py-2 pr-3 text-xs text-muted-foreground">
                                                                    {group === "phase" ? monthLabel(w.month) : w.phaseName || "—"}
                                                                </td>
                                                                <td className="py-2 pr-3">
                                                                    <SplitLabel split={w.split} short />
                                                                </td>
                                                                <td className="whitespace-nowrap py-2 pr-3">
                                                                    <DueLabel
                                                                        due={w.dueDate}
                                                                        status={w.status}
                                                                        today={today}
                                                                        adjusted={isAdjusted(w)}
                                                                        defaultDue={w.defaultDueDate}
                                                                    />
                                                                </td>
                                                                <td className="py-2 pr-3">
                                                                    <TaskStatusBadge status={w.status} />
                                                                </td>
                                                                <td className="py-2 text-xs text-muted-foreground">{pendingFrom(w) || "—"}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
