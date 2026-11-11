/**
 * "Also on" — the contracts someone else manages where I hold a task share:
 * my tasks grouped by contract, each linking to the task and the contract.
 * Pairs with `alsoOnGroups` in derive.ts; the Home page reuses both.
 */
import Link from "next/link";
import { CONTRACT_STAGE_LABEL } from "@/lib/data/contracts";
import { emptyFilter, filterQuery } from "@/lib/works/filter";
import { isAdjusted, isOpen, monthLabel } from "@/lib/works/helpers";
import { DueLabel, TaskStatusBadge, TypeBadge } from "@/app/(admin)/works/ui";
import { Badge } from "@/components/ui/badge";
import type { AlsoOnGroup } from "./derive";

/** Rows shown per contract before "see all" takes over. */
export const ALSO_ON_LIMIT = 8;

export function AlsoOn({
    groups,
    me,
    today,
    asQ,
    asParam,
    showDone = false,
    limit = ALSO_ON_LIMIT,
}: {
    groups: AlsoOnGroup[];
    /** Whose tasks these are — the "see all" link filters the contract board to them. */
    me: string;
    today: string;
    asQ: string;
    asParam?: string;
    showDone?: boolean;
    limit?: number;
}) {
    return (
        <section id="also-on" className="scroll-mt-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium">
                    Also on <span className="tabular-nums text-muted-foreground">· {groups.length}</span>
                </h2>
                <p className="text-xs text-muted-foreground">Contracts someone else manages where you hold a task.</p>
            </div>
            {groups.length === 0 ? (
                <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">No tasks on other people&apos;s contracts.</div>
            ) : (
                <ul className="space-y-3">
                    {groups.map((g) => {
                        const { c } = g;
                        const all = showDone ? g.works : g.works.filter(isOpen);
                        const shown = all.slice(0, limit);
                        const more = all.length - shown.length;
                        const seeAll = `/contracts/${c.id}${filterQuery({ ...emptyFilter(), member: me }, { view: "list", as: asParam })}#works`;
                        return (
                            <li key={c.id} className="rounded-lg border bg-card p-3 md:p-4">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Link href={`/contracts/${c.id}${asQ}`} className="font-medium hover:underline">
                                                {c.name}
                                            </Link>
                                            <Badge>{CONTRACT_STAGE_LABEL[c.stage]}</Badge>
                                            {c.status === "draft" ? <Badge variant="outline">draft</Badge> : null}
                                        </div>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            <span className="font-medium text-foreground">{c.clientName}</span> · {c.code} · Account manager{" "}
                                            <span className="font-medium text-foreground">{c.accountManager || "—"}</span>
                                        </p>
                                    </div>
                                    <p className="text-xs text-muted-foreground tabular-nums">
                                        {g.open} open · {g.done} done ·{" "}
                                        <Link href={seeAll} className="underline">
                                            see all
                                        </Link>
                                    </p>
                                </div>
                                {shown.length === 0 ? (
                                    <p className="mt-2 border-t pt-2 text-sm text-emerald-700 dark:text-emerald-400">All your tasks here are done.</p>
                                ) : (
                                    <ul className="mt-2 divide-y border-t text-sm">
                                        {shown.map((w) => (
                                            <li key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                                                <span className="flex min-w-0 flex-1 basis-64 items-center gap-2">
                                                    <TypeBadge type={w.type} short />
                                                    <Link href={`/works/${w.id}${asQ}`} className="truncate font-medium hover:underline">
                                                        {w.title}
                                                    </Link>
                                                    {w.milestone ? (
                                                        <span title="Milestone" className="text-amber-500">
                                                            ◆
                                                        </span>
                                                    ) : null}
                                                </span>
                                                <span className="whitespace-nowrap text-xs text-muted-foreground">
                                                    {monthLabel(w.month)}
                                                    {w.phaseName ? ` · ${w.phaseName}` : ""}
                                                </span>
                                                <DueLabel due={w.dueDate} status={w.status} today={today} adjusted={isAdjusted(w)} defaultDue={w.defaultDueDate} />
                                                <TaskStatusBadge status={w.status} />
                                            </li>
                                        ))}
                                        {more > 0 ? (
                                            <li className="py-2 text-xs text-muted-foreground">
                                                <Link href={seeAll} className="underline">
                                                    +{more} more
                                                </Link>
                                            </li>
                                        ) : null}
                                    </ul>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
