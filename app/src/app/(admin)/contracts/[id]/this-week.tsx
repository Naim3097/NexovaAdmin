/**
 * "This week" — what the account manager has to move right now: overdue
 * tasks, tasks due in the next seven days, tasks in review waiting on them
 * and tasks waiting on the client. Sections are disjoint: a task in review
 * sits in its review section (its due label still goes red when late), the
 * date sections hold the rest.
 */
import Link from "next/link";
import type { Work } from "@/lib/data/works";
import { daysBetween, isOpen, isOverdue, pendingFrom, shiftYmd } from "@/lib/works/helpers";
import { emptyFilter, type WorkFilter } from "@/lib/works/filter";
import { reviewWorkAction } from "@/lib/works/actions";
import { DueLabel, SplitLabel, TaskStatusBadge, TypeBadge } from "@/app/(admin)/works/ui";
import { Button } from "@/components/ui/button";
import { sortTasks, type ContractView } from "./shared";

const MAX_ROWS = 8;
const WINDOW_DAYS = 7;

type Section = {
    key: string;
    title: string;
    list: Work[];
    /** The Tasks list view holding the whole set. */
    more: string;
    /** Rows show who the task waits on and the quick Approve. */
    approval?: boolean;
};

export function ThisWeek({ v }: { v: ContractView }) {
    const { cWorks, today, href, asQ, asField } = v;
    const weekEnd = shiftYmd(today, WINDOW_DAYS);
    const listOf = (extra: Partial<WorkFilter>) => href({ view: "list", wm: undefined, cm: undefined }, { ...emptyFilter(), ...extra });

    const open = cWorks.filter(isOpen);
    const pending = open.filter((w) => w.status === "pending_approval");
    const dated = open.filter((w) => w.status !== "pending_approval");
    const sections: Section[] = [
        {
            key: "overdue",
            title: "Overdue",
            list: sortTasks(
                dated.filter((w) => isOverdue(w, today)),
                today,
            ),
            more: listOf({ overdue: true }),
        },
        {
            key: "due",
            title: `Due in the next ${WINDOW_DAYS} days`,
            list: sortTasks(
                dated.filter((w) => w.dueDate && w.dueDate >= today && w.dueDate <= weekEnd),
                today,
            ),
            more: listOf({}),
        },
        {
            key: "approve",
            title: "Review",
            list: sortTasks(
                pending.filter((w) => w.approver !== "client"),
                today,
            ),
            more: listOf({ status: "pending_approval" }),
            approval: true,
        },
        {
            key: "client",
            title: "Waiting on the client",
            list: sortTasks(
                pending.filter((w) => w.approver === "client"),
                today,
            ),
            more: listOf({ status: "pending_approval" }),
            approval: true,
        },
    ].filter((s) => s.list.length > 0);

    return (
        <section className="rounded-lg border bg-card p-3 md:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium">This week</h2>
                <p className="text-xs text-muted-foreground">Overdue, due by {weekEnd}, and tasks in review.</p>
            </div>
            {sections.length === 0 ? (
                <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">Nothing due this week — all clear.</p>
            ) : (
                <div className="mt-3 grid gap-4 lg:grid-cols-2">
                    {sections.map((s) => (
                        <div key={s.key}>
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {s.title} <span className="tabular-nums">· {s.list.length}</span>
                            </h3>
                            <ul className="mt-1 divide-y text-sm">
                                {s.list.slice(0, MAX_ROWS).map((w) => (
                                    <Row key={w.id} w={w} today={today} asQ={asQ} asField={asField} approval={Boolean(s.approval)} />
                                ))}
                            </ul>
                            {s.list.length > MAX_ROWS ? (
                                <Link href={s.more} className="mt-1 inline-block text-xs text-muted-foreground underline">
                                    and {s.list.length - MAX_ROWS} more
                                </Link>
                            ) : null}
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

function Row({ w, today, asQ, asField, approval }: { w: Work; today: string; asQ: string; asField: React.ReactNode; approval: boolean }) {
    const waiting = w.submittedAt ? daysBetween(w.submittedAt.slice(0, 10), today) : null;
    return (
        <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
            <div className="flex min-w-0 flex-1 basis-56 items-center gap-2">
                <TypeBadge type={w.type} short />
                <Link href={`/works/${w.id}${asQ}`} className="truncate font-medium hover:underline">
                    {w.title}
                </Link>
                {w.milestone ? (
                    <span title="Milestone" className="text-amber-500">
                        ◆
                    </span>
                ) : null}
                <span className="hidden truncate text-xs text-muted-foreground sm:inline">{w.phaseName || "—"}</span>
            </div>
            <DueLabel due={w.dueDate} status={w.status} today={today} adjusted={Boolean(w.defaultDueDate) && w.dueDate !== w.defaultDueDate} defaultDue={w.defaultDueDate} />
            <SplitLabel split={w.split} short />
            <TaskStatusBadge status={w.status} />
            {approval ? (
                <>
                    <span className="text-xs text-amber-700 dark:text-amber-400">
                        waiting on {pendingFrom(w) || "—"}
                        {waiting !== null ? ` · ${waiting}d` : ""}
                    </span>
                    {w.approver !== "none" ? (
                        <form action={reviewWorkAction}>
                            <input type="hidden" name="id" value={w.id} />
                            {asField}
                            <Button
                                type="submit"
                                name="decision"
                                value="approve"
                                size="xs"
                                variant="outline"
                                title={w.approver === "client" ? `The client approved (recorded by ${w.accountManager || "the AM"})` : `Approve as ${w.accountManager || "account manager"}`}
                            >
                                {w.approver === "client" ? "Client approved" : "Approve"}
                            </Button>
                        </form>
                    ) : null}
                </>
            ) : null}
        </li>
    );
}
