/**
 * Tasks tab (default, `?tab=work`): what needs moving this week, where the
 * project is in its phases, then the full Tasks section. A draft shows the
 * gate instead: tasks appear once the contract is signed (or, on an internal
 * project, once management approves the brief).
 */
import Link from "next/link";
import { setStageAction } from "@/lib/contracts/actions";
import { progress } from "@/lib/works/helpers";
import { cn } from "@/lib/utils";
import { PendingButton } from "@/components/pending-button";
import { ThisWeek } from "../this-week";
import { TasksSection } from "../tasks";
import { PhaseEdit } from "../phase-edit";
import { CARD, type ContractView } from "../shared";
import { requirementsLabel } from "../../ui";

export function WorkTab({ v }: { v: ContractView }) {
    if (!v.signed) return <SignFirst v={v} />;
    return (
        <>
            <ThisWeek v={v} />
            <PhasesBar v={v} />
            <TasksSection v={v} />
        </>
    );
}

/** The rule, in the place the tasks would be: nothing starts before the contract is signed. */
function SignFirst({ v }: { v: ContractView }) {
    const { c, internal, requirements, crew, asField, tabHref } = v;
    const scope = requirementsLabel(requirements);
    const crewNames = Object.values(crew).filter(Boolean);
    return (
        <section className={cn(CARD, "border-amber-500/40")}>
            <h2 className="text-lg font-semibold">{internal ? "Approve first" : "Sign first"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
                {internal
                    ? "Tasks appear once management approves this brief. Until then it is only a plan."
                    : "Tasks appear once the contract is signed. Until then this project is only a plan."}
            </p>
            <ul className="mt-3 space-y-1 text-sm">
                <li>
                    Scope:{" "}
                    {scope ? (
                        <span className="font-medium">{scope}</span>
                    ) : (
                        <Link href={tabHref("plan", {}, "#requirements")} className="text-amber-700 underline dark:text-amber-400">
                            not set yet
                        </Link>
                    )}
                </li>
                <li>
                    Crew:{" "}
                    {crewNames.length > 0 ? (
                        <span className="font-medium">{crewNames.join(", ")}</span>
                    ) : (
                        <span className="text-muted-foreground">none set — people are assigned per task</span>
                    )}
                </li>
                {!internal ? (
                    <li>
                        Contract:{" "}
                        <Link href={tabHref("money", {}, "#terms")} className="underline">
                            {c.valueMyr ? `${c.reference || c.code}` : "value and reference"}
                        </Link>
                    </li>
                ) : null}
            </ul>
            <form action={setStageAction} className="mt-4 flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="stage" value="signed" />
                {asField}
                <PendingButton pendingLabel={internal ? "Approving…" : "Signing…"} disabled={requirements.length === 0} title={requirements.length === 0 ? "Set the scope first" : undefined}>
                    {internal ? "Approve" : "Mark signed"}
                </PendingButton>
                <span className="text-xs text-muted-foreground">
                    {internal ? "Management says yes: the tasks are generated from the scope." : "The client said yes: stamps today as the signed date and generates the tasks from the scope."}
                </span>
            </form>
        </section>
    );
}

/**
 * The phases in one line — name, done/total, the current one highlighted. A
 * chip filters the Tasks section by its phase; the pencil next to it opens
 * the edit pop-up (rename, re-date, move, remove). New phases are added on
 * the Plan tab.
 */
function PhasesBar({ v }: { v: ContractView }) {
    const { c, phases, thisMonth, currentPhase, phaseWorks, phaseHref, tabHref, group, filter, canEditPhases, asParam } = v;
    return (
        <nav aria-label="Phases" className="flex flex-wrap items-center gap-1.5 text-xs">
            {phases.length === 0 ? (
                <span className="text-muted-foreground">No phases on this project yet.</span>
            ) : (
                phases.map((ph, i) => {
                    const list = phaseWorks(ph.key, ph.name);
                    const pp = progress(list);
                    const active = currentPhase?.key === ph.key;
                    const done = !active && Boolean(ph.endMonth) && ph.endMonth < thisMonth;
                    const selected = group === "phase" && (filter.phase === ph.key || filter.phase === ph.name);
                    return (
                        <span key={ph.key} className="inline-flex items-center gap-0.5">
                            <Link
                                href={phaseHref(ph.key)}
                                title={ph.summary || undefined}
                                className={cn(
                                    "rounded-md border px-2.5 py-1 tabular-nums",
                                    active ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-accent",
                                    done && "bg-emerald-500/5 text-muted-foreground",
                                    selected && "ring-1 ring-primary",
                                )}
                            >
                                {i + 1}. {ph.name}
                                <span className={cn("ml-1", active ? "text-primary/70" : "text-muted-foreground")}>
                                    {pp.done}/{pp.total}
                                </span>
                                {active ? <span className="ml-1 text-[10px] font-medium uppercase">now</span> : done ? " ✓" : ""}
                            </Link>
                            {canEditPhases ? <PhaseEdit contractId={c.id} phase={ph} index={i} count={phases.length} taskCount={list.length} asParam={asParam} /> : null}
                        </span>
                    );
                })
            )}
            {canEditPhases ? (
                <Link href={tabHref("plan", {}, "#phases")} className="ml-1 text-muted-foreground hover:underline">
                    {phases.length === 0 ? "Add one on the Plan tab" : "+ Add a phase on the Plan tab"}
                </Link>
            ) : null}
        </nav>
    );
}
