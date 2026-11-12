/**
 * Approvals queue — every task awaiting approval on my projects, oldest
 * first, with the one-click Approve the project page's "This week" panel
 * uses. A client that approves offline is recorded here by the account
 * manager ("Client approved"); changes go through the task page.
 */
import Link from "next/link";
import type { Contract } from "@/lib/data/contracts";
import type { Work } from "@/lib/data/works";
import { pendingFrom } from "@/lib/works/helpers";
import { reviewWorkAction } from "@/lib/works/actions";
import { DueLabel, SplitLabel, TypeBadge } from "@/app/(admin)/works/ui";
import { Button } from "@/components/ui/button";
import { waitingDays } from "./derive";

export function ApprovalsQueue({
    list,
    contracts,
    today,
    asQ,
    asField,
}: {
    /** Already sorted oldest first. */
    list: Work[];
    contracts: Map<string, Contract>;
    today: string;
    asQ: string;
    asField: React.ReactNode;
}) {
    const onClient = list.filter((w) => w.approver === "client").length;
    return (
        <section id="approvals" className="scroll-mt-4 rounded-lg border bg-card p-3 md:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium">
                    Approvals <span className="tabular-nums text-muted-foreground">· {list.length}</span>
                </h2>
                <p className="text-xs text-muted-foreground">
                    Oldest first.{onClient > 0 ? ` ${onClient} with the client — record their answer here.` : ""}
                </p>
            </div>
            {list.length === 0 ? (
                <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">Nothing waiting for approval.</p>
            ) : (
                <ul className="mt-2 divide-y text-sm">
                    {list.map((w) => {
                        const c = contracts.get(w.contractId);
                        const days = waitingDays(w, today);
                        return (
                            <li key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                                <div className="flex min-w-0 flex-1 basis-64 flex-col gap-0.5">
                                    <span className="truncate text-xs text-muted-foreground">
                                        {w.clientName || "—"}
                                        {c ? (
                                            <>
                                                {" · "}
                                                <Link href={`/projects/${c.id}${asQ}`} className="hover:underline">
                                                    {c.code}
                                                </Link>
                                            </>
                                        ) : null}
                                    </span>
                                    <span className="flex min-w-0 items-center gap-2">
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
                                    </span>
                                </div>
                                <DueLabel due={w.dueDate} status={w.status} today={today} adjusted={Boolean(w.defaultDueDate) && w.dueDate !== w.defaultDueDate} defaultDue={w.defaultDueDate} />
                                <SplitLabel split={w.split} short className="hidden md:inline" />
                                <span className={days !== null && days >= 3 ? "text-xs font-medium text-red-600 dark:text-red-400" : "text-xs text-amber-700 dark:text-amber-400"}>
                                    waits on {pendingFrom(w) || "—"}
                                    {days !== null ? ` · ${days}d` : " · not submitted"}
                                </span>
                                <span className="flex items-center gap-2">
                                    {w.approver !== "none" ? (
                                        <form action={reviewWorkAction}>
                                            <input type="hidden" name="id" value={w.id} />
                                            {asField}
                                            <Button
                                                type="submit"
                                                name="decision"
                                                value="approve"
                                                size="xs"
                                                variant={w.approver === "client" ? "outline" : "default"}
                                                title={w.approver === "client" ? `Client approved (via ${w.accountManager || "account manager"})` : `Approve as ${w.accountManager || "account manager"}`}
                                            >
                                                {w.approver === "client" ? "Client approved" : "Approve"}
                                            </Button>
                                        </form>
                                    ) : null}
                                    <Link href={`/works/${w.id}${asQ}`} className="text-xs text-muted-foreground underline" title="Ask for changes with a note on the task page">
                                        Changes
                                    </Link>
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
