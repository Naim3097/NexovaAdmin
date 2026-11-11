/**
 * The board view the task pages share: one column per status, cards by due
 * date. Server component.
 */
import type { Work } from "@/lib/data/works";
import { TASK_STATUS_LABEL, TASK_STATUS_ORDER, byStatus } from "@/lib/works/helpers";
import { cn } from "@/lib/utils";
import { byDue } from "./task-list";
import { STATUS_DOT, WorkCard } from "./ui";

export function TaskBoard({ works, today, asQ }: { works: Work[]; today: string; asQ: string }) {
    const counts = byStatus(works);
    return (
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
    );
}
