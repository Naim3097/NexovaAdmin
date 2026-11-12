/**
 * Plan tab (`?tab=plan`): what the project promises, and it only grows here.
 * The deliverables (the rows every month's tasks are generated from) with
 * "+ Add deliverable", and the phases with "+ Add phase". Nothing on this tab
 * edits or removes what exists: a task is changed or removed on the Tasks
 * tab, a phase through the pencil next to it there. The crew is set when the
 * project is created; later changes are made per task. Element ids
 * (#requirements, #phases) are link targets from the header and the actions,
 * so they keep their names.
 */
import Link from "next/link";
import { LINE_TYPES, LINE_TYPE_LABEL } from "@/lib/data/planners";
import { DEFAULT_CHANNEL, PER_LABEL, REQUIREMENT_PERS } from "@/lib/contracts/requirements";
import { MAX_PHASE_MONTHS, templatePhasesFromProject } from "@/lib/contracts/phases";
import { monthLabel, progress } from "@/lib/works/helpers";
import { addContractPhaseAction, addDeliverableAction } from "@/lib/contracts/actions";
import { Input } from "@/components/ui/input";
import { PendingButton } from "@/components/pending-button";
import { cn } from "@/lib/utils";
import { requirementLabel } from "../../ui";
import { CARD, LBL, SEL, shortMonth, type ContractView } from "../shared";

export function PlanTab({ v }: { v: ContractView }) {
    return (
        <>
            <Deliverables v={v} />
            <Phases v={v} />
        </>
    );
}

/**
 * The deliverables, one line per row, and "+ Add deliverable". A new row's
 * tasks are generated at once for every month that already has tasks, from
 * this month on; past months are never touched.
 */
function Deliverables({ v }: { v: ContractView }) {
    const { c, requirements, canEdit, error, asField, generatedMonths, nextGenMonth, thisMonth, signed, tabHref } = v;
    const lastGenerated = generatedMonths[generatedMonths.length - 1];
    /** The months a new row lands in right away: those with tasks already, from this month on. */
    const fillMonths = generatedMonths.filter((m) => m >= thisMonth);
    const fillHint = !signed
        ? "Its tasks appear once the project is signed."
        : fillMonths.length === 0
          ? `No month from ${monthLabel(thisMonth)} has tasks yet, so its tasks come with the next month added on the Tasks tab.`
          : `Its tasks are added right away for ${
                fillMonths.length === 1 ? monthLabel(fillMonths[0]) : `${shortMonth(fillMonths[0])} → ${shortMonth(fillMonths[fillMonths.length - 1])}`
            }; earlier months stay as they are.`;

    return (
        <section id="requirements" className={cn(CARD, error === "deliverable" && "border-destructive/60")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium">Deliverables</h2>
                <p className="text-xs text-muted-foreground">
                    {lastGenerated ? `Tasks added through ${monthLabel(lastGenerated)}` : "No tasks yet"}
                    {nextGenMonth ? (
                        <>
                            {" · "}
                            <Link href={tabHref("work", { wm: undefined }, "#works")} className="underline">
                                add {monthLabel(nextGenMonth)} on the Tasks tab
                            </Link>
                        </>
                    ) : null}
                </p>
            </div>
            <p className="text-xs text-muted-foreground">What every month gets: the tasks are generated from these rows.</p>
            {requirements.length === 0 ? (
                <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">No deliverables yet, so no tasks can be added.</p>
            ) : (
                <ul className="mt-3 divide-y border-t text-sm">
                    {requirements.map((r, i) => (
                        <li key={`${r.type}-${i}`} className="flex items-baseline justify-between gap-3 py-1.5">
                            <span>{requirementLabel(r)}</span>
                            <span className="text-right text-xs text-muted-foreground">{r.channel || DEFAULT_CHANNEL[r.type]}</span>
                        </li>
                    ))}
                </ul>
            )}

            {canEdit ? (
                <details open={error === "deliverable"} className="mt-3 rounded-md border">
                    <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                        + Add deliverable
                        <span className="ml-2 text-xs font-normal text-muted-foreground">A new row on top of the scope.</span>
                    </summary>
                    <form
                        key={c.updatedAt}
                        action={addDeliverableAction}
                        className="grid gap-2 border-t p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_5rem_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"
                    >
                        <input type="hidden" name="id" value={c.id} />
                        {asField}
                        <label className="space-y-1">
                            <span className={LBL}>Type</span>
                            <select name="type" defaultValue="static" className={SEL}>
                                {LINE_TYPES.map((t) => (
                                    <option key={t} value={t}>
                                        {LINE_TYPE_LABEL[t]}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="space-y-1">
                            <span className={LBL}>Name</span>
                            <Input name="name" placeholder="Awareness post on Instagram" className="h-9" />
                        </label>
                        <label className="space-y-1">
                            <span className={LBL}>How many</span>
                            <Input name="count" type="number" min={1} max={99} step={1} defaultValue={1} required className="h-9" />
                        </label>
                        <label className="space-y-1">
                            <span className={LBL}>How often</span>
                            <select name="per" defaultValue="month" className={SEL}>
                                {REQUIREMENT_PERS.map((p) => (
                                    <option key={p} value={p}>
                                        {PER_LABEL[p]}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="space-y-1">
                            <span className={LBL}>Channel</span>
                            <Input name="channel" placeholder="Instagram, Meta, Blog…" className="h-9" />
                        </label>
                        <PendingButton size="sm" variant="outline" pendingLabel="Adding…">
                            Add
                        </PendingButton>
                        {error === "deliverable" ? (
                            <p role="alert" className="text-xs text-destructive md:col-span-6">
                                The row needs a type and a count above zero.
                            </p>
                        ) : null}
                        <p className="text-[11px] text-muted-foreground md:col-span-6">
                            {fillHint} The name becomes the task title; &ldquo;a week&rdquo; means every working week (Mon–Thu), &ldquo;once&rdquo; lands in the
                            first month it is added for.
                        </p>
                    </form>
                </details>
            ) : null}
            <p className="mt-3 text-xs text-muted-foreground">
                To change or remove a task, open it on the{" "}
                <Link href={tabHref("work", {}, "#works")} className="underline">
                    Tasks tab
                </Link>
                .
            </p>
        </section>
    );
}

/**
 * The phases with their months and task counts (names jump to the Tasks tab
 * grouped by phase), and "+ Add phase" as a relative row: month 1 is the
 * project's first month, placed against the start date by the action.
 */
function Phases({ v }: { v: ContractView }) {
    const { c, phases, thisMonth, currentPhase, phaseWorks, phaseHref, canEditPhases, error, asField, tabHref } = v;
    const startYm = c.startDate.slice(0, 7);
    const endYm = c.endDate.slice(0, 7);
    // The next free month after the last phase, so a new row follows on by default.
    const relative = templatePhasesFromProject(phases, c.startDate);
    const last = relative[relative.length - 1];
    const defaultFrom = Math.min(MAX_PHASE_MONTHS, last ? last.fromMonth + last.months : 1);

    return (
        <section id="phases" className={cn("rounded-lg border bg-card p-3 md:p-4", error === "phase" && "border-destructive/60")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium">Phases</h2>
                <p className="text-xs text-muted-foreground">
                    {phases.length > 0 ? `Tasks take the phase their month falls in; the highlighted one holds ${monthLabel(thisMonth)}.` : ""}
                </p>
            </div>
            {phases.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No phases yet{canEditPhases ? " — add one below." : "."}</p>
            ) : (
                <ol className="-mx-3 mt-3 flex gap-2 overflow-x-auto px-3 md:mx-0 md:px-0">
                    {phases.map((ph, i) => {
                        const list = phaseWorks(ph.key, ph.name);
                        const pp = progress(list);
                        const active = currentPhase?.key === ph.key;
                        const done = !active && ph.endMonth && ph.endMonth < thisMonth;
                        return (
                            <li
                                key={ph.key}
                                className={cn(
                                    "min-w-44 flex-1 rounded-md border p-3 text-sm",
                                    active && "border-primary bg-primary/10",
                                    done && "bg-emerald-500/5",
                                )}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <Link href={phaseHref(ph.key)} className={cn("font-medium hover:underline", active && "text-primary")}>
                                        {i + 1}. {ph.name}
                                    </Link>
                                    {done ? <span className="text-xs text-emerald-700 dark:text-emerald-400">✓</span> : null}
                                    {active ? <span className="text-[10px] font-medium uppercase text-primary">now</span> : null}
                                </div>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    {ph.startMonth || ph.endMonth ? `${shortMonth(ph.startMonth)} → ${shortMonth(ph.endMonth)}` : "no months set"}
                                </p>
                                <p className="mt-1 text-xs tabular-nums">
                                    <span className="font-medium">{pp.done}</span>
                                    <span className="text-muted-foreground">/{pp.total} tasks done</span>
                                </p>
                                {ph.summary ? <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{ph.summary}</p> : null}
                            </li>
                        );
                    })}
                </ol>
            )}

            {canEditPhases ? (
                <details open={error === "phase"} className="mt-3 rounded-md border">
                    <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                        + Add phase
                        <span className="ml-2 text-xs font-normal text-muted-foreground">Month 1 is {startYm ? shortMonth(startYm) : "the start month"}.</span>
                    </summary>
                    <form
                        key={c.updatedAt}
                        action={addContractPhaseAction}
                        className="grid gap-2 border-t p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_6rem_6rem_auto] md:items-end"
                    >
                        <input type="hidden" name="id" value={c.id} />
                        {asField}
                        <label className="space-y-1">
                            <span className={LBL}>Name</span>
                            <Input name="name" required placeholder="Launch" className="h-9" />
                        </label>
                        <label className="space-y-1">
                            <span className={LBL}>Summary</span>
                            <Input name="summary" placeholder="What happens in it" className="h-9" />
                        </label>
                        <label className="space-y-1">
                            <span className={LBL}>From month</span>
                            <Input name="fromMonth" type="number" min={1} max={MAX_PHASE_MONTHS} step={1} defaultValue={defaultFrom} required className="h-9" />
                        </label>
                        <label className="space-y-1">
                            <span className={LBL}>Months</span>
                            <Input name="months" type="number" min={1} max={MAX_PHASE_MONTHS} step={1} defaultValue={1} required className="h-9" />
                        </label>
                        <PendingButton size="sm" variant="outline" pendingLabel="Adding…">
                            Add
                        </PendingButton>
                        {error === "phase" ? (
                            <p role="alert" className="text-xs text-destructive md:col-span-5">
                                That phase would start after the project ends{endYm ? ` (${shortMonth(endYm)})` : ""}.
                            </p>
                        ) : null}
                        <p className="text-[11px] text-muted-foreground md:col-span-5">
                            Counted from the project&apos;s first month{endYm ? ` and clipped to its end (${shortMonth(endYm)})` : ""}. Phases may overlap.
                        </p>
                    </form>
                </details>
            ) : null}
            <p className="mt-3 text-xs text-muted-foreground">
                Rename, re-date, reorder or remove a phase on the{" "}
                <Link href={tabHref("work")} className="underline">
                    Tasks tab
                </Link>
                {canEditPhases ? " — the pencil next to each phase." : "."}
            </p>
        </section>
    );
}
