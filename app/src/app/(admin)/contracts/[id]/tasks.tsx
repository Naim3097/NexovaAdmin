/**
 * The Tasks section (#works): the filter, then dropdowns for View (Board |
 * Calendar | List), Group (Month | Phase) and the Month or Phase in view,
 * "+ Add <month>" (tasks added from the scope), "Brief team" for a month,
 * and the add-a-task form. The account manager's workspace.
 */
import Link from "next/link";
import { APPROVERS, APPROVER_LABEL, LINE_TYPES, LINE_TYPE_LABEL, SEATS, SEAT_LABEL } from "@/lib/data/planners";
import { NO_PHASE, TASK_STATUS_LABEL, TASK_STATUS_ORDER, groupByMonth, groupByPhase, isAdjusted, monthLabel, progress } from "@/lib/works/helpers";
import { emptyFilter, isFiltered } from "@/lib/works/filter";
import { shiftMonth } from "@/lib/works/calendar";
import { createWorkAction, requestMonthAction } from "@/lib/works/actions";
import { addNextMonthAction } from "@/lib/contracts/actions";
import { FilterBar } from "@/app/(admin)/works/filter-bar";
import { ApproverBadge, DueLabel, STATUS_DOT, SplitLabel, TaskStatusBadge, TypeBadge, WorkCard } from "@/app/(admin)/works/ui";
import { CalendarGrid } from "@/app/(admin)/calendar/grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PendingButton } from "@/components/pending-button";
import { SelectNav } from "@/components/select-nav";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SEL, shortMonth, sortTasks, type ContractView } from "./shared";

export function TasksSection({ v }: { v: ContractView }) {
    const {
        c,
        today,
        thisMonth,
        activeTeam,
        memberNames,
        actor,
        asField,
        asQ,
        cWorks,
        phases,
        currentPhase,
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
        unrequested,
        calItems,
        addOpen,
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
          ? "Set the scope on the Scope tab first."
          : `Add ${monthLabel(nextGenMonth)}'s tasks from the scope${lastGenerated ? ` (added through ${monthLabel(lastGenerated)})` : ""}.`;
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

            {/* Group (Month | Phase), the Month or Phase in view, "+ Add month", and "Brief team" */}
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
                        <span className="text-xs text-muted-foreground">No phases on this contract yet.</span>
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
                ) : wm !== "all" && unrequested.length > 0 ? (
                    <form action={requestMonthAction}>
                        <input type="hidden" name="contractId" value={c.id} />
                        <input type="hidden" name="month" value={wm} />
                        {asField}
                        <PendingButton size="sm" pendingLabel="Briefing…">
                            Brief team · {monthLabel(wm)} ({unrequested.length})
                        </PendingButton>
                    </form>
                ) : wm !== "all" ? (
                    <span className="text-xs text-muted-foreground">{cWorks.some((w) => w.month === wm) ? `${monthLabel(wm)} · team briefed on every task` : ""}</span>
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
                        <span className="ml-2 text-muted-foreground">Tasks by due date, plus this contract&apos;s invoice and payment dates.</span>
                    </div>
                    <CalendarGrid year={calYear} month={calMonth} items={calItems} today={today} compact />
                </div>
            ) : cWorks.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                    No tasks yet.{" "}
                    {requirements.length === 0 ? (
                        <>
                            Set the scope on the{" "}
                            <Link href={tabHref("plan", {}, "#requirements")} className="underline">
                                Scope tab
                            </Link>
                            , then add the first month here. Or add tasks by hand below.
                        </>
                    ) : (
                        "Add the first month above, or add tasks by hand below."
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
                <div className="-mx-3 mt-3 overflow-x-auto px-3 md:mx-0 md:px-0">
                    <div className="grid min-w-[1000px] grid-cols-4 gap-3">
                        {TASK_STATUS_ORDER.map((s) => {
                            const col = sortTasks(
                                scoped.filter((w) => w.status === s),
                                today,
                            );
                            return (
                                <div key={s} className="rounded-lg border bg-muted/30 p-3">
                                    <div className="mb-3 flex items-center justify-between">
                                        <h3 className="flex items-center gap-2 text-sm font-medium">
                                            <span className={cn("inline-block size-2 rounded-full", STATUS_DOT[s])} />
                                            {TASK_STATUS_LABEL[s]}
                                        </h3>
                                        <span className="text-xs tabular-nums text-muted-foreground">{col.length}</span>
                                    </div>
                                    <ul className="space-y-2">
                                        {col.map((w) => (
                                            <WorkCard key={w.id} w={w} today={today} showClient={false} href={`/works/${w.id}${asQ}`} />
                                        ))}
                                        {col.length === 0 ? (
                                            <li className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">Nothing here</li>
                                        ) : null}
                                    </ul>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Add a task by hand — `?add=1` (the header's "Add task") opens it */}
            <details id="add-task" open={addOpen} className="mt-4 rounded-md border">
                <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                    + Add a task by hand
                    <span className="ml-2 text-xs font-normal text-muted-foreground">An extra on top of the scope; to change what every month gets, edit the Scope tab.</span>
                </summary>
                <form action={createWorkAction} className="grid gap-3 border-t p-3 md:grid-cols-4">
                    <input type="hidden" name="contractId" value={c.id} />
                    <input type="hidden" name="back" value={href()} />
                    {asField}
                    <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-xs">Title</Label>
                        <Input name="title" required placeholder="e.g. Extra reel for the launch" className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Type</Label>
                        <Select name="type" defaultValue="post">
                            <SelectTrigger className="h-9 w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {LINE_TYPES.map((t) => (
                                    <SelectItem key={t} value={t}>
                                        {LINE_TYPE_LABEL[t]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Channel</Label>
                        <Input name="channel" placeholder="Instagram, Google Ads…" className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Month</Label>
                        <Input name="month" type="month" defaultValue={wm !== "all" ? wm : thisMonth} required className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Due date (blank = 15th)</Label>
                        <Input name="dueDate" type="date" className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Phase</Label>
                        {phases.length > 0 ? (
                            <select name="phaseName" defaultValue={selectedPhase?.name ?? currentPhase?.name ?? ""} className={SEL}>
                                <option value="">— no phase —</option>
                                {phases.map((ph) => (
                                    <option key={ph.key} value={ph.name}>
                                        {ph.name}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <Input name="phaseName" placeholder="optional" className="h-9" />
                        )}
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Sign-off</Label>
                        <Select name="approver" defaultValue="am">
                            <SelectTrigger className="h-9 w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {APPROVERS.map((a) => (
                                    <SelectItem key={a} value={a}>
                                        {APPROVER_LABEL[a]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {[1, 2].map((n) => (
                        <div key={n} className="grid grid-cols-[1fr_1fr_4.5rem] gap-2 md:col-span-2">
                            <div className="space-y-1.5">
                                <Label className="text-xs">Role {n}</Label>
                                <select name={`seat_${n}`} defaultValue={n === 1 ? "dm" : "creative"} className={SEL}>
                                    {SEATS.map((s) => (
                                        <option key={s} value={s}>
                                            {SEAT_LABEL[s]}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Owner {n}</Label>
                                <select name={`member_${n}`} defaultValue="none" className={SEL}>
                                    <option value="none">— open —</option>
                                    {activeTeam.map((m) => (
                                        <option key={m.id} value={m.name}>
                                            {m.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">%</Label>
                                <Input name={`pct_${n}`} type="number" min={0} max={100} step={1} placeholder="%" className="h-9" />
                            </div>
                        </div>
                    ))}
                    <div className="space-y-1.5 md:col-span-3">
                        <Label className="text-xs">Notes</Label>
                        <Textarea name="notes" rows={1} />
                    </div>
                    <div className="flex items-end justify-between gap-2 md:col-span-1">
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <input type="checkbox" name="milestone" value="1" className="size-3.5" />
                            milestone
                        </label>
                        <Button type="submit" variant="outline" className="h-9">
                            Add task
                        </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground md:col-span-4">Leave the % blank for the default; the % must add up to 100.</p>
                </form>
            </details>
        </section>
    );
}
