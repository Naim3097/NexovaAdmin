/**
 * The compact task list on "My tasks" and its inline quick actions. Server
 * components: every action is a plain <form action={serverAction}> carrying
 * the task id and who is acting.
 */
import Link from "next/link";
import type { Contract } from "@/lib/data/contracts";
import type { Work } from "@/lib/data/works";
import { shareHours } from "@/lib/capacity/helpers";
import { awaitsApprovalFrom, isAdjusted, pendingFrom } from "@/lib/works/helpers";
import { reviewWorkAction, startWorkAction, submitWorkAction } from "@/lib/works/actions";
import { PendingButton } from "@/components/pending-button";
import { DueLabel, HoursLabel, TaskStatusBadge, TypeBadge } from "@/app/(admin)/works/ui";
import { holdsShare } from "./buckets";

type RowProps = {
    w: Work;
    /** The member this page is scoped to. */
    me: string;
    today: string;
    contract: Contract | null;
    /** `?as=…` to keep the acting member on task links (empty with a real login). */
    asQ: string;
};

/** Start / Submit for my shares, Approve / Changes for approvals I owe. Also the row actions on the My tasks page. */
export function RowActions({ w, me }: { w: Work; me: string }) {
    const ids = (
        <>
            <input type="hidden" name="id" value={w.id} />
            <input type="hidden" name="as" value={me} />
        </>
    );
    if (awaitsApprovalFrom(w, me)) {
        return (
            <div className="flex flex-wrap gap-1">
                <form action={reviewWorkAction}>
                    {ids}
                    <input type="hidden" name="decision" value="approve" />
                    <PendingButton size="sm" pendingLabel="Approving…">
                        {w.approver === "client" ? "Client approved" : "Approve"}
                    </PendingButton>
                </form>
                <form action={reviewWorkAction}>
                    {ids}
                    <input type="hidden" name="decision" value="changes" />
                    <PendingButton size="sm" variant="outline" pendingLabel="Sending…">
                        Changes
                    </PendingButton>
                </form>
            </div>
        );
    }
    if (!holdsShare(w, me)) return null;
    if (w.status === "not_started") {
        return (
            <form action={startWorkAction}>
                {ids}
                <PendingButton size="sm" variant="outline" pendingLabel="Starting…">
                    Start
                </PendingButton>
            </form>
        );
    }
    if (w.status === "in_progress") {
        return (
            <form action={submitWorkAction}>
                {ids}
                <PendingButton size="sm" pendingLabel="Submitting…">
                    {w.approver === "none" ? "Mark done" : "Submit"}
                </PendingButton>
            </form>
        );
    }
    return null;
}

function TaskRow({ w, me, today, contract, asQ }: RowProps) {
    const hours = shareHours(w, me);
    return (
        <tr className="border-t align-top">
            <td className="py-2 pr-2">
                <TypeBadge type={w.type} short />
            </td>
            <td className="py-2 pr-3">
                <Link href={`/works/${w.id}${asQ}`} className="font-medium hover:underline">
                    {w.title}
                </Link>
                {w.milestone ? (
                    <span title="Milestone" className="ml-1 text-amber-500">
                        ◆
                    </span>
                ) : null}
                <div className="text-xs text-muted-foreground">
                    {w.clientName || "No client"}
                    {contract ? (
                        <>
                            {" · "}
                            <Link href={`/projects/${contract.id}#works`} className="hover:underline">
                                {contract.code}
                            </Link>
                        </>
                    ) : null}
                    {w.phaseName ? ` · ${w.phaseName}` : ""}
                    {w.channel ? ` · ${w.channel}` : ""}
                </div>
            </td>
            <td className="whitespace-nowrap py-2 pr-3">
                <DueLabel due={w.dueDate} status={w.status} today={today} adjusted={isAdjusted(w)} defaultDue={w.defaultDueDate} />
            </td>
            <td className="whitespace-nowrap py-2 pr-3">
                <HoursLabel hours={hours} title={hours > 0 ? "My planned working time on this task" : "Not an owner — sign-off only"} />
            </td>
            <td className="py-2 pr-3">
                <TaskStatusBadge status={w.status} />
            </td>
            <td className="py-2 pr-3 text-xs text-muted-foreground">{pendingFrom(w) || "—"}</td>
            <td className="py-2">
                <RowActions w={w} me={me} />
            </td>
        </tr>
    );
}

export function TaskTable({
    list,
    me,
    today,
    contractById,
    asQ,
}: {
    list: Work[];
    me: string;
    today: string;
    contractById: Map<string, Contract>;
    asQ: string;
}) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
                <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                        <th className="py-1 pr-2 font-medium">Type</th>
                        <th className="py-1 pr-3 font-medium">Task</th>
                        <th className="py-1 pr-3 font-medium">Due</th>
                        <th className="py-1 pr-3 font-medium">My hours</th>
                        <th className="py-1 pr-3 font-medium">Status</th>
                        <th className="py-1 pr-3 font-medium">Waiting on</th>
                        <th className="py-1 font-medium">
                            <span className="sr-only">Actions</span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {list.map((w) => (
                        <TaskRow key={w.id} w={w} me={me} today={today} contract={contractById.get(w.contractId) ?? null} asQ={asQ} />
                    ))}
                </tbody>
            </table>
        </div>
    );
}
