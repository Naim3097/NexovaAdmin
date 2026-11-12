/**
 * The Tasks section (#works): the filter, then dropdowns for View (Board |
 * Calendar | List), Group (Month | Phase) and the Month or Phase in view,
 * "+ Add <month>" (tasks added from the deliverables on the Plan tab). Extra
 * tasks are added with "New task" at the foot (and in the header), shown to
 * the account manager, management and the people already on the project.
 * The account manager's workspace.
 */
import Link from "next/link";
import { actorOf } from "@/lib/works/actor";
import { NO_PHASE, groupByMonth, groupByPhase, isAdjusted, monthLabel, progress } from "@/lib/works/helpers";
import { emptyFilter, isFiltered } from "@/lib/works/filter";
import { shiftMonth } from "@/lib/works/calendar";
import { addNextMonthAction } from "@/lib/contracts/actions";
import { FilterBar } from "@/app/(admin)/works/filter-bar";
import { TaskBoard } from "@/app/(admin)/works/task-board";
import { ApproverBadge, DueLabel, SplitLabel, TaskStatusBadge, TypeBadge } from "@/app/(admin)/works/ui";
import { CalendarGrid } from "@/app/(admin)/calendar/grid";
import { Button } from "@/components/ui/button";
import { PendingButton } from "@/components/pending-button";
import { SelectNav } from "@/components/select-nav";
import { NewTaskButton } from "@/components/new-task-dialog";
import { shortMonth, sortTasks, type ContractView } from "./shared";

export function TasksSection({ v }: { v: ContractView }) {
    const {
        c,
        today,
        thisMonth,
        memberNames,
        actor,
        member,
        asParam,
        calTasks,
        calActor,
        calPerDay,
        asField,
        asQ,
        cWorks,
        phases,
        phaseWorks,
        phaseNames,
        strayPhaseNames,
        hasUnphased,
        filter,
        view,
        group,
        months,
        wm,
        calYear,
        calMonth,
        calYm,
        keep,
        base,
        href,
        phaseHref,
        noPhase,
        selectedPhase,
        scoped,
        p,
        calItems,
        canAddTask,
        takesNewTasks,
        newTaskProject,
        requirements,
        nextGenMonth,
        generatedMonths,
        canEdit,
        tabHref,
    } = v;
    const lastGenerated = generatedMonths[generatedMonths.length - 1];
    const addMonthHint = !nextGenMonth
        ? `Every month to ${c.endDate} has its tasks${lastGenerated ? ` (through ${monthLabel(lastGenerated)})` : ""}.`
        : requirements.length === 0
          ? "Add a deliverable on the Plan tab first."
          : `Add ${monthLabel(nextGenMonth)}'s tasks from the deliverables${lastGenerated ? ` (added through ${monthLabel(lastGenerated)})` : ""}.`;
    const hasPhases = phases.length > 0 || hasUnphased || strayPhaseNames.length > 0;
    /** The one value the Phase dropdown shows: a phase key, a stray name, "No phase", or "" for all. */
    const phaseValue = selectedPhase ? selectedPhase.key : strayPhaseNames.includes(filter.phase) ? filter.phase : noPhase ? NO_PHASE : "";

    return (
        <section id="works" className="rounded-lg border bg-card p-3 md:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-sm font-medium">
                        Tasks{" "}
                        <span className="tabular-nums text-muted-foreground">
                            {p.done}/{p.total} · {p.pct}%
                        </span>
                    </h2>
                    <FilterBar
                        basePath={base}
                        filter={filter}
                        me={actor}
                        members={memberNames}
                        months={[]}
                        phases={[]}
                        keep={keep}
                        anchor="#works"
                        compact
                    />
                    {isFiltered(filter) ? (
                        <span className="text-xs text-muted-foreground">
                            showing {scoped.length} of {wm === "all" ? cWorks.length : cWorks.filter((w) => w.month === wm).length}
                        </span>
                    ) : null}
                </div>
                <SelectNav
                    label="View"
                    value={view}
                    options={[
                        { value: "board", label: "Board", href: href({ view: undefined, cm: undefined }) },
                        { value: "calendar", label: "Calendar", href: href({ view: "calendar", cm: calYm }) },
                        { value: "list", label: "List", href: href({ view: "list", cm: undefined }) },
                    ]}
                />
            </div>

            {/* Group (Month | Phase), the Month or Phase in view, and "+ Add month" */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <SelectNav
                        label="Group"
                        value={group}
                        options={[
                            { value: "month", label: "Month", href: href({ group: undefined }, { ...filter, phase: "" }) },
                            { value: "phase", label: "Phase", href: href({ group: "phase", wm: undefined }) },
                        ]}
                    />
                    {group === "month" ? (
                        <>
                            <SelectNav
                                label="Month"
                                value={wm}
                                options={[
                                    { value: "all", label: "All months", href: href({ wm: undefined }) },
                                    ...months.map((m) => ({ value: m, label: monthLabel(m), href: href({ wm: m }) })),
                                ]}
                            />
                            {canEdit ? (
                                nextGenMonth && requirements.length > 0 ? (
                                    <form action={addNextMonthAction} title={addMonthHint}>
                                        <input type="hidden" name="id" value={c.id} />
                                        <input type="hidden" name="month" value={nextGenMonth} />
                                        {asField}
                                        <PendingButton size="sm" variant="outline" pendingLabel="Adding…">
                                            + Add {monthLabel(nextGenMonth)}
                                        </PendingButton>
                                    </form>
                                ) : (
                                    <Button size="sm" variant="outline" disabled title={addMonthHint}>
                                        + Add next month
                                    </Button>
                                )
                            ) : null}
                        </>
                    ) : hasPhases ? (
                        <SelectNav
                            label="Phase"
                            value={phaseValue}
                            options={[
                                { value: "", label: "All phases", href: href({}, { ...filter, phase: "" }) },
                                ...phases.map((ph) => ({ value: ph.key, label: ph.name, href: phaseHref(ph.key) })),
                                ...strayPhaseNames.map((n) => ({ value: n, label: n, href: phaseHref(n) })),
                                ...(hasUnphased ? [{ value: NO_PHASE, label: NO_PHASE, href: phaseHref(NO_PHASE) }] : []),
                            ]}
                        />
                    ) : (
                        <span className="text-xs text-muted-foreground">No phases on this account yet.</span>
                    )}
                </div>
                {group === "phase" && selectedPhase ? (
                    <span className="text-xs tabular-nums text-muted-foreground">
                        {selectedPhase.startMonth || selectedPhase.endMonth
                            ? `${shortMonth(selectedPhase.startMonth)} → ${shortMonth(selectedPhase.endMonth)} · `
                            : ""}
                        {progress(phaseWorks(selectedPhase.key, selectedPhase.name)).done}/{phaseWorks(selectedPhase.key, selectedPhase.name).length} done
                        {selectedPhase.summary ? ` · ${selectedPhase.summary}` : ""}
                    </span>
                ) : null}
            </div>

            {/* Views */}
            {view === "calendar" ? (
                <div className="mt-3">
                    <div className="mb-2 flex items-center gap-1 text-xs">
                        <Link href={href({ view: "calendar", cm: shiftMonth(calYear, calMonth, -1) })} className="rounded-md border px-2 py-1 hover:bg-accent">
                            Prev
                        </Link>
                        <span className="px-2 font-medium">{monthLabel(calYm)}</span>
                        <Link href={href({ view: "calendar", cm: shiftMonth(calYear, calMonth, 1) })} className="rounded-md border px-2 py-1 hover:bg-accent">
                            Next
                        </Link>
                        <Link href={href({ view: "calendar", cm: thisMonth })} className="ml-1 rounded-md border px-2 py-1 hover:bg-accent">
                            Today
                        </Link>
                        <span className="ml-2 text-muted-foreground">Tasks on their planned day (deadline shown when it differs), plus this account&apos;s invoice and payment dates. Drag a task to replan it.</span>
                    </div>
                    <CalendarGrid year={calYear} month={calMonth} items={calItems} today={today} compact actor={calActor} asParam={asParam} tasks={calTasks} perDay={calPerDay} />
                </div>
            ) : cWorks.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                    No tasks yet.{" "}
                    {requirements.length === 0 ? (
                        <>
                            Add a deliverable on the{" "}
                            <Link href={tabHref("plan", {}, "#requirements")} className="underline">
                                Plan tab
                            </Link>
                            , then add the first month here.
                        </>
                    ) : canAddTask ? (
                        "Add the first month above, or one task with New task."
                    ) : (
                        "Add the first month above."
                    )}
                </p>
            ) : scoped.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                    Nothing matches this filter.{" "}
                    <Link href={href({}, emptyFilter())} className="underline">
                        Clear it
                    </Link>
                    .
                </p>
            ) : view === "list" ? (
                <div className="-mx-3 mt-3 overflow-x-auto px-3 md:mx-0 md:px-0">
                    <table className="w-full min-w-[900px] text-sm">
                        <thead>
                            <tr className="border-b text-left text-xs text-muted-foreground">
                                <th className="py-2 pr-3 font-medium">Task</th>
                                <th className="py-2 pr-3 font-medium">Type</th>
                                <th className="py-2 pr-3 font-medium">Channel</th>
                                <th className="py-2 pr-3 font-medium">Phase</th>
                                <th className="py-2 pr-3 font-medium">Owners</th>
                                <th className="py-2 pr-3 font-medium">Due</th>
                                <th className="py-2 pr-3 font-medium">Status</th>
                                <th className="py-2 font-medium">Sign-off</th>
                            </tr>
                        </thead>
                        {[...(group === "phase" ? groupByPhase(scoped, phaseNames) : groupByMonth(scoped))].map(([g, list]) => {
                            const mp = progress(list);
                            return (
                                <tbody key={g}>
                                    <tr className="bg-muted/40">
                                        <td colSpan={8} className="px-2 py-1.5 text-xs font-medium">
                                            {group === "phase" ? g : monthLabel(g)}{" "}
                                            <span className="tabular-nums text-muted-foreground">
                                                · {mp.done}/{mp.total} done
                                            </span>
                                        </td>
                                    </tr>
                                    {sortTasks(list, today).map((w) => (
                                        <tr key={w.id} className="border-b last:border-0">
                                            <td className="py-2 pr-3">
                                                <Link href={`/works/${w.id}${asQ}`} className="font-medium hover:underline">
                                                    {w.title}
                                                </Link>
                                                {w.milestone ? (
                                                    <span title="Milestone" className="ml-1 text-amber-500">
                                                        ◆
                                                    </span>
                                                ) : null}
                                                {w.addendumVersion > 0 ? <span className="ml-1 text-[10px] text-muted-foreground">change v{w.addendumVersion}</span> : null}
                                            </td>
                                            <td className="py-2 pr-3">
                                                <TypeBadge type={w.type} short />
                                            </td>
                                            <td className="py-2 pr-3 text-xs text-muted-foreground">{w.channel || "—"}</td>
                                            <td className="py-2 pr-3 text-xs text-muted-foreground">{w.phaseName || "—"}</td>
                                            <td className="py-2 pr-3">
                                                <SplitLabel split={w.split} short />
                                            </td>
                                            <td className="py-2 pr-3">
                                                <DueLabel due={w.dueDate} status={w.status} today={today} adjusted={isAdjusted(w)} defaultDue={w.defaultDueDate} />
                                            </td>
                                            <td className="py-2 pr-3">
                                                <TaskStatusBadge status={w.status} />
                                            </td>
                                            <td className="py-2">
                                                <ApproverBadge approver={w.approver} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            );
                        })}
                    </table>
                </div>
            ) : (
                <div className="mt-3">
                    <TaskBoard works={scoped} today={today} asQ={asQ} actor={actorOf(member)} asParam={asParam} showClient={false} />
                </div>
            )}

            {/* New tasks: the deliverables make them; anything extra is added here, on the project. */}
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {canAddTask ? (
                    <>
                        <span>New tasks come from the deliverables, or add one here:</span>
                        <NewTaskButton project={newTaskProject} members={memberNames} today={today} asParam={asParam} variant="outline" />
                    </>
                ) : takesNewTasks ? (
                    <span>
                        New tasks come from the deliverables. {c.accountManager || "The account manager"}, management or the people on this account add extra
                        ones here.
                    </span>
                ) : (
                    <span>New tasks come from the deliverables. A closed account takes no new tasks.</span>
                )}
            </div>
        </section>
    );
}
