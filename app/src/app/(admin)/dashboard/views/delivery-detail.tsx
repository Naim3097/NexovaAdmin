/**
 * The Delivery tab's pictures and tables under the tiles: one stacked status
 * bar per project, the weekly finished-vs-missed bars, review age and the
 * Behind table. Server components over `DeliverySnapshot`; no state. Plain
 * Tailwind, no chart library — the segment colours match @/components/bars.
 */
import Link from "next/link";
import type { BehindRow, ProjectStatus, ReviewAgeRow, WeekFlow } from "@/lib/dashboard/delivery";
import { FLOW_WEEKS } from "@/lib/dashboard/delivery";
import { BarList, Legend, MonthBars, type Series } from "@/components/bars";
import { Chip, Empty, HealthDot, TONE_TEXT, plural } from "@/app/(admin)/management/ui";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Status per project
// ---------------------------------------------------------------------------

/** The four segments of a project bar, in drawing order. */
export const STATUS_SERIES: Series[] = [
    { key: "done", label: "Done", tone: "green" },
    { key: "doing", label: "Doing", tone: "primary" },
    { key: "review", label: "In review", tone: "amber" },
    { key: "todo", label: "To do", tone: "muted" },
];

const SEGMENT_BG: Record<string, string> = {
    done: "bg-emerald-500/70",
    doing: "bg-primary/70",
    review: "bg-amber-500/80",
    todo: "bg-muted-foreground/30",
};

function ProjectName({ r, className }: { r: Pick<ProjectStatus, "href" | "code" | "name">; className?: string }) {
    return (
        <Link href={r.href} className={cn("block truncate font-medium hover:underline", className)} title={r.name}>
            {r.code ? `${r.code} · ` : ""}
            {r.name}
        </Link>
    );
}

function ProjectMeta({ r }: { r: Pick<ProjectStatus, "clientName" | "internal" | "accountManager"> }) {
    return (
        <p className="truncate text-xs text-muted-foreground">
            {r.clientName || "No client"}
            {r.internal ? " · internal" : ""}
            {r.accountManager ? ` · AM ${r.accountManager}` : ""}
        </p>
    );
}

export function ProjectStatusBars({ rows, allTime = false }: { rows: ProjectStatus[]; allTime?: boolean }) {
    if (rows.length === 0) return <Empty>{allTime ? "No project has tasks yet." : "No project has tasks in this month."}</Empty>;
    return (
        <ul className="divide-y">
            {rows.map((r) => {
                const parts: Array<[key: string, label: string, n: number]> = [
                    ["done", "Done", r.done],
                    ["doing", "Doing", r.inProgress],
                    ["review", "In review", r.inReview],
                    ["todo", "To do", r.notStarted],
                ];
                return (
                    <li key={r.id} className="grid gap-x-4 gap-y-1 py-2 text-sm sm:grid-cols-[minmax(0,15rem)_1fr_auto] sm:items-center">
                        <div className="min-w-0">
                            <ProjectName r={r} />
                            <ProjectMeta r={r} />
                        </div>
                        <div
                            className="flex h-2.5 w-full overflow-hidden rounded bg-muted"
                            role="img"
                            aria-label={parts.map(([, label, n]) => `${n} ${label.toLowerCase()}`).join(", ")}
                        >
                            {parts.map(([key, label, n]) =>
                                n > 0 ? <div key={key} className={cn("h-full", SEGMENT_BG[key])} style={{ width: `${(n / r.total) * 100}%` }} title={`${label} · ${n}`} /> : null,
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
                            <span>
                                <span className="font-medium">{r.done}</span>
                                <span className="text-muted-foreground">/{r.total} done</span>
                            </span>
                            {r.inReview > 0 ? <span className={TONE_TEXT.warn}>{r.inReview} in review</span> : null}
                            {r.overdue > 0 ? <Chip tone="bad">{r.overdue} overdue</Chip> : null}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

// ---------------------------------------------------------------------------
// Weekly flow
// ---------------------------------------------------------------------------

const FLOW_SERIES: Series[] = [
    { key: "done", label: "Finished", tone: "green" },
    { key: "missed", label: "Went overdue", tone: "red" },
];

export function WeeklyFlow({ weeks }: { weeks: WeekFlow[] }) {
    if (weeks.every((w) => w.done === 0 && w.wentOverdue === 0)) return <Empty>Nothing finished and no deadline missed in the last {FLOW_WEEKS} weeks.</Empty>;
    const finished = weeks.reduce((s, w) => s + w.done, 0);
    const missed = weeks.reduce((s, w) => s + w.wentOverdue, 0);
    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Legend series={FLOW_SERIES} />
                <span className="text-xs tabular-nums text-muted-foreground">
                    {plural(finished, "task")} finished · {plural(missed, "deadline")} missed
                </span>
            </div>
            <MonthBars
                points={weeks.map((w) => ({ month: w.start, label: w.label, values: { done: w.done, missed: w.wentOverdue } }))}
                series={FLOW_SERIES}
                height={140}
            />
            <p className="text-xs text-muted-foreground">Weeks run Monday to Sunday, labelled by their Monday; the last bar is this week so far.</p>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Review age
// ---------------------------------------------------------------------------

export function ReviewAge({ rows }: { rows: ReviewAgeRow[] }) {
    const total = rows.reduce((s, r) => s + r.count, 0);
    if (total === 0) return <Empty>Nothing is waiting for sign-off.</Empty>;
    return (
        <BarList
            rows={rows.map((r) => ({
                key: r.key,
                label: r.label,
                value: r.count,
                sub: r.count ? `${r.am} AM · ${r.client} client` : "",
                tone: r.count ? r.tone : "muted",
                href: "/works?status=pending_approval",
            }))}
        />
    );
}

// ---------------------------------------------------------------------------
// Behind
// ---------------------------------------------------------------------------

const TH = "py-2 pr-3 font-medium";
const NUM = "py-2 pr-3 text-right tabular-nums";

function Count({ n, tone }: { n: number; tone: "bad" | "warn" }) {
    return n > 0 ? <span className={cn("font-medium", TONE_TEXT[tone])}>{n}</span> : <span className="text-muted-foreground">0</span>;
}

/** `doneLabel` heads the done/planned column: "Done this month", "Done · Dec 2026" or "Done · all time". */
export function BehindTable({ rows, doneLabel = "Done this month" }: { rows: BehindRow[]; doneLabel?: string }) {
    if (rows.length === 0) return <Empty>No project is behind.</Empty>;
    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
                <thead>
                    <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        <th scope="col" className={TH}>
                            Project
                        </th>
                        <th scope="col" className={cn(TH, "text-right")} title="Open tasks past their due date">
                            Overdue
                        </th>
                        <th scope="col" className={cn(TH, "text-right")} title="Tasks waiting for sign-off">
                            In review
                        </th>
                        <th scope="col" className={cn(TH, "text-right")} title="Open tasks marked as waiting on the client">
                            Waiting on client
                        </th>
                        <th scope="col" className={cn(TH, "text-right")} title="Tasks delivered: done / planned">
                            {doneLabel}
                        </th>
                        <th scope="col" className="py-2 font-medium">
                            AM
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {rows.map((r) => (
                        <tr key={r.id}>
                            <td className="py-2 pr-3">
                                <span className="flex min-w-0 items-center gap-2">
                                    <HealthDot health={r.health} />
                                    <ProjectName r={r} />
                                </span>
                                <span className="block pl-[18px]">
                                    <ProjectMeta r={{ clientName: r.clientName, internal: r.internal, accountManager: "" }} />
                                </span>
                            </td>
                            <td className={NUM}>
                                <Count n={r.overdue} tone="bad" />
                            </td>
                            <td className={NUM}>
                                <Count n={r.inReview} tone="warn" />
                            </td>
                            <td className={NUM}>
                                <Count n={r.waitingClient} tone="warn" />
                            </td>
                            <td className={cn(NUM, "whitespace-nowrap")}>
                                {r.donePct === null ? (
                                    <span className="text-muted-foreground">—</span>
                                ) : (
                                    <>
                                        <span className="font-medium">{r.donePct}%</span>
                                        <span className="text-muted-foreground">
                                            {" "}
                                            · {r.monthDone}/{r.monthTotal}
                                        </span>
                                    </>
                                )}
                            </td>
                            <td className="py-2 text-xs text-muted-foreground">{r.accountManager || "—"}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
