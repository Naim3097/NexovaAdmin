/**
 * Scope tab (`?tab=plan`): the scope (what the tasks are added from), the
 * team on the contract (one person per role), and the phases (strip +
 * editor). Element ids (#requirements, #crew) are link targets from the
 * actions, so they keep their names.
 */
import Link from "next/link";
import { REQUIREMENT_CADENCES } from "@/lib/data/contracts";
import { LINE_TYPES, LINE_TYPE_LABEL, SEATS, SEAT_LABEL } from "@/lib/data/planners";
import { DEFAULT_CHANNEL } from "@/lib/contracts/generate";
import { monthLabel, progress } from "@/lib/works/helpers";
import {
    addContractPhaseAction,
    applyPhaseTemplateAction,
    movePhaseDownAction,
    movePhaseUpAction,
    removeContractPhaseAction,
    saveCrewAction,
    saveRequirementsAction,
    updateContractPhaseAction,
} from "@/lib/contracts/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PendingButton } from "@/components/pending-button";
import { cn } from "@/lib/utils";
import { requirementsLabel } from "../../ui";
import { CARD, INP_SM, LBL, SEL, shortMonth, type ContractView } from "../shared";

export function PlanTab({ v }: { v: ContractView }) {
    return (
        <>
            <div className="grid gap-4 lg:grid-cols-2">
                <Requirements v={v} />
                <CrewCard v={v} />
            </div>
            <PhasesStrip v={v} />
            {v.canEditPhases ? <PhasesEditor v={v} /> : null}
        </>
    );
}

/** The scope: one row per task type with count, how often and channel. Tasks for later months follow the saved list. */
function Requirements({ v }: { v: ContractView }) {
    const { c, requirements, canEdit, error, asField, generatedMonths, nextGenMonth, tabHref } = v;
    const byType = new Map(requirements.map((r) => [r.type, r]));
    const summary = requirementsLabel(requirements);
    const lastGenerated = generatedMonths[generatedMonths.length - 1];
    return (
        <section id="requirements" className={cn(CARD, error === "requirements" && "border-destructive/60")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium">Scope</h2>
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
            <p className="mt-1 text-sm">{summary || <span className="text-amber-700 dark:text-amber-400">No scope yet, so no tasks can be added.</span>}</p>
            {error === "requirements" ? (
                <p role="alert" className="mt-2 text-xs text-destructive">
                    Keep at least one task type with a count above zero.
                </p>
            ) : null}
            {canEdit ? (
                <form action={saveRequirementsAction} className="mt-3 border-t pt-3">
                    <input type="hidden" name="id" value={c.id} />
                    {asField}
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs text-muted-foreground">
                                <th className="py-1 pr-2 font-medium">Type</th>
                                <th className="w-16 py-1 pr-2 font-medium">Count</th>
                                <th className="w-28 py-1 pr-2 font-medium">How often</th>
                                <th className="py-1 font-medium">Channel</th>
                            </tr>
                        </thead>
                        <tbody>
                            {LINE_TYPES.map((t) => {
                                const r = byType.get(t);
                                return (
                                    <tr key={t}>
                                        <td className="py-1 pr-2 text-xs">{LINE_TYPE_LABEL[t]}</td>
                                        <td className="py-1 pr-2">
                                            <Input name={`req_${t}_count`} type="number" min={0} max={99} step={1} defaultValue={r?.count || ""} placeholder="0" className={INP_SM} />
                                        </td>
                                        <td className="py-1 pr-2">
                                            <select name={`req_${t}_cadence`} defaultValue={r?.cadence ?? (t === "website" || t === "branding" ? "once" : "monthly")} className="h-8 w-full rounded-md border bg-background px-1.5 text-xs">
                                                {REQUIREMENT_CADENCES.map((cd) => (
                                                    <option key={cd} value={cd}>
                                                        {cd === "monthly" ? "every month" : "once"}
                                                    </option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="py-1">
                                            <Input name={`req_${t}_channel`} defaultValue={r?.channel ?? ""} placeholder={DEFAULT_CHANNEL[t]} className={INP_SM} />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] text-muted-foreground">Changes apply to months added from now on; existing tasks stay as they are.</p>
                        <PendingButton size="sm" variant="outline" pendingLabel="Saving…">
                            Save scope
                        </PendingButton>
                    </div>
                </form>
            ) : (
                <ul className="mt-3 divide-y border-t text-sm">
                    {requirements.map((r, i) => (
                        <li key={`${r.type}-${i}`} className="flex items-baseline justify-between gap-3 py-1.5">
                            <span>{LINE_TYPE_LABEL[r.type]}</span>
                            <span className="text-right text-xs text-muted-foreground">
                                {r.count} × {r.cadence === "monthly" ? "every month" : "once"}
                                {r.channel ? ` · ${r.channel}` : ""}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

/** The team: one person per role. "Suggest" prefills the least-loaded fit per role; "Apply to open tasks" re-assigns tasks still to do. */
function CrewCard({ v }: { v: ContractView }) {
    const { c, crew, proposedCrew, suggest, canEdit, activeTeam, asField, tabHref, cWorks } = v;
    const openCount = cWorks.filter((w) => w.status === "not_started").length;
    const current = (seat: (typeof SEATS)[number]) => (suggest ? proposedCrew[seat] : crew[seat]) ?? "";
    return (
        <section id="crew" className={CARD}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium">Team on this contract</h2>
                {canEdit ? (
                    suggest ? (
                        <span className="text-xs text-muted-foreground">
                            Suggestions filled in — save to keep them, or{" "}
                            <Link href={tabHref("plan", {}, "#crew")} className="underline">
                                go back
                            </Link>
                            .
                        </span>
                    ) : (
                        <Link href={tabHref("plan", { suggest: "1" }, "#crew")} className="text-xs font-medium underline">
                            Suggest
                        </Link>
                    )
                ) : null}
            </div>
            <p className="text-xs text-muted-foreground">One person per role; new tasks are assigned from here, and the suggestion is whoever fits with the lightest load this month.</p>
            {canEdit ? (
                <form action={saveCrewAction} className="mt-3 border-t pt-3">
                    <input type="hidden" name="id" value={c.id} />
                    {asField}
                    <div className="grid gap-2 sm:grid-cols-2">
                        {SEATS.map((seat) => (
                            <label key={seat} className="space-y-1">
                                <span className={LBL}>{SEAT_LABEL[seat]}</span>
                                <select name={`crew_${seat}`} defaultValue={current(seat) || "none"} className={SEL}>
                                    <option value="none">— open —</option>
                                    {activeTeam.map((m) => (
                                        <option key={m.id} value={m.name}>
                                            {m.name} ({m.role})
                                        </option>
                                    ))}
                                </select>
                                {!suggest && proposedCrew[seat] && proposedCrew[seat] !== crew[seat] ? (
                                    <span className="block text-[11px] text-muted-foreground">suggested: {proposedCrew[seat]}</span>
                                ) : null}
                            </label>
                        ))}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <input type="checkbox" name="applyOpen" value="1" className="size-3.5" disabled={openCount === 0} />
                            Apply to open tasks ({openCount} to do)
                        </label>
                        <PendingButton size="sm" variant="outline" pendingLabel="Saving…">
                            Save team
                        </PendingButton>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">Ticked, every To do task is re-assigned role by role with its % kept; tasks already started keep their people.</p>
                </form>
            ) : (
                <ul className="mt-3 divide-y border-t text-sm">
                    {SEATS.map((seat) => (
                        <li key={seat} className="flex items-baseline justify-between gap-3 py-1.5">
                            <span>{SEAT_LABEL[seat]}</span>
                            <span className={cn("text-xs", crew[seat] ? "" : "italic text-muted-foreground")}>{crew[seat] || "open"}</span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

/** The contract's phases with months and task counts; names jump to the Tasks tab grouped by phase. */
function PhasesStrip({ v }: { v: ContractView }) {
    const { phases, thisMonth, currentPhase, phaseWorks, phaseHref } = v;
    return (
        <section className="rounded-lg border bg-card p-3 md:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium">Phases</h2>
                <p className="text-xs text-muted-foreground">
                    {phases.length > 0 ? `Tasks take the phase their month falls in; the highlighted one holds ${monthLabel(thisMonth)}.` : ""}
                </p>
            </div>
            {phases.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No phases yet — apply a template or add one below.</p>
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
        </section>
    );
}

/** Rename, re-date, reorder, remove, add, or replace from a template. Admins and the account manager. */
function PhasesEditor({ v }: { v: ContractView }) {
    const { c, phases, templates, asField } = v;
    return (
        <details open className="rounded-lg border bg-card">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                Edit phases
                <span className="ml-2 text-xs font-normal text-muted-foreground">Rename, re-date, reorder or replace from a template; tasks follow their phase by name.</span>
            </summary>
            <div className="space-y-2 border-t p-3 md:p-4">
                {phases.map((ph, i) => (
                    <form
                        key={ph.key}
                        action={updateContractPhaseAction}
                        className="grid gap-2 rounded-md border p-2 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,2fr)_auto_auto_auto] md:items-end"
                    >
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="key" value={ph.key} />
                        {asField}
                        <div className="flex gap-0.5">
                            <Button
                                type="submit"
                                size="icon-sm"
                                variant="ghost"
                                formAction={movePhaseUpAction}
                                formNoValidate
                                disabled={i === 0}
                                title="Move up"
                                aria-label={`Move ${ph.name} up`}
                            >
                                ↑
                            </Button>
                            <Button
                                type="submit"
                                size="icon-sm"
                                variant="ghost"
                                formAction={movePhaseDownAction}
                                formNoValidate
                                disabled={i === phases.length - 1}
                                title="Move down"
                                aria-label={`Move ${ph.name} down`}
                            >
                                ↓
                            </Button>
                        </div>
                        <label className="space-y-1">
                            <span className={LBL}>Phase {i + 1}</span>
                            <Input name="name" defaultValue={ph.name} required className={INP_SM} />
                        </label>
                        <label className="space-y-1">
                            <span className={LBL}>Summary</span>
                            <Input name="summary" defaultValue={ph.summary} className={INP_SM} />
                        </label>
                        <label className="space-y-1">
                            <span className={LBL}>From</span>
                            <Input name="startMonth" type="month" defaultValue={ph.startMonth} className={INP_SM} />
                        </label>
                        <label className="space-y-1">
                            <span className={LBL}>To</span>
                            <Input name="endMonth" type="month" defaultValue={ph.endMonth} className={INP_SM} />
                        </label>
                        <div className="flex gap-1">
                            <Button type="submit" size="sm" variant="outline">
                                Save
                            </Button>
                            <Button
                                type="submit"
                                size="sm"
                                variant="ghost"
                                className="text-muted-foreground"
                                formAction={removeContractPhaseAction}
                                formNoValidate
                            >
                                Remove
                            </Button>
                        </div>
                    </form>
                ))}

                <form
                    key={c.updatedAt}
                    action={addContractPhaseAction}
                    className="grid gap-2 rounded-md border border-dashed p-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto_auto_auto] md:items-end"
                >
                    <input type="hidden" name="id" value={c.id} />
                    {asField}
                    <label className="space-y-1">
                        <span className={LBL}>New phase</span>
                        <Input name="name" required placeholder="Launch" className={INP_SM} />
                    </label>
                    <label className="space-y-1">
                        <span className={LBL}>Summary</span>
                        <Input name="summary" placeholder="What happens in it" className={INP_SM} />
                    </label>
                    <label className="space-y-1">
                        <span className={LBL}>From</span>
                        <Input name="startMonth" type="month" className={INP_SM} />
                    </label>
                    <label className="space-y-1">
                        <span className={LBL}>To</span>
                        <Input name="endMonth" type="month" className={INP_SM} />
                    </label>
                    <Button type="submit" size="sm" variant="outline">
                        Add phase
                    </Button>
                </form>

                <form action={applyPhaseTemplateAction} className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-2">
                    <input type="hidden" name="id" value={c.id} />
                    {asField}
                    <label className="min-w-64 flex-1 space-y-1">
                        <span className={LBL}>Apply a template</span>
                        {templates.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No phase templates yet.</p>
                        ) : (
                            <select name="templateId" defaultValue="none" className="h-8 w-full rounded-md border bg-background px-2 text-xs">
                                <option value="none">— choose a template —</option>
                                {templates.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.name}
                                        {t.isDefault ? " (default)" : ""} · {t.phases.map((ph) => ph.name).join(" → ") || "no phases"}
                                    </option>
                                ))}
                            </select>
                        )}
                    </label>
                    {templates.length > 0 ? (
                        <PendingButton size="sm" variant="outline" pendingLabel="Applying…">
                            Apply template
                        </PendingButton>
                    ) : null}
                    <p className="basis-full text-[11px] text-muted-foreground">Replaces the phases above; tasks keep their phase where the names match.</p>
                </form>
            </div>
        </details>
    );
}
