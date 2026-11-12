/**
 * Delivery tab maths — the head of delivery's numbers, read off the tasks and
 * projects the dashboard page already loaded: the six tiles, status per
 * project, the weekly flow, review age and the projects most behind. Pure
 * functions, no I/O; the view only renders what comes back.
 *
 * Month rules: a task belongs to the month it is delivered in (`Work.month`),
 * so "done vs planned" and the per-project bars follow that; the on-time
 * rate, rework and the weekly flow go by when the thing happened
 * (`completedAt`, `review.at`, `submittedAt`). Delivery covers every
 * project, internal ones included — they are only labelled.
 *
 * All time (`month` = ALL_TIME): every task counts as "in the month", so the
 * tiles read over all completions and all tasks and the per-project bars over
 * every month; the weekly flow stays the last FLOW_WEEKS weeks.
 */
import type { Client } from "@/lib/data/clients";
import type { Contract } from "@/lib/data/contracts";
import type { TaskStatus, Work } from "@/lib/data/works";
import type { Tile } from "@/app/(admin)/dashboard/tiles";
import { internalClientNames } from "@/lib/clients/internal";
import { ALL_TIME } from "@/lib/dashboard/data";
import { APPROVAL_WAIT_DAYS, approvalAgeDays, daysSince, type Health } from "@/lib/management/metrics";
import { isOpen, isOverdue, shiftYmd } from "@/lib/works/helpers";
import { waitingDays } from "@/lib/works/waiting";

/** Weeks on the flow chart, ending with today's. */
export const FLOW_WEEKS = 8;
/** On-time rate: green from here up. */
export const ON_TIME_GREEN_PCT = 90;
/** On-time rate: amber from here up, red below. */
export const ON_TIME_AMBER_PCT = 75;
/** Rework above this share of the month's submissions turns the tile amber. */
export const REWORK_WARN_PCT = 10;
/** Review age buckets: under REVIEW_FRESH_DAYS, up to REVIEW_STALE_DAYS, over it. */
export const REVIEW_FRESH_DAYS = 2;
export const REVIEW_STALE_DAYS = 5;
/** The Behind table shows this many projects. */
export const BEHIND_ROWS = 5;

export type DeliveryInput = {
    works: Work[];
    contracts: Contract[];
    /** Only for the internal flag on project rows. */
    clients: Client[];
    /** YYYY-MM the numbers are read for, or ALL_TIME. */
    month: string;
    /** YYYY-MM-DD. */
    today: string;
};

/** A project as the sections name it; `code` is "" when the project is gone. */
export type ProjectRow = {
    id: string;
    code: string;
    name: string;
    clientName: string;
    accountManager: string;
    /** The client is our own company. */
    internal: boolean;
    href: string;
};

/** One project's tasks in the month by status, for the stacked bar. */
export type ProjectStatus = ProjectRow & {
    total: number;
    done: number;
    inProgress: number;
    inReview: number;
    notStarted: number;
    /** Open tasks in the month past their due date (they also sit in the counts above). */
    overdue: number;
};

export type WeekFlow = {
    /** Monday, YYYY-MM-DD. */
    start: string;
    /** Sunday, YYYY-MM-DD. */
    end: string;
    /** "3 Nov": the Monday. */
    label: string;
    /** Tasks completed in the week. */
    done: number;
    /** Tasks due in the week that were not completed by its end (still open, or finished later). */
    wentOverdue: number;
    /** The week today falls in; still running. */
    current: boolean;
};

export type ReviewAgeRow = {
    key: "fresh" | "mid" | "stale";
    label: string;
    count: number;
    /** Approved by the account manager. */
    am: number;
    /** Approved by the client (through the account manager). */
    client: number;
    tone: Health;
};

export type BehindRow = ProjectRow & {
    overdue: number;
    inReview: number;
    waitingClient: number;
    monthDone: number;
    monthTotal: number;
    /** null when the project has no tasks in the month (under All time: no tasks at all). */
    donePct: number | null;
    health: Health;
};

export type DeliverySnapshot = {
    tiles: Tile[];
    /** Every project with tasks in the month (any month under All time), worst first. */
    projects: ProjectStatus[];
    /** FLOW_WEEKS weeks, oldest first, ending with today's. */
    weeks: WeekFlow[];
    /** The three age buckets, freshest first. */
    reviewAge: ReviewAgeRow[];
    /** At most BEHIND_ROWS projects, most behind first. */
    behind: BehindRow[];
};

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const norm = (s: string) => s.trim().toLowerCase();

/** The date part of an ISO timestamp; "" when there is none. */
function ymd(iso: string | null | undefined): string {
    return (iso ?? "").slice(0, 10);
}

/** True when the timestamp falls in the YYYY-MM month; under All time, whenever there is one. */
function inMonth(iso: string | null | undefined, month: string): boolean {
    if (month === ALL_TIME) return Boolean(ymd(iso));
    return Boolean(month) && ymd(iso).startsWith(month);
}

/** True when the task is delivered in the month (every task under All time). */
function ofMonth(w: Pick<Work, "month">, month: string): boolean {
    return month === ALL_TIME || w.month === month;
}

/** `?month=…` for a /works link, or "" under All time (no month filter there means every month). */
function worksMonth(month: string, sep: "?" | "&"): string {
    return month === ALL_TIME ? "" : `${sep}month=${month}`;
}

function pct(part: number, whole: number): number {
    return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** "3 Nov" for a YYYY-MM-DD. */
function shortDay(d: string): string {
    const [, m, day] = d.split("-").map(Number);
    return `${day} ${MONTH_SHORT[m - 1]}`;
}

/** Monday of the week the day falls in; weeks run Mon–Sun. */
export function mondayOf(day: string): string {
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    return shiftYmd(day, -((dow + 6) % 7));
}

function groupByContract(list: Work[]): Map<string, Work[]> {
    const out = new Map<string, Work[]>();
    for (const w of list) out.set(w.contractId, [...(out.get(w.contractId) ?? []), w]);
    return out;
}

/** The project behind a group of tasks; a task whose project is gone still gets a row. */
function projectRow(contractId: string, byId: Map<string, Contract>, internal: Set<string>, sample: Work, month: string): ProjectRow {
    const c = byId.get(contractId);
    if (!c) {
        return {
            id: contractId || "none",
            code: "",
            name: "No project",
            clientName: sample.clientName,
            accountManager: sample.accountManager,
            internal: internal.has(norm(sample.clientName)),
            href: `/works${sample.clientName ? `?client=${encodeURIComponent(sample.clientName)}${worksMonth(month, "&")}` : worksMonth(month, "?")}`,
        };
    }
    return {
        id: c.id,
        code: c.code,
        name: c.name,
        clientName: c.clientName,
        accountManager: c.accountManager,
        internal: internal.has(norm(c.clientName)),
        href: `/projects/${c.id}#works`,
    };
}

// ---------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------

function buildTiles(works: Work[], month: string, today: string): Tile[] {
    const current = today.slice(0, 7);
    const allTime = month === ALL_TIME;
    const isCurrent = month === current;
    const when = allTime ? "all time" : isCurrent ? "this month" : MONTH_SHORT[Number(month.slice(5, 7)) - 1];
    const open = works.filter(isOpen);

    // On time: of what was finished in the month, how much landed by its deadline.
    const finished = works.filter((w) => w.status === "completed" && inMonth(w.completedAt, month));
    const onTime = finished.filter((w) => !w.dueDate || ymd(w.completedAt) <= w.dueDate);
    const onTimePct = pct(onTime.length, finished.length);

    const overdue = open.filter((w) => isOverdue(w, today));
    const worstLate = overdue.length ? Math.max(...overdue.map((w) => daysSince(w.dueDate, today))) : 0;

    const review = open.filter((w) => w.status === "pending_approval");
    const oldest = review.length ? Math.max(...review.map((w) => approvalAgeDays(w, today))) : 0;

    const waitingClient = open.filter((w) => w.waitingOn === "client");
    const longestWait = waitingClient.length ? Math.max(...waitingClient.map((w) => waitingDays(w, today))) : 0;

    const monthWorks = works.filter((w) => ofMonth(w, month));
    const done = monthWorks.filter((w) => !isOpen(w)).length;
    // A past month left unfinished is amber; under All time, any earlier month with open tasks.
    const unfinishedPast = allTime ? monthWorks.some((w) => w.month < current && isOpen(w)) : month < current && done < monthWorks.length;

    // Rework: changes asked in the month, against everything that reached a reviewer in it.
    const rework = works.filter((w) => w.review.decision === "changes" && inMonth(w.review.at, month));
    const submitted = works.filter((w) => inMonth(w.submittedAt, month) || inMonth(w.review.at, month));
    const reworkPct = pct(rework.length, submitted.length);

    return [
        {
            key: "on-time",
            label: "On-time rate",
            value: finished.length ? `${onTimePct}%` : "—",
            hint: finished.length ? `${onTime.length} of ${finished.length} by deadline` : isCurrent || allTime ? "nothing finished yet" : "nothing finished",
            health: !finished.length || onTimePct >= ON_TIME_GREEN_PCT ? "green" : onTimePct >= ON_TIME_AMBER_PCT ? "amber" : "red",
            href: `/works?status=completed${worksMonth(month, "&")}`,
            count: finished.length,
        },
        {
            key: "overdue",
            label: "Overdue",
            value: String(overdue.length),
            hint: overdue.length ? `worst ${worstLate}d late` : "nothing past due",
            health: overdue.length ? "red" : "green",
            href: "/works?overdue=1",
            count: overdue.length,
        },
        {
            key: "review",
            label: "In review",
            value: String(review.length),
            hint: review.length ? `oldest ${oldest}d` : "nothing waiting",
            health: oldest > APPROVAL_WAIT_DAYS ? "amber" : "green",
            href: "/works?status=pending_approval",
            count: review.length,
        },
        {
            key: "waiting-client",
            label: "Waiting on clients",
            value: String(waitingClient.length),
            hint: waitingClient.length ? `longest ${longestWait}d` : "no client blockers",
            health: waitingClient.length ? "amber" : "green",
            href: "/works?status=open&waiting=client",
            count: waitingClient.length,
        },
        {
            key: "done",
            label: "Done vs planned",
            value: `${done} / ${monthWorks.length}`,
            hint: monthWorks.length ? `${pct(done, monthWorks.length)}% · ${when}` : `nothing planned ${when}`,
            health: unfinishedPast ? "amber" : "green",
            href: `/works${worksMonth(month, "?")}`,
            count: monthWorks.length,
        },
        {
            key: "rework",
            label: "Rework",
            value: String(rework.length),
            hint: rework.length ? `${reworkPct}% of ${submitted.length} submitted` : "no changes asked",
            health: reworkPct > REWORK_WARN_PCT ? "amber" : "green",
            href: `/works?status=in_progress${worksMonth(month, "&")}`,
            count: rework.length,
        },
    ];
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function buildProjects(monthWorks: Work[], byId: Map<string, Contract>, internal: Set<string>, month: string, today: string): ProjectStatus[] {
    const rows: ProjectStatus[] = [];
    for (const [cid, list] of groupByContract(monthWorks)) {
        const count = (s: TaskStatus) => list.filter((w) => w.status === s).length;
        rows.push({
            ...projectRow(cid, byId, internal, list[0], month),
            total: list.length,
            done: count("completed"),
            inProgress: count("in_progress"),
            inReview: count("pending_approval"),
            notStarted: count("not_started"),
            overdue: list.filter((w) => isOverdue(w, today)).length,
        });
    }
    return rows.sort((a, b) => b.overdue - a.overdue || b.inReview - a.inReview || b.total - b.done - (a.total - a.done) || a.name.localeCompare(b.name));
}

function buildWeeks(works: Work[], today: string): WeekFlow[] {
    const thisMonday = mondayOf(today);
    return Array.from({ length: FLOW_WEEKS }, (_, i) => {
        const start = shiftYmd(thisMonday, -7 * (FLOW_WEEKS - 1 - i));
        const end = shiftYmd(start, 6);
        const done = works.filter((w) => w.status === "completed" && ymd(w.completedAt) >= start && ymd(w.completedAt) <= end).length;
        // Due in the week, past now, and not finished by the Sunday — a deadline the week missed.
        const wentOverdue = works.filter((w) => w.dueDate >= start && w.dueDate <= end && w.dueDate < today && (isOpen(w) || ymd(w.completedAt) > end)).length;
        return { start, end, label: shortDay(start), done, wentOverdue, current: i === FLOW_WEEKS - 1 };
    });
}

function buildReviewAge(review: Work[], today: string): ReviewAgeRow[] {
    const bucket = (age: number): ReviewAgeRow["key"] => (age < REVIEW_FRESH_DAYS ? "fresh" : age > REVIEW_STALE_DAYS ? "stale" : "mid");
    const defs: Array<Pick<ReviewAgeRow, "key" | "label" | "tone">> = [
        { key: "fresh", label: `Under ${REVIEW_FRESH_DAYS} days`, tone: "green" },
        { key: "mid", label: `${REVIEW_FRESH_DAYS}–${REVIEW_STALE_DAYS} days`, tone: "amber" },
        { key: "stale", label: `Over ${REVIEW_STALE_DAYS} days`, tone: "red" },
    ];
    return defs.map((d) => {
        const list = review.filter((w) => bucket(approvalAgeDays(w, today)) === d.key);
        const client = list.filter((w) => w.approver === "client").length;
        return { ...d, count: list.length, am: list.length - client, client };
    });
}

function buildBehind(works: Work[], byId: Map<string, Contract>, internal: Set<string>, month: string, today: string): BehindRow[] {
    const rows: BehindRow[] = [];
    for (const [cid, list] of groupByContract(works)) {
        if (byId.get(cid)?.status === "cancelled") continue;
        const open = list.filter(isOpen);
        const inMonthList = list.filter((w) => ofMonth(w, month));
        const monthTotal = inMonthList.length;
        const monthDone = inMonthList.filter((w) => !isOpen(w)).length;
        const overdue = open.filter((w) => isOverdue(w, today)).length;
        const inReview = open.filter((w) => w.status === "pending_approval").length;
        const waitingClient = open.filter((w) => w.waitingOn === "client").length;
        const donePct = monthTotal ? pct(monthDone, monthTotal) : null;
        // Nothing late, nothing stuck and the month's work done (or none planned): not behind.
        if (overdue + inReview + waitingClient === 0 && (donePct === null || donePct >= 100)) continue;
        rows.push({
            ...projectRow(cid, byId, internal, list[0], month),
            overdue,
            inReview,
            waitingClient,
            monthDone,
            monthTotal,
            donePct,
            health: overdue ? "red" : inReview + waitingClient ? "amber" : "green",
        });
    }
    return rows
        .sort(
            (a, b) =>
                b.overdue - a.overdue ||
                b.waitingClient - a.waitingClient ||
                b.inReview - a.inReview ||
                (a.donePct ?? 101) - (b.donePct ?? 101) ||
                a.name.localeCompare(b.name),
        )
        .slice(0, BEHIND_ROWS);
}

export function buildDeliverySnapshot(input: DeliveryInput): DeliverySnapshot {
    const { works, contracts, clients, month, today } = input;
    const byId = new Map(contracts.map((c) => [c.id, c]));
    const internal = internalClientNames(clients);
    const monthWorks = works.filter((w) => ofMonth(w, month));
    const review = works.filter((w) => w.status === "pending_approval");
    return {
        tiles: buildTiles(works, month, today),
        projects: buildProjects(monthWorks, byId, internal, month, today),
        weeks: buildWeeks(works, today),
        reviewAge: buildReviewAge(review, today),
        behind: buildBehind(works, byId, internal, month, today),
    };
}
