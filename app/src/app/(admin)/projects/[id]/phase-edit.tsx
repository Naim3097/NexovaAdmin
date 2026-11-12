"use client";
/**
 * The phase pop-up on the Tasks tab: rename, re-date (start and end month),
 * move up or down, or remove a phase. Opens from the pencil next to a phase
 * chip in the phases bar. Plain forms with hidden fields post to the contract
 * phase actions; each one closes the pop-up and refreshes when it is done.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { PlannerPhase } from "@/lib/data/planners";
import { movePhaseDownAction, movePhaseUpAction, removeContractPhaseAction, updateContractPhaseAction } from "@/lib/contracts/actions";

const LBL = "block text-xs text-muted-foreground";

export function PhaseEdit({
    contractId,
    phase,
    index,
    count,
    taskCount,
    asParam,
}: {
    contractId: string;
    phase: PlannerPhase;
    /** Position in the project's phase list (0-based) and how many there are, for the move buttons. */
    index: number;
    count: number;
    /** Tasks in the phase: they follow a rename and are left without a phase on remove. */
    taskCount: number;
    /** `?as=` under the dev bypass, so the server knows who is acting. */
    asParam?: string;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [pending, start] = useTransition();

    /** Run a phase action from a form, then close and refresh. */
    const run = (action: (fd: FormData) => Promise<void>) => (fd: FormData) =>
        start(async () => {
            await action(fd);
            setOpen(false);
            router.refresh();
        });

    const hidden = (
        <>
            <input type="hidden" name="id" value={contractId} />
            <input type="hidden" name="key" value={phase.key} />
            {asParam ? <input type="hidden" name="as" value={asParam} /> : null}
        </>
    );
    const tasks = `${taskCount} task${taskCount === 1 ? "" : "s"}`;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
                render={
                    <button
                        type="button"
                        aria-label={`Edit phase ${phase.name}`}
                        title={`Edit ${phase.name}`}
                        className="rounded-md border px-1.5 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                        ✎
                    </button>
                }
            />
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="pr-6 leading-snug">
                        Phase {index + 1} · {phase.name}
                    </DialogTitle>
                    <DialogDescription>{tasks} in it. A new name carries to its tasks; removing the phase leaves them without one.</DialogDescription>
                </DialogHeader>

                <form action={run(updateContractPhaseAction)} className="grid gap-3">
                    {hidden}
                    <label className="space-y-1">
                        <span className={LBL}>Name</span>
                        <Input name="name" defaultValue={phase.name} required className="h-9" />
                    </label>
                    <label className="space-y-1">
                        <span className={LBL}>Summary</span>
                        <Input name="summary" defaultValue={phase.summary} placeholder="What happens in it" className="h-9" />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        <label className="space-y-1">
                            <span className={LBL}>Start month</span>
                            <Input name="startMonth" type="month" defaultValue={phase.startMonth} className="h-9" />
                        </label>
                        <label className="space-y-1">
                            <span className={LBL}>End month</span>
                            <Input name="endMonth" type="month" defaultValue={phase.endMonth} className="h-9" />
                        </label>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground">Tasks take the phase their month falls in when they are added.</span>
                        <Button type="submit" size="sm" disabled={pending}>
                            {pending ? "Saving…" : "Save"}
                        </Button>
                    </div>
                </form>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                    <div className="flex gap-1">
                        <form action={run(movePhaseUpAction)}>
                            {hidden}
                            <Button type="submit" size="sm" variant="outline" disabled={pending || index === 0} title="Move up">
                                ↑ Move up
                            </Button>
                        </form>
                        <form action={run(movePhaseDownAction)}>
                            {hidden}
                            <Button type="submit" size="sm" variant="outline" disabled={pending || index >= count - 1} title="Move down">
                                ↓ Move down
                            </Button>
                        </form>
                    </div>
                    <form
                        action={run(removeContractPhaseAction)}
                        onSubmit={(e) => {
                            if (!window.confirm(`Remove the phase "${phase.name}"? Its ${tasks} stay, without a phase.`)) e.preventDefault();
                        }}
                    >
                        {hidden}
                        <Button type="submit" size="sm" variant="ghost" className="text-destructive" disabled={pending}>
                            Remove
                        </Button>
                    </form>
                </div>
            </DialogContent>
        </Dialog>
    );
}
