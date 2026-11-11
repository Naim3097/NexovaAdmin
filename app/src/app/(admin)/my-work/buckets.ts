/**
 * Which section of "My tasks" a task belongs in, for one member. Pure.
 *
 * Every task lands in at most one bucket. An approval I owe always goes to
 * "approval" (it is a different kind of action from doing the work); the rest
 * of my tasks sort by when they are due. Tasks I have no stake in return null.
 */
import type { Work } from "@/lib/data/works";
import { awaitsApprovalFrom, isOpen, nextMonth, shiftYmd } from "@/lib/works/helpers";

export const BUCKETS = ["overdue", "today", "week", "approval", "month", "next", "later", "done"] as const;
export type Bucket = (typeof BUCKETS)[number];

export const BUCKET_LABEL: Record<Bucket, string> = {
    overdue: "Overdue",
    today: "Today",
    week: "Next 7 days",
    approval: "My sign-off",
    month: "Later this month",
    next: "Next month",
    later: "Further out",
    done: "Done this month",
};

/** Does `member` hold a share of the task (same matching as `shareHours`). */
export function holdsShare(w: Pick<Work, "split">, member: string): boolean {
    const key = member.trim().toLowerCase();
    return Boolean(key) && w.split.some((s) => s.member.trim().toLowerCase() === key);
}

export function bucketOf(w: Work, member: string, today: string): Bucket | null {
    const thisMonth = today.slice(0, 7);
    if (awaitsApprovalFrom(w, member)) return "approval";
    if (!holdsShare(w, member)) return null;
    if (!isOpen(w)) return w.month === thisMonth ? "done" : null;
    if (w.dueDate) {
        if (w.dueDate < today) return "overdue";
        if (w.dueDate === today) return "today";
        if (w.dueDate <= shiftYmd(today, 7)) return "week";
    }
    // Beyond the week (or undated): by the month it sits in.
    const m = w.dueDate ? w.dueDate.slice(0, 7) : w.month;
    if (!m || m === thisMonth) return "month";
    if (m < thisMonth) return "overdue"; // undated task from a past month, still open
    if (m === nextMonth(thisMonth)) return "next";
    return "later";
}

/** Split a list into buckets, each sorted by due date (undated last), then title. */
export function bucketAll(list: Work[], member: string, today: string): Record<Bucket, Work[]> {
    const out = Object.fromEntries(BUCKETS.map((b) => [b, [] as Work[]])) as Record<Bucket, Work[]>;
    for (const w of list) {
        const b = bucketOf(w, member, today);
        if (b) out[b].push(w);
    }
    for (const b of BUCKETS) {
        out[b].sort((a, c) => (a.dueDate || "9999").localeCompare(c.dueDate || "9999") || a.title.localeCompare(c.title));
    }
    return out;
}
