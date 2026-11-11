/**
 * Tasks tab (default, `?tab=work`): what needs moving this week, where the
 * contract is in its phases, then the full Tasks section.
 */
import Link from "next/link";
import { progress } from "@/lib/works/helpers";
import { cn } from "@/lib/utils";
import { ThisWeek } from "../this-week";
import { TasksSection } from "../tasks";
import type { ContractView } from "../shared";

export function WorkTab({ v }: { v: ContractView }) {
    return (
        <>
            <ThisWeek v={v} />
            <PhasesBar v={v} />
            <TasksSection v={v} />
        </>
    );
}

/** The phases in one line — name, done/total, the current one highlighted. Editing lives on the Scope tab. */
function PhasesBar({ v }: { v: ContractView }) {
    const { phases, thisMonth, currentPhase, phaseWorks, phaseHref, tabHref, group, filter } = v;
    return (
        <nav aria-label="Phases" className="flex flex-wrap items-center gap-1.5 text-xs">
            {phases.length === 0 ? (
                <span className="text-muted-foreground">No phases on this contract yet.</span>
            ) : (
                phases.map((ph, i) => {
                    const pp = progress(phaseWorks(ph.key, ph.name));
                    const active = currentPhase?.key === ph.key;
                    const done = !active && Boolean(ph.endMonth) && ph.endMonth < thisMonth;
                    const selected = group === "phase" && (filter.phase === ph.key || filter.phase === ph.name);
                    return (
                        <Link
                            key={ph.key}
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
                    );
                })
            )}
            <Link href={tabHref("plan")} className="ml-1 text-muted-foreground hover:underline">
                {phases.length === 0 ? "Set them up on the Scope tab" : "Edit on the Scope tab"}
            </Link>
        </nav>
    );
}
