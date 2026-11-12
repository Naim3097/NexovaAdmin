/**
 * Calendar helpers shared by the overall calendar and the per-project
 * calendar view: month maths, the 6-week grid, and turning works / invoices
 * into dated items. Pure functions, no I/O.
 */
import { fmtMyrShort } from "@/lib/format";
// Straight from the dev store, not the data adapters: the adapters import the
// Supabase server client (next/headers), which the client-side grid may not pull in.
import type { Invoice } from "@/lib/dev-store/invoices";
import { computeTotals } from "@/lib/invoices/totals";
import type { TaskStatus, Work } from "@/lib/data/works";
import { LINE_TYPE_SHORT } from "@/lib/planners/vocab";
import { shareHours, taskHours } from "@/lib/capacity/helpers";
import { awaitsApprovalFrom, plannedDay, splitLabel } from "@/lib/works/helpers";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const DOT: Record<TaskStatus, string> = {
    not_started: "bg-muted-foreground/40",
    in_progress: "bg-blue-500",
    pending_approval: "bg-amber-500",
    completed: "bg-emerald-500",
};

export type CalendarItem = {
    key: string;
    /** The day the item sits on: a task's planned day, an invoice's own date. */
    date: string;
    kind: "task" | "waiting" | "invoice" | "payment" | "paid";
    label: string;
    sub: string;
    href: string;
    dot: string;
    /** Tasks: open and past the deadline. Payments: past due. */
    overdue: boolean;
    /** Task items only: the task behind the chip. */
    taskId?: string;
    /** Task items only: the deadline the account manager set. */
    dueDate?: string;
    /** Task items only: true when the shown day differs from the deadline. */
    planned?: boolean;
    /** Task items only: the filtered member's hours on it, else everyone's. */
    hours?: number;
};

/** "14 Nov" for a YYYY-MM-DD. */
export function shortDay(ymd: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
    const [, m, d] = ymd.split("-").map(Number);
    return `${d} ${MONTH_SHORT[m - 1]}`;
}

/** The note a task carries in `sub` when it sits on a day other than its deadline. */
export function dueNote(dueDate: string): string {
    return ` · due ${shortDay(dueDate)}`;
}

export function parseMonth(input: string | undefined): { year: number; month: number } {
    const now = new Date();
    if (input && /^\d{4}-\d{2}$/.test(input)) {
        const [y, m] = input.split("-").map((s) => Number.parseInt(s, 10));
        if (m >= 1 && m <= 12) return { year: y, month: m - 1 };
    }
    return { year: now.getFullYear(), month: now.getMonth() };
}

export function shiftMonth(year: number, month: number, delta: number): string {
    const d = new Date(Date.UTC(year, month + delta, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function ymOf(year: number, month: number): string {
    return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** Six weeks starting on the Monday on or before the 1st. */
export function buildGrid(year: number, month: number): Date[] {
    const first = new Date(Date.UTC(year, month, 1));
    const offset = (first.getUTCDay() + 6) % 7;
    const start = new Date(Date.UTC(year, month, 1 - offset));
    const days: Date[] = [];
    for (let i = 0; i < 42; i += 1) {
        days.push(new Date(start.getTime() + i * 86_400_000));
    }
    return days;
}

export function isoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
}

/**
 * Tasks as calendar items on their planned day (the deadline unless the owner
 * planned it earlier). With `member`, only that person's tasks plus the ones
 * waiting for their approval, and `hours` is that person's share.
 */
export function taskItems(works: Work[], today: string, member = ""): CalendarItem[] {
    const items: CalendarItem[] = [];
    for (const w of works) {
        const day = plannedDay(w);
        if (!day) continue;
        const mine = w.split.some((s) => s.member === member);
        const approval = member ? awaitsApprovalFrom(w, member) : false;
        if (member && !mine && !approval) continue;
        const planned = Boolean(w.dueDate) && day !== w.dueDate;
        items.push({
            key: `t-${w.id}`,
            date: day,
            kind: approval && !mine ? "waiting" : "task",
            label: `${LINE_TYPE_SHORT[w.type]}: ${w.title}`,
            sub: `${w.clientName}${w.phaseName ? ` · ${w.phaseName}` : ""} · ${approval && !mine ? "your approval" : splitLabel(w, true)}${planned ? dueNote(w.dueDate) : ""}`,
            href: `/works/${w.id}`,
            dot: DOT[w.status],
            // Overdue is about the deadline, never the planned day.
            overdue: w.status !== "completed" && Boolean(w.dueDate) && w.dueDate < today,
            taskId: w.id,
            dueDate: w.dueDate,
            planned,
            hours: member ? shareHours(w, member) : taskHours(w),
        });
    }
    return items;
}

/**
 * The same task item on another day (the calendar's optimistic move): the
 * date, the `planned` flag and the "due …" note follow; `overdue` does not.
 */
export function placeItem(it: CalendarItem, date: string): CalendarItem {
    if (!it.taskId) return { ...it, date };
    const note = it.dueDate ? dueNote(it.dueDate) : "";
    const base = note && it.sub.endsWith(note) ? it.sub.slice(0, -note.length) : it.sub;
    const planned = Boolean(it.dueDate) && date !== it.dueDate;
    return { ...it, date, planned, sub: planned ? `${base}${note}` : base };
}

/** Invoice issued / payment due / paid dates as calendar items. */
export function invoiceItems(invoices: Invoice[], today: string): CalendarItem[] {
    const items: CalendarItem[] = [];
    for (const i of invoices) {
        if (i.status === "void") continue;
        const total = computeTotals(i).total;
        items.push({
            key: `inv-${i.id}`,
            date: i.issueDate,
            kind: "invoice",
            label: `Invoice ${i.number} · ${fmtMyrShort(total)}`,
            sub: `${i.clientName} · ${i.status}`,
            href: `/invoices/${i.id}`,
            dot: "bg-slate-400",
            overdue: false,
        });
        if (i.status === "paid" && i.paidAt) {
            items.push({
                key: `paid-${i.id}`,
                date: i.paidAt.slice(0, 10),
                kind: "paid",
                label: `Paid ${i.number}`,
                sub: i.clientName,
                href: `/invoices/${i.id}`,
                dot: "bg-emerald-500",
                overdue: false,
            });
        } else {
            items.push({
                key: `due-${i.id}`,
                date: i.dueDate,
                kind: "payment",
                label: `Payment due ${i.number}`,
                sub: `${i.clientName} · ${i.status}`,
                href: `/invoices/${i.id}`,
                dot: i.dueDate < today ? "bg-red-500" : "bg-amber-500",
                overdue: i.dueDate < today,
            });
        }
    }
    return items;
}
