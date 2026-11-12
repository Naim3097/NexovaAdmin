/**
 * The task list the Tasks and My tasks pages share: one table per project
 * under its client (or one flat table with a "Client · project" column),
 * optional sections above that (phases, urgency buckets), the one-line
 * summary and the empty state. Server components; task links keep the acting
 * member through `asQ`.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { Contract } from "@/lib/data/contracts";
import type { Work } from "@/lib/data/works";
import { NO_PHASE, byStatus, groupByPhase, isAdjusted, isOverdue, monthLabel, pendingFrom } from "@/lib/works/helpers";
import { waitingLabel } from "@/lib/works/waiting";
import { cn } from "@/lib/utils";
import { DueLabel, SplitLabel, TaskStatusBadge, TypeBadge } from "./ui";

/** "1 task" / "3 tasks". */
export function countLabel(n: number, noun: string): string {
    return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

export function byDue(list: Work[]): Work[] {
    return [...list].sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || a.title.localeCompare(b.title));
}

export type ContractGroup = { key: string; contract: Contract | null; works: Work[] };
export type ClientGroup = { client: string; contracts: ContractGroup[] };

/** Client → project → tasks by due date. Tasks whose project is gone sit under "No project". */
export function groupByClient(list: Work[], contracts: Contract[]): ClientGroup[] {
    const byId = new Map(contracts.map((c) => [c.id, c]));
    const clients = new Map<string, Map<string, ContractGroup>>();
    for (const w of list) {
        const client = w.clientName || "No client";
        const groups = clients.get(client) ?? new Map<string, ContractGroup>();
        const key = w.contractId || "none";
        const g = groups.get(key) ?? { key, contract: byId.get(w.contractId) ?? null, works: [] };
        g.works.push(w);
        groups.set(key, g);
        clients.set(client, groups);
    }
    return [...clients.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([client, groups]) => ({
            client,
            contracts: [...groups.values()]
                .sort((a, b) => (a.contract?.code ?? "~").localeCompare(b.contract?.code ?? "~"))
                .map((g) => ({ ...g, works: byDue(g.works) })),
        }));
}

/**
 * Phase names of the projects these tasks belong to, in project order,
 * de-duplicated — the order the phase grouping and the Phase dropdown follow.
 */
export function phaseOrderOf(list: Work[], contracts: Contract[]): string[] {
    const ids = new Set(list.map((w) => w.contractId));
    return [...new Set(contracts.filter((c) => ids.has(c.id)).flatMap((c) => c.phases.map((p) => p.name)))];
}

/** One titled block of the list: a phase, an urgency bucket … */
export type TaskSection = {
    key: string;
    title: string;
    /** "12 tasks · 3 clients", "4 tasks · 6.5h" … */
    meta?: ReactNode;
    works: Work[];
    /** Tone for the title (muted for "No phase", red for overdue …). */
    titleClassName?: string;
};

/** The list split by phase, in the projects' phase order, "No phase" last. */
export function phaseSections(list: Work[], contracts: Contract[]): TaskSection[] {
    return [...groupByPhase(list, phaseOrderOf(list, contracts)).entries()].map(([phase, works]) => ({
        key: phase,
        title: phase,
        meta: `${countLabel(works.length, "task")} · ${countLabel(groupByClient(works, contracts).length, "client")}`,
        works,
        titleClassName: phase === NO_PHASE ? "text-muted-foreground" : undefined,
    }));
}

/** Renders the trailing cell of a row — My tasks puts Start / Submit / Approve / Changes there. */
export type RowActionsRenderer = (w: Work) => ReactNode;

type TableProps = {
    today: string;
    /** `?as=…` to keep the acting member on task links ("" with a real login). */
    asQ: string;
    /** Hidden when the list is already grouped by phase. */
    showPhase?: boolean;
    /** A "Client · project" column, for flat lists not nested under their project. */
    showContract?: boolean;
    contractById?: Map<string, Contract>;
    actions?: RowActionsRenderer;
};

/** The task table itself: one row per task, due date order is the caller's. */
export function WorkTable({
    works,
    today,
    asQ,
    showPhase = true,
    showContract = false,
    contractById,
    actions,
    className,
}: TableProps & { works: Work[]; className?: string }) {
    const minW = showContract ? (actions ? "min-w-[1160px]" : "min-w-[1040px]") : actions ? "min-w-[1000px]" : "min-w-[880px]";
    return (
        <div className={cn("overflow-x-auto", className)}>
            <table className={cn("w-full text-sm", minW)}>
                <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                        <th className="py-1 pr-3 font-medium">Task</th>
                        {showContract ? <th className="py-1 pr-3 font-medium">Client · account</th> : null}
                        <th className="py-1 pr-3 font-medium">Type</th>
                        <th className="py-1 pr-3 font-medium">Channel</th>
                        <th className="py-1 pr-3 font-medium">Month</th>
                        {showPhase ? <th className="py-1 pr-3 font-medium">Phase</th> : null}
                        <th className="py-1 pr-3 font-medium">Owners</th>
                        <th className="py-1 pr-3 font-medium">Due</th>
                        <th className="py-1 pr-3 font-medium">Status</th>
                        <th className={actions ? "py-1 pr-3 font-medium" : "py-1 font-medium"}>Waiting on</th>
                        {actions ? (
                            <th className="py-1 font-medium">
                                <span className="sr-only">Actions</span>
                            </th>
                        ) : null}
                    </tr>
                </thead>
                <tbody>
                    {works.map((w) => {
                        const contract = showContract ? (contractById?.get(w.contractId) ?? null) : null;
                        return (
                            <tr key={w.id} className="border-t align-top">
                                <td className="py-2 pr-3">
                                    <Link href={`/works/${w.id}${asQ}`} className="font-medium hover:underline">
                                        {w.title}
                                    </Link>
                                    {w.milestone ? (
                                        <span title="Milestone" className="ml-1 text-amber-500">
                                            ◆
                                        </span>
                                    ) : null}
                                </td>
                                {showContract ? (
                                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                                        {w.clientName || "No client"}
                                        {" · "}
                                        {contract ? (
                                            <Link href={`/projects/${contract.id}#works`} className="hover:underline" title={contract.name}>
                                                {contract.code}
                                            </Link>
                                        ) : (
                                            "No account"
                                        )}
                                    </td>
                                ) : null}
                                <td className="py-2 pr-3">
                                    <TypeBadge type={w.type} short />
                                </td>
                                <td className="py-2 pr-3 text-xs text-muted-foreground">{w.channel || "—"}</td>
                                <td className="whitespace-nowrap py-2 pr-3 text-xs text-muted-foreground">{monthLabel(w.month)}</td>
                                {showPhase ? <td className="py-2 pr-3 text-xs text-muted-foreground">{w.phaseName || "—"}</td> : null}
                                <td className="py-2 pr-3">
                                    <SplitLabel split={w.split} short />
                                </td>
                                <td className="whitespace-nowrap py-2 pr-3">
                                    <DueLabel due={w.dueDate} status={w.status} today={today} adjusted={isAdjusted(w)} defaultDue={w.defaultDueDate} />
                                </td>
                                <td className="py-2 pr-3">
                                    <TaskStatusBadge status={w.status} />
                                </td>
                                <td className={actions ? "py-2 pr-3 text-xs text-muted-foreground" : "py-2 text-xs text-muted-foreground"}>
                                    {w.waitingOn && w.status !== "completed" ? (
                                        <span className={cn("font-medium", w.waitingOn === "client" ? "text-amber-700 dark:text-amber-400" : "text-foreground")} title={w.waitingSince ? `Blocked since ${w.waitingSince.slice(0, 10)}` : undefined}>
                                            {waitingLabel(w, today)}
                                        </span>
                                    ) : (
                                        pendingFrom(w) || "—"
                                    )}
                                </td>
                                {actions ? <td className="py-2">{actions(w)}</td> : null}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

/** The client → project → task table the list view renders. */
export function ClientGroups({ groups, today, asQ, showPhase = true, actions }: TableProps & { groups: ClientGroup[] }) {
    return (
        <ul className="divide-y">
            {groups.map((g) => (
                <li key={g.client} className="p-4">
                    <h2 className="font-medium">{g.client}</h2>
                    <div className="mt-2 space-y-4">
                        {g.contracts.map((cg) => (
                            <div key={cg.key}>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                                    {cg.contract ? (
                                        <>
                                            <Link href={`/projects/${cg.contract.id}#works`} className="font-medium hover:underline">
                                                {cg.contract.code} · {cg.contract.name}
                                            </Link>
                                            <span className="text-xs text-muted-foreground">AM {cg.contract.accountManager || "—"}</span>
                                        </>
                                    ) : (
                                        <span className="font-medium text-muted-foreground">No account</span>
                                    )}
                                    <span className="text-xs text-muted-foreground">· {countLabel(cg.works.length, "task")}</span>
                                </div>
                                <WorkTable className="mt-2" works={cg.works} today={today} asQ={asQ} showPhase={showPhase} actions={actions} />
                            </div>
                        ))}
                    </div>
                </li>
            ))}
        </ul>
    );
}

/**
 * The list view: client → project tables, optionally under section headers
 * (phases, urgency buckets), or — `flat` — one table per section with a
 * "Client · project" column instead of the nesting.
 */
export function TaskList({
    works,
    contracts,
    today,
    asQ,
    sections,
    flat = false,
    showPhase = true,
    actions,
}: {
    works: Work[];
    contracts: Contract[];
    today: string;
    asQ: string;
    /** Split the list into titled sections; none = one list. */
    sections?: TaskSection[];
    flat?: boolean;
    showPhase?: boolean;
    actions?: RowActionsRenderer;
}) {
    const contractById = new Map(contracts.map((c) => [c.id, c]));
    const body = (list: Work[]) =>
        flat ? (
            <WorkTable className="p-4" works={byDue(list)} today={today} asQ={asQ} showPhase={showPhase} showContract contractById={contractById} actions={actions} />
        ) : (
            <ClientGroups groups={groupByClient(list, contracts)} today={today} asQ={asQ} showPhase={showPhase} actions={actions} />
        );
    return (
        <div className="rounded-lg border bg-card">
            {sections ? (
                <div className="divide-y">
                    {sections.map((s) => (
                        <section key={s.key}>
                            <div className="flex flex-wrap items-baseline gap-x-2 border-b bg-muted/30 px-4 py-2">
                                <h2 className={cn("text-sm font-medium", s.titleClassName)}>{s.title}</h2>
                                {s.meta ? <span className="text-xs text-muted-foreground">{s.meta}</span> : null}
                            </div>
                            {body(s.works)}
                        </section>
                    ))}
                </div>
            ) : (
                body(works)
            )}
        </div>
    );
}

/** "12 tasks · 3 clients · 9 open · 2 overdue · 1 in review · 3 done". */
export function TaskSummary({ works, today }: { works: Work[]; today: string }) {
    const counts = byStatus(works);
    const open = works.filter((w) => w.status !== "completed").length;
    const overdue = works.filter((w) => isOverdue(w, today)).length;
    const clients = new Set(works.map((w) => w.clientName || "No client")).size;
    return (
        <p className="text-xs text-muted-foreground tabular-nums">
            <span className="font-medium text-foreground">{countLabel(works.length, "task")}</span>
            {" · "}
            {countLabel(clients, "client")} · {open} open ·{" "}
            <span className={cn(overdue > 0 && "font-medium text-red-600 dark:text-red-400")}>{overdue} overdue</span> ·{" "}
            <span className={cn(counts.pending_approval.length > 0 && "text-amber-700 dark:text-amber-400")}>{counts.pending_approval.length} in review</span> ·{" "}
            {counts.completed.length} done
        </p>
    );
}

/** The empty card: "clear the filter" when one is on, else the page's own message. */
export function TaskEmpty({ filtered, clearHref, children }: { filtered: boolean; clearHref: string; children: ReactNode }) {
    return (
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            {filtered ? (
                <>
                    Nothing matches —{" "}
                    <Link href={clearHref} className="underline">
                        clear the filter
                    </Link>
                    .
                </>
            ) : (
                children
            )}
        </div>
    );
}
