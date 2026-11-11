/**
 * Calendar helpers shared by the overall calendar and the per-contract
 * calendar view: month maths, the 6-week grid, and turning works / invoices
 * into dated items. Pure functions, no I/O.
 */
import { fmtMyrShort } from "@/lib/format";
import type { Invoice } from "@/lib/data/invoices";
import { computeTotals } from "@/lib/data/invoices";
import type { TaskStatus, Work } from "@/lib/data/works";
import { LINE_TYPE_SHORT } from "@/lib/data/planners";
import { awaitsApprovalFrom, splitLabel } from "@/lib/works/helpers";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DOT: Record<TaskStatus, string> = {
    not_started: "bg-muted-foreground/40",
    in_progress: "bg-blue-500",
    pending_approval: "bg-amber-500",
    completed: "bg-emerald-500",
};

export type CalendarItem = {
    key: string;
    date: string;
    kind: "task" | "waiting" | "invoice" | "payment" | "paid";
    label: string;
    sub: string;
    href: string;
    dot: string;
    overdue: boolean;
};

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
 * Tasks as calendar items on their due date. With `member`, only that
 * person's tasks plus the ones waiting for their approval.
 */
export function taskItems(works: Work[], today: string, member = ""): CalendarItem[] {
    const items: CalendarItem[] = [];
    for (const w of works) {
        if (!w.dueDate) continue;
        const mine = w.split.some((s) => s.member === member);
        const approval = member ? awaitsApprovalFrom(w, member) : false;
        if (member && !mine && !approval) continue;
        items.push({
            key: `t-${w.id}`,
            date: w.dueDate,
            kind: approval && !mine ? "waiting" : "task",
            label: `${LINE_TYPE_SHORT[w.type]}: ${w.title}`,
            sub: `${w.clientName}${w.phaseName ? ` · ${w.phaseName}` : ""} · ${approval && !mine ? "your approval" : splitLabel(w, true)}`,
            href: `/works/${w.id}`,
            dot: DOT[w.status],
            overdue: w.status !== "completed" && w.dueDate < today,
        });
    }
    return items;
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
