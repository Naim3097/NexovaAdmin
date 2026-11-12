/**
 * Work (task) helpers — pure functions shared by the task pages, the project
 * board, the calendar and the Management tabs. No I/O.
 */
import type { Contract } from "@/lib/data/contracts";
import type { TaskStatus, Work, WorkShare } from "@/lib/data/works";
import type { TeamMember } from "@/lib/data/team";
import { SEAT_CATEGORIES, SEAT_LABEL, SEAT_SHORT, type LineType, type Seat, type SplitShare } from "@/lib/planners/vocab";
import { withHours } from "@/lib/capacity/helpers";

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
    not_started: "To do",
    in_progress: "Doing",
    pending_approval: "Review",
    completed: "Done",
};

export const TASK_STATUS_ORDER: TaskStatus[] = ["not_started", "in_progress", "pending_approval", "completed"];

export function todayKey(): string {
    return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export function daysInMonth(month: string): number {
    const [y, m] = month.split("-").map(Number);
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** YYYY-MM-DD for day `day` of `month`, clamped to the month's length. */
export function dateForDay(month: string, day: number): string {
    const d = Math.max(1, Math.min(daysInMonth(month), Math.round(day)));
    return `${month}-${String(d).padStart(2, "0")}`;
}

export function shiftYmd(ymd: string, days: number): string {
    return new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(fromYmd: string, toYmd: string): number {
    return Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / 86_400_000);
}

export function nextMonth(month: string): string {
    const [y, m] = month.split("-").map(Number);
    return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
}

export function monthLabel(ym: string): string {
    if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-MY", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Every YYYY-MM from `from` to `to` inclusive. */
export function monthRange(from: string, to: string): string[] {
    if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to) || to < from) return from ? [from] : [];
    const out: string[] = [];
    let m = from;
    while (m <= to && out.length < 60) {
        out.push(m);
        m = nextMonth(m);
    }
    return out;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/** First active team member who can hold the seat, or "" when nobody can. */
export function resolveSeat(seat: Seat, contract: Pick<Contract, "accountManager">, team: TeamMember[], type?: LineType): string {
    if (seat === "am" && contract.accountManager) return contract.accountManager;
    const active = team.filter((m) => m.active);
    void type;
    for (const category of SEAT_CATEGORIES[seat]) {
        const hit = active.find((m) => m.category === category);
        if (hit) return hit.name;
    }
    return "";
}

/** Turn a planner split (seats) into a work split (people), with each person's hours prefilled from their profile. */
export function resolveSplit(split: SplitShare[], contract: Pick<Contract, "accountManager">, team: TeamMember[], type?: LineType): WorkShare[] {
    return withHours(
        split.map((s) => ({ seat: s.seat, pct: s.pct, member: resolveSeat(s.seat, contract, team, type) })),
        team,
        type ?? "custom",
    );
}

/** The person holding the biggest share ("" when nobody is assigned). */
export function primaryMember(w: Work): string {
    return [...w.split].sort((a, b) => b.pct - a.pct).find((s) => s.member)?.member ?? "";
}

export function members(w: Work): string[] {
    return [...new Set(w.split.map((s) => s.member).filter(Boolean))];
}

/** "Aisha 50% · Mei 50%" (seat label when nobody holds the seat yet). */
export function splitLabel(w: Work, short = false): string {
    return w.split
        .map((s) => `${s.member || (short ? SEAT_SHORT[s.seat] : SEAT_LABEL[s.seat])} ${s.pct}%`)
        .join(" · ");
}

export function splitTotal(split: Array<{ pct: number }>): number {
    return split.reduce((sum, s) => sum + (Number(s.pct) || 0), 0);
}

/** Who the task is waiting on right now. */
export function pendingFrom(w: Work): string {
    if (w.status === "completed") return "";
    if (w.status === "pending_approval") {
        return w.approver === "client" ? `client (via ${w.accountManager || "AM"})` : w.accountManager || "account manager";
    }
    const open = w.split.filter((s) => s.pct > 0);
    if (open.length === 0) return "";
    return open.map((s) => s.member || SEAT_LABEL[s.seat]).join(" & ");
}

/**
 * Does this person have a stake in the task: a share of it, or the approval
 * while it waits (account manager, or the client through them).
 */
export function involves(w: Work, member: string): boolean {
    if (!member) return true;
    if (w.split.some((s) => s.member === member)) return true;
    if (w.status === "pending_approval" && w.approver !== "none" && w.accountManager === member) return true;
    return false;
}

/** Is this task waiting for `member` to approve it. */
export function awaitsApprovalFrom(w: Work, member: string): boolean {
    return w.status === "pending_approval" && w.approver !== "none" && w.accountManager === member;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export function isOpen(w: Work): boolean {
    return w.status !== "completed";
}

export function isOverdue(w: Work, today: string): boolean {
    return isOpen(w) && Boolean(w.dueDate) && w.dueDate < today;
}

/** The day the owner plans to do it: their own pick, else the deadline. */
export function plannedDay(w: Pick<Work, "dueDate" | "plannedDate">): string {
    return w.plannedDate || w.dueDate;
}

export function isAdjusted(w: Work): boolean {
    return Boolean(w.defaultDueDate) && w.dueDate !== w.defaultDueDate;
}

export type Progress = { done: number; total: number; pct: number } & Record<TaskStatus, number>;

export function progress(list: Work[]): Progress {
    const out: Progress = { done: 0, total: list.length, pct: 0, not_started: 0, in_progress: 0, pending_approval: 0, completed: 0 };
    for (const w of list) out[w.status] += 1;
    out.done = out.completed;
    out.pct = out.total ? Math.round((out.done / out.total) * 100) : 0;
    return out;
}

/** Unique months on the list, oldest first. */
export function monthsOf(list: Work[]): string[] {
    return [...new Set(list.map((w) => w.month).filter(Boolean))].sort();
}

export function groupByMonth(list: Work[]): Map<string, Work[]> {
    const out = new Map<string, Work[]>();
    for (const w of list) out.set(w.month, [...(out.get(w.month) ?? []), w]);
    return new Map([...out.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

/** Label used for tasks that sit in no phase. */
export const NO_PHASE = "No phase";

/** Distinct phase names in the list, in `order` first (project phases), then any others, then "No phase" last. */
export function phasesOf(list: Work[], order: string[] = []): string[] {
    const seen = new Set(list.map((w) => w.phaseName || NO_PHASE));
    const out = order.filter((name) => seen.has(name));
    for (const name of [...seen].sort()) if (name !== NO_PHASE && !out.includes(name)) out.push(name);
    if (seen.has(NO_PHASE)) out.push(NO_PHASE);
    return out;
}

/** Group by phase name, ordered like `phasesOf`. Tasks without a phase land under "No phase". */
export function groupByPhase(list: Work[], order: string[] = []): Map<string, Work[]> {
    const out = new Map<string, Work[]>();
    for (const name of phasesOf(list, order)) out.set(name, []);
    for (const w of list) out.get(w.phaseName || NO_PHASE)!.push(w);
    return out;
}

export function byStatus(list: Work[]): Record<TaskStatus, Work[]> {
    const out: Record<TaskStatus, Work[]> = { not_started: [], in_progress: [], pending_approval: [], completed: [] };
    for (const w of list) out[w.status].push(w);
    return out;
}

/** Next open task by due date. */
export function nextDue(list: Work[]): Work | undefined {
    return list.filter((w) => isOpen(w) && w.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
}

/**
 * Apply a new due date to one task and, optionally, move every later open
 * task in the same project and month by the same number of days. Returns
 * the patches to write, keyed by work id.
 */
export function applyDueDate(
    all: Work[],
    workId: string,
    newDue: string,
    shiftLater: boolean,
    actor: string,
    nowIso: string,
): Map<string, { dueDate: string; adjustedBy: string; adjustedAt: string }> {
    const out = new Map<string, { dueDate: string; adjustedBy: string; adjustedAt: string }>();
    const target = all.find((w) => w.id === workId);
    if (!target || !newDue) return out;
    const delta = target.dueDate ? daysBetween(target.dueDate, newDue) : 0;
    out.set(workId, { dueDate: newDue, adjustedBy: actor, adjustedAt: nowIso });
    if (!shiftLater || delta === 0) return out;
    for (const w of all) {
        if (w.id === workId || w.contractId !== target.contractId || w.month !== target.month) continue;
        if (!isOpen(w) || !w.dueDate || w.dueDate <= target.dueDate) continue;
        out.set(w.id, { dueDate: shiftYmd(w.dueDate, delta), adjustedBy: actor, adjustedAt: nowIso });
    }
    return out;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export type BoardCard = {
    id: string;
    title: string;
    type: LineType;
    channel: string;
    clientName: string;
    month: string;
    phaseName: string;
    accountManager: string;
    members: string[];
    split: string;
    status: TaskStatus;
    approver: Work["approver"];
    milestone: boolean;
    dueDate: string;
    overdue: boolean;
    adjusted: boolean;
    pendingFrom: string;
    href: string;
};

export function toCard(w: Work, today: string): BoardCard {
    return {
        id: w.id,
        title: w.title,
        type: w.type,
        channel: w.channel,
        clientName: w.clientName,
        month: w.month,
        phaseName: w.phaseName,
        accountManager: w.accountManager,
        members: members(w),
        split: splitLabel(w, true),
        status: w.status,
        approver: w.approver,
        milestone: w.milestone,
        dueDate: w.dueDate,
        overdue: isOverdue(w, today),
        adjusted: isAdjusted(w),
        pendingFrom: pendingFrom(w),
        href: `/works/${w.id}`,
    };
}

export function sortCards(cards: BoardCard[]): BoardCard[] {
    return cards.sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return a.clientName.localeCompare(b.clientName);
    });
}
