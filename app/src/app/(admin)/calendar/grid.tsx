"use client";
/**
 * The month grid + the same month as a list (phone-friendly). Client component,
 * shared by the overall calendar and the per-project calendar view.
 *
 * Tasks sit on their planned day. A chip whose task the acting person may plan
 * can be dragged to another day up to its deadline (days after it grey out and
 * refuse the drop); the chip moves at once, the server saves, and a toast
 * offers Undo for a few seconds. A click (or Enter) on a chip opens the quick
 * edit; Space picks it up for the keyboard, arrows move it, Space drops it.
 *
 * Friday to Sunday and Kuala Lumpur public holidays sit on a grey cell (a
 * holiday also shows its name), but stay ordinary drop targets: work can still
 * be planned there, it just counts as off-day work.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    closestCenter,
    pointerWithin,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
    type Active,
    type Announcements,
    type CollisionDetection,
    type DragEndEvent,
    type DragStartEvent,
} from "@dnd-kit/core";
import { WORK_DAYS, WORK_DAY_LABEL, fmtHours } from "@/lib/capacity/helpers";
import { OFF_DAY_LEGEND, dayKind } from "@/lib/calendar/days";
import type { Work } from "@/lib/data/works";
import { WEEKDAYS, buildGrid, dueNote, isoDate, placeItem, shortDay, type CalendarItem } from "@/lib/works/calendar";
import { monthLabel } from "@/lib/works/helpers";
import { setPlannedDayAction } from "@/lib/works/quick-actions";
import { canPlan, type Actor } from "@/lib/works/transitions";
import { cn } from "@/lib/utils";
import { QuickEdit, toastUndo } from "@/app/(admin)/works/quick-edit";

/** WEEKDAYS starts on Monday (getDay() 1); true for the Fri–Sun columns. */
const OFF_COLUMN = WEEKDAYS.map((_, i) => !WORK_DAYS.includes((i + 1) % 7));
const OFF_TITLE = `Off day — the working week is ${WORK_DAY_LABEL}. You can still plan work here; it counts as off-day work.`;

/** The hover text on a grey day: the holiday by name, else the plain off-day note. */
function offTitle(holiday: string): string {
    return holiday ? `${holiday} — Kuala Lumpur public holiday. You can still plan work here; it counts as off-day work.` : OFF_TITLE;
}

/** What a dragged chip carries. */
type DragData = { item: CalendarItem };

/** A day a task was just dropped on; `pending` until the server has saved it. */
type Move = { date: string; pending: boolean };

function dragItem(active: Active | null): CalendarItem | undefined {
    return (active?.data.current as DragData | undefined)?.item;
}

/** The pointer decides where a drop lands; the keyboard (no pointer) takes the nearest day. */
const collision: CollisionDetection = (args) => {
    const within = pointerWithin(args);
    return within.length > 0 ? within : closestCenter(args);
};

const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${dragItem(active)?.label ?? "task"}.`,
    onDragOver: ({ active, over }) => (over ? `${dragItem(active)?.label ?? "Task"} over ${String(over.id)}.` : `${dragItem(active)?.label ?? "Task"} is not over a day.`),
    onDragEnd: ({ active, over }) => (over ? `${dragItem(active)?.label ?? "Task"} dropped on ${String(over.id)}.` : `${dragItem(active)?.label ?? "Task"} put back.`),
    onDragCancel: ({ active }) => `Moving ${dragItem(active)?.label ?? "task"} cancelled.`,
};

const screenReaderInstructions = {
    draggable: "Press Space to pick up the task. Use the arrow keys to move it to another day, Space to drop it there, Escape to cancel. Enter opens the quick edit.",
};

function labelClass(it: CalendarItem): string {
    return cn("truncate", it.overdue && "font-medium text-red-600 dark:text-red-400", it.kind === "waiting" && "text-amber-700 dark:text-amber-400");
}

/** `sub` without the "· due …" note (shown separately in the list). */
function subWithoutDue(it: CalendarItem): string {
    if (!it.planned || !it.dueDate) return it.sub;
    const note = dueNote(it.dueDate);
    return it.sub.endsWith(note) ? it.sub.slice(0, -note.length) : it.sub;
}

/** " · Christmas Day" / " · off day" after a planned date that is not a working day, else "". */
function offNote(date: string): string {
    const k = dayKind(date);
    return k.holiday ? ` · ${k.holiday}` : k.off ? " · off day" : "";
}

/** The task with the day it is shown on, so the quick edit opens on what the calendar shows. */
function withPlanned(task: Work, date: string | undefined): Work {
    if (!date || date === (task.plannedDate || task.dueDate)) return task;
    return { ...task, plannedDate: date === task.dueDate ? "" : date };
}

export type CalendarGridProps = {
    year: number;
    month: number;
    items: CalendarItem[];
    today: string;
    /** Shorter cells, for embedding inside another page. */
    compact?: boolean;
    /** Who is looking: decides which chips may be dragged and what the quick edit offers. */
    actor: Actor;
    /** `?as=` under the dev bypass, so the server knows who is acting. */
    asParam?: string;
    /** The tasks behind the task items, by id. Only these open the quick edit or move. */
    tasks: Record<string, Work>;
    /** Hours available per working day in this scope (one person's). Undefined: no budget shown. */
    perDay?: number;
};

export function CalendarGrid({ year, month, items, today, compact = false, actor, asParam, tasks, perDay }: CalendarGridProps) {
    const router = useRouter();
    const ym = `${year}-${String(month + 1).padStart(2, "0")}`;
    const asQ = asParam ? `?as=${encodeURIComponent(asParam)}` : "";

    // Optimistic moves by task id, on top of the items the server sent.
    const [moves, setMoves] = useState<Record<string, Move>>({});
    const [seen, setSeen] = useState(items);
    if (seen !== items) {
        // Fresh items from the server: keep only the moves still waiting on their save.
        setSeen(items);
        setMoves((m) => Object.fromEntries(Object.entries(m).filter(([, mv]) => mv.pending)));
    }
    const placed = useMemo(() => items.map((it) => (it.taskId && moves[it.taskId] ? placeItem(it, moves[it.taskId].date) : it)), [items, moves]);

    const [active, setActive] = useState<CalendarItem | null>(null);
    const sensors = useSensors(
        // 6px before a drag starts, so a plain click still opens the quick edit.
        useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
        // Space picks up / drops; Enter is left to the chip's button (the quick edit).
        useSensor(KeyboardSensor, { keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] } }),
    );

    const moveLocal = useCallback((id: string, date: string, pending: boolean) => {
        setMoves((m) => ({ ...m, [id]: { date, pending } }));
    }, []);
    const forgetLocal = useCallback((id: string) => {
        setMoves((m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== id)));
    }, []);

    /** Plan a task for `date`: chip first, server next, Undo in the toast. */
    const plan = useCallback(
        async (taskId: string, date: string, title: string) => {
            moveLocal(taskId, date, true);
            const r = await setPlannedDayAction({ id: taskId, date, as: asParam });
            if (!r.ok) {
                forgetLocal(taskId);
                toast.error(r.reason);
                return;
            }
            moveLocal(taskId, date, false);
            toastUndo(`Planned for ${date}${offNote(date)}`, title, async () => {
                moveLocal(taskId, r.previous, true);
                const u = await setPlannedDayAction({ id: taskId, date: r.previous, as: asParam });
                if (u.ok) moveLocal(taskId, r.previous, false);
                else {
                    forgetLocal(taskId);
                    toast.error(u.reason);
                }
                router.refresh();
            });
            router.refresh();
        },
        [asParam, forgetLocal, moveLocal, router],
    );

    /** The quick edit saved a planned day itself; it refreshes on its own. */
    const onPlanned = useCallback((id: string, date: string) => moveLocal(id, date, false), [moveLocal]);

    const onDragStart = ({ active: a }: DragStartEvent) => setActive(dragItem(a) ?? null);
    const onDragCancel = () => setActive(null);
    const onDragEnd = ({ active: a, over }: DragEndEvent) => {
        const it = dragItem(a);
        setActive(null);
        if (!it?.taskId || !over) return;
        const date = String(over.id);
        if (date === it.date) return;
        if (it.dueDate && date > it.dueDate) {
            toast.error(`After the deadline (${it.dueDate}). Ask ${tasks[it.taskId]?.accountManager || "the account manager"} to move it.`);
            return;
        }
        void plan(it.taskId, date, tasks[it.taskId]?.title ?? it.label);
    };

    const days = buildGrid(year, month);
    const byDate = new Map<string, CalendarItem[]>();
    const hoursByDate = new Map<string, number>();
    for (const it of placed) {
        if (!it.date) continue;
        byDate.set(it.date, [...(byDate.get(it.date) ?? []), it]);
        if (it.kind === "task" && it.hours) hoursByDate.set(it.date, (hoursByDate.get(it.date) ?? 0) + it.hours);
    }
    const monthItems = placed.filter((it) => it.date.startsWith(ym)).sort((a, b) => a.date.localeCompare(b.date));
    const perCell = compact ? 3 : 4;
    /** Days after the dragged task's deadline. */
    const refuses = (iso: string) => Boolean(active?.dueDate && iso > active.dueDate);

    /** A task's label as the quick-edit trigger; in a cell it may also be the drag handle. */
    const chip = (it: CalendarItem, where: "cell" | "list", dnd?: DndHandle) => {
        const task = it.taskId ? tasks[it.taskId] : undefined;
        if (!task) return null;
        return (
            <QuickEdit
                w={withPlanned(task, moves[task.id]?.date)}
                actor={actor}
                today={today}
                asParam={asParam}
                onPlanned={onPlanned}
                trigger={
                    <button
                        type="button"
                        ref={dnd?.setNodeRef}
                        {...dnd?.listeners}
                        {...dnd?.attributes}
                        className={cn(
                            where === "cell" ? "min-w-0 flex-1 text-left hover:underline" : "text-left font-medium hover:underline",
                            where === "cell" && labelClass(it),
                            where === "list" && it.kind === "waiting" && "text-amber-700 dark:text-amber-400",
                            // The pointer needs 6px of travel before a drag starts, so a click still opens the quick edit.
                            dnd && "cursor-grab touch-manipulation",
                        )}
                    >
                        {it.label}
                    </button>
                }
            />
        );
    };

    return (
        <DndContext
            id="calendar"
            sensors={sensors}
            collisionDetection={collision}
            onDragStart={onDragStart}
            onDragCancel={onDragCancel}
            onDragEnd={onDragEnd}
            accessibility={{ announcements, screenReaderInstructions }}
        >
            <div className="space-y-4">
                <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
                    <div className="min-w-[900px] rounded-lg border bg-card md:min-w-0">
                        <div className="grid grid-cols-7 border-b text-xs font-medium text-muted-foreground">
                            {WEEKDAYS.map((d, i) => (
                                <div key={d} className={cn("px-2 py-1.5 leading-tight", OFF_COLUMN[i] && "bg-muted/50")} title={OFF_COLUMN[i] ? OFF_TITLE : undefined}>
                                    {d}
                                    {OFF_COLUMN[i] ? <span className="block text-[10px] font-normal text-muted-foreground/70">off</span> : null}
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-7">
                            {days.map((d) => {
                                const iso = isoDate(d);
                                const dayItems = byDate.get(iso) ?? [];
                                return (
                                    <DayCell
                                        key={iso}
                                        iso={iso}
                                        // The grid's dates are built in UTC; UTC getters keep server and browser on the same day.
                                        day={d.getUTCDate()}
                                        inMonth={d.getUTCMonth() === month}
                                        isToday={iso === today}
                                        refuse={refuses(iso)}
                                        compact={compact}
                                        count={dayItems.length}
                                        perCell={perCell}
                                        hours={hoursByDate.get(iso) ?? 0}
                                        perDay={perDay}
                                    >
                                        {dayItems.slice(0, perCell).map((it) => {
                                            const task = it.taskId ? tasks[it.taskId] : undefined;
                                            if (!task) {
                                                return (
                                                    <li key={it.key}>
                                                        <Link href={`${it.href}${asQ}`} className="flex items-start gap-1 text-[11px] leading-tight hover:underline" title={`${it.label} — ${it.sub}`}>
                                                            <span className={cn("mt-1 inline-block size-1.5 shrink-0 rounded-full", it.dot)} />
                                                            <span className={labelClass(it)}>{it.label}</span>
                                                        </Link>
                                                    </li>
                                                );
                                            }
                                            return (
                                                <TaskChip key={it.key} it={it} draggable={it.kind === "task" && canPlan(task, actor)} href={`${it.href}${asQ}`}>
                                                    {(dnd) => chip(it, "cell", dnd)}
                                                </TaskChip>
                                            );
                                        })}
                                    </DayCell>
                                );
                            })}
                        </div>
                    </div>
                </div>
                <p className="-mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-block size-3 shrink-0 rounded-sm border bg-muted/50" aria-hidden="true" />
                    {OFF_DAY_LEGEND}
                </p>

                <section className="rounded-lg border bg-card">
                    <div className="border-b p-3 text-sm font-medium">
                        {monthLabel(ym)} as a list · {monthItems.length} item{monthItems.length === 1 ? "" : "s"}
                    </div>
                    {monthItems.length === 0 ? (
                        <p className="p-4 text-sm text-muted-foreground">Nothing scheduled in this scope.</p>
                    ) : (
                        <ul className="divide-y text-sm">
                            {monthItems.map((it) => {
                                const task = it.taskId ? tasks[it.taskId] : undefined;
                                return (
                                    <li key={it.key} className="flex items-start gap-3 p-3">
                                        <span
                                            className={cn(
                                                "w-20 shrink-0 text-xs tabular-nums",
                                                it.overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground",
                                            )}
                                        >
                                            {it.date.slice(5)}
                                            {it.date === today ? " · today" : ""}
                                            <OffDayTag date={it.date} />
                                            {it.planned && it.dueDate ? (
                                                <span className="block text-[10px]" title={`Planned ahead of the deadline (${it.dueDate}).`}>
                                                    due {shortDay(it.dueDate)}
                                                </span>
                                            ) : null}
                                        </span>
                                        <span className={cn("mt-1.5 inline-block size-2 shrink-0 rounded-full", it.dot)} />
                                        <div className="min-w-0 flex-1">
                                            {task ? (
                                                <span className="flex items-baseline gap-1.5">
                                                    {chip(it, "list")}
                                                    <Link href={`${it.href}${asQ}`} className="shrink-0 text-xs text-muted-foreground hover:text-foreground" title="Open the task page" aria-label={`Open ${it.label}`}>
                                                        ↗
                                                    </Link>
                                                </span>
                                            ) : (
                                                <Link href={`${it.href}${asQ}`} className={cn("font-medium hover:underline", it.kind === "waiting" && "text-amber-700 dark:text-amber-400")}>
                                                    {it.label}
                                                </Link>
                                            )}
                                            <p className="text-xs text-muted-foreground">{subWithoutDue(it)}</p>
                                        </div>
                                        {it.hours ? (
                                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground" title="Planned hours">
                                                {fmtHours(it.hours)}
                                            </span>
                                        ) : null}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            </div>

            <DragOverlay>
                {active ? (
                    <div className="flex cursor-grabbing items-start gap-1 rounded-md border bg-card px-2 py-1 text-[11px] leading-tight shadow-md">
                        <span className={cn("mt-1 inline-block size-1.5 shrink-0 rounded-full", active.dot)} />
                        <span className={labelClass(active)}>{active.label}</span>
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}

/** One day: a drop target, the date, the day's load, and the chips. */
function DayCell({
    iso,
    day,
    inMonth,
    isToday,
    refuse,
    compact,
    count,
    perCell,
    hours,
    perDay,
    children,
}: {
    iso: string;
    day: number;
    inMonth: boolean;
    isToday: boolean;
    /** True while a task is dragged whose deadline this day is after. */
    refuse: boolean;
    compact: boolean;
    count: number;
    perCell: number;
    hours: number;
    perDay?: number;
    children: React.ReactNode;
}) {
    // Fri–Sun and public holidays: grey, but still a drop target like any other day.
    const { off, holiday } = dayKind(iso);
    const { setNodeRef, isOver } = useDroppable({ id: iso });
    const budget = perDay !== undefined && !off;
    const load = hours > 0 ? (
        <span
            className={cn(
                "tabular-nums",
                off
                    ? "text-muted-foreground/70"
                    : budget && hours > perDay
                      ? "font-medium text-red-600 dark:text-red-400"
                      : budget && hours > 0.85 * perDay
                        ? "font-medium text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground",
            )}
            title={off ? "off-day hours" : budget ? `${fmtHours(hours)} planned of ${fmtHours(perDay)} available this day` : `${fmtHours(hours)} planned`}
        >
            {budget ? `${fmtHours(hours)} / ${fmtHours(perDay)}` : fmtHours(hours)}
        </span>
    ) : null;

    return (
        <div
            ref={setNodeRef}
            className={cn(
                "border-b border-r p-2 transition-opacity last:border-r-0",
                compact ? "min-h-20" : "min-h-28",
                // Off days (Fri–Sun, public holidays) are grey; days outside the month sit a shade further back.
                inMonth ? off && "bg-muted/50" : off ? "bg-muted/70" : "bg-muted/25",
                refuse && "cursor-not-allowed opacity-40",
                isOver && !refuse && "ring-2 ring-inset ring-primary/40",
            )}
            title={refuse ? "After this task's deadline" : off ? offTitle(holiday) : undefined}
        >
            <div className="flex items-center justify-between gap-1">
                <span className={cn("text-xs", isToday ? "rounded-full bg-primary px-2 py-0.5 font-medium text-primary-foreground" : "text-muted-foreground")}>{day}</span>
                {holiday ? (
                    <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground" title={holiday}>
                        {holiday}
                    </span>
                ) : null}
                <span className="flex shrink-0 items-center gap-1.5 text-[10px]">
                    {load}
                    {count > perCell ? <span className="text-muted-foreground">{count}</span> : null}
                </span>
            </div>
            <ul className="mt-1 space-y-1">
                {children}
                {count > perCell ? <li className="text-[10px] text-muted-foreground">+{count - perCell} more</li> : null}
            </ul>
        </div>
    );
}

/** Under a date in the list: the holiday's name, or "off day" on Fri–Sun; nothing on a working day. */
function OffDayTag({ date }: { date: string }) {
    const { off, holiday } = dayKind(date);
    if (!off) return null;
    return (
        <span className="block truncate text-[10px] text-muted-foreground" title={offTitle(holiday)}>
            {holiday || "off day"}
        </span>
    );
}

/** What a draggable label button needs from dnd-kit. */
type DndHandle = Pick<ReturnType<typeof useDraggable>, "setNodeRef" | "listeners" | "attributes">;

/**
 * A task chip in a cell: the label (rendered by `children`, the quick-edit
 * trigger) is the drag handle when `draggable`, plus a small link to the task
 * page. One focusable element per chip: Space picks it up, Enter opens the edit.
 */
function TaskChip({ it, draggable, href, children }: { it: CalendarItem; draggable: boolean; href: string; children: (dnd: DndHandle | undefined) => React.ReactNode }) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: it.key, data: { item: it } satisfies DragData, disabled: !draggable });
    return (
        <li className={cn("flex items-start gap-1 text-[11px] leading-tight", isDragging && "opacity-30")} title={`${it.label} — ${it.sub}`}>
            <span className={cn("mt-1 inline-block size-1.5 shrink-0 rounded-full", it.dot)} />
            {children(draggable ? { setNodeRef, listeners, attributes } : undefined)}
            <Link href={href} className="shrink-0 text-muted-foreground hover:text-foreground" title="Open the task page" aria-label={`Open ${it.label}`}>
                ↗
            </Link>
        </li>
    );
}
