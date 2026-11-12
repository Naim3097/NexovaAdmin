"use client";
/**
 * The board view the task pages share: one column per status, cards by due
 * date. Drag a card to another column to move it; the columns this person
 * may not move it to grey out while it is lifted. A click on the title opens
 * the quick edit, "↗" opens the task page. Moves show at once and the server
 * catches up on refresh; the toast's Undo puts the card back. Nothing is
 * added here: new tasks start on the project page ("New task").
 *
 * Keyboard: focus a card, Space or Enter lifts it, the arrow keys jump it
 * from column to column, Space or Enter drops it, Escape cancels.
 */
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    pointerWithin,
    rectIntersection,
    useDroppable,
    useSensor,
    useSensors,
    type ClientRect,
    type CollisionDetection,
    type DragEndEvent,
    type DragStartEvent,
    type KeyboardCoordinateGetter,
    type UniqueIdentifier,
} from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { TaskStatus, Work } from "@/lib/data/works";
import { TASK_STATUS_LABEL, TASK_STATUS_ORDER, byStatus } from "@/lib/works/helpers";
import { moveTaskAction, undoMoveAction } from "@/lib/works/quick-actions";
import { allowedMoves, type Actor } from "@/lib/works/transitions";
import { cn } from "@/lib/utils";
import { BoardCard, OverlayCard } from "./board-card";
import { toastUndo } from "./quick-edit";
import { byDue } from "./task-list";
import { STATUS_DOT } from "./ui";

export type TaskBoardProps = {
    works: Work[];
    today: string;
    /** `?as=…` for links, "" otherwise. */
    asQ: string;
    actor: Actor;
    /** `?as=` under the dev bypass, so the server actions know who is acting. */
    asParam?: string;
    /** Off on a project page, where every card is the same client. */
    showClient?: boolean;
};

/**
 * One optimistic move: show `to` while the server still reports `from`. Once
 * the server shows anything else (the move landed, or someone changed the
 * task meanwhile) the entry is inert, so it never masks a later change.
 */
type Override = { from: TaskStatus; to: TaskStatus };

/** The lifted card and where this person may drop it. */
type Lifted = { w: Work; allowed: TaskStatus[] };

function isStatus(v: UniqueIdentifier | undefined): v is TaskStatus {
    return typeof v === "string" && (TASK_STATUS_ORDER as string[]).includes(v);
}

/** Where the pointer is wins; the keyboard (no pointer) falls back to rectangle overlap. */
const collision: CollisionDetection = (args) => {
    const within = pointerWithin(args);
    return within.length > 0 ? within : rectIntersection(args);
};

/**
 * Arrow keys jump the lifted card from column to column: Right / Down to the
 * next column in reading order, Left / Up to the previous one, skipping the
 * columns it may not land on. The card lands just inside the column's top
 * left, so a short or empty column still counts as "over".
 */
const columnCoordinates: KeyboardCoordinateGetter = (event, { context: { collisionRect, droppableRects, droppableContainers } }) => {
    const dir = event.code === "ArrowRight" || event.code === "ArrowDown" ? 1 : event.code === "ArrowLeft" || event.code === "ArrowUp" ? -1 : 0;
    if (dir === 0 || !collisionRect) return undefined;
    event.preventDefault();
    const columns = droppableContainers
        .toArray()
        .flatMap((c) => {
            const rect = droppableRects.get(c.id);
            return rect ? [{ disabled: c.disabled, rect }] : [];
        })
        .sort((a, b) => (Math.abs(a.rect.top - b.rect.top) > 1 ? a.rect.top - b.rect.top : a.rect.left - b.rect.left));
    if (columns.length === 0) return undefined;
    // The column the card sits in now (its centre inside the rect), else the nearest one.
    const cx = collisionRect.left + collisionRect.width / 2;
    const cy = collisionRect.top + collisionRect.height / 2;
    const distance = (r: ClientRect) => Math.hypot(Math.max(r.left - cx, 0, cx - r.right), Math.max(r.top - cy, 0, cy - r.bottom));
    const at = columns.reduce((best, c, i) => (distance(c.rect) < distance(columns[best].rect) ? i : best), 0);
    for (let i = at + dir; i >= 0 && i < columns.length; i += dir) {
        if (columns[i].disabled) continue;
        return { x: columns[i].rect.left + 8, y: columns[i].rect.top + 8 };
    }
    return undefined;
};

export function TaskBoard({ works, today, asQ, actor, asParam, showClient = true }: TaskBoardProps) {
    const router = useRouter();
    const [overrides, setOverrides] = useState<Record<string, Override>>({});
    const [lifted, setLifted] = useState<Lifted | null>(null);

    const sensors = useSensors(
        // Mouse (and pen): 6px before a drag starts, so a plain click still opens the pop-up or follows the link.
        useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
        // Touch: hold 150ms, then drag; a flick before that scrolls the page as usual.
        useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: columnCoordinates }),
    );

    // The server's list with the optimistic moves laid over it.
    const items = useMemo(
        () =>
            works.map((w) => {
                const o = overrides[w.id];
                return o && o.from === w.status && o.to !== w.status ? { ...w, status: o.to } : w;
            }),
        [works, overrides],
    );
    const columns = byStatus(items);

    /** Show the card under `to` until the server confirms it. */
    const showAt = (id: string, to: TaskStatus) => {
        const from = works.find((w) => w.id === id)?.status;
        if (from) setOverrides((prev) => ({ ...prev, [id]: { from, to } }));
    };
    const dropOverride = (id: string) =>
        setOverrides((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
        });

    /** A drop: move at once, save, offer Undo; put the card back if the server says no. */
    const move = async (w: Work, to: TaskStatus) => {
        showAt(w.id, to);
        const r = await moveTaskAction({ id: w.id, to, as: asParam });
        if (!r.ok) {
            dropOverride(w.id);
            toast.error(r.reason);
            return;
        }
        toastUndo(`${r.label}: ${w.title}`, `now ${TASK_STATUS_LABEL[to]}`, async () => {
            const u = await undoMoveAction({ id: w.id, snapshot: r.snapshot, as: asParam });
            if (u.ok) showAt(w.id, r.from);
            else toast.error(u.reason);
            router.refresh();
        });
        router.refresh();
    };

    const onDragStart = ({ active }: DragStartEvent) => {
        const w = items.find((x) => x.id === active.id);
        setLifted(w ? { w, allowed: allowedMoves(w, actor) } : null);
    };
    const onDragEnd = ({ over }: DragEndEvent) => {
        const l = lifted;
        setLifted(null);
        if (!l || !isStatus(over?.id) || over.id === l.w.status || !l.allowed.includes(over.id)) return;
        void move(l.w, over.id);
    };

    const titleOf = (id: UniqueIdentifier) => items.find((w) => w.id === id)?.title ?? "task";
    const columnOf = (id: UniqueIdentifier | undefined) => (isStatus(id) ? TASK_STATUS_LABEL[id] : "no column");

    return (
        <DndContext id="task-board"
            sensors={sensors}
            collisionDetection={collision}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={() => setLifted(null)}
            accessibility={{
                screenReaderInstructions: {
                    draggable: "Press Space or Enter to lift the task, the arrow keys to move it to another column, Space or Enter to drop it, Escape to cancel.",
                },
                announcements: {
                    onDragStart: ({ active }) => `Lifted ${titleOf(active.id)}.`,
                    onDragOver: ({ active, over }) => `${titleOf(active.id)} over ${columnOf(over?.id)}.`,
                    onDragEnd: ({ active, over }) => (over ? `${titleOf(active.id)} dropped on ${columnOf(over.id)}.` : `${titleOf(active.id)} put back.`),
                    onDragCancel: ({ active }) => `Move of ${titleOf(active.id)} cancelled.`,
                },
            }}
        >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {TASK_STATUS_ORDER.map((s) => (
                    <Column key={s} status={s} count={columns[s].length} lifted={lifted}>
                        {columns[s].length === 0 ? (
                            lifted && lifted.allowed.includes(s) ? (
                                <div className="m-1 rounded-md border border-dashed border-primary/40 px-2 py-4 text-center text-xs text-muted-foreground">drop here</div>
                            ) : (
                                <p className="px-1 py-3 text-xs text-muted-foreground">—</p>
                            )
                        ) : (
                            <ul className="mt-1 space-y-2">
                                {byDue(columns[s]).map((w) => (
                                    <BoardCard key={w.id} w={w} today={today} asQ={asQ} actor={actor} asParam={asParam} showClient={showClient} onMoved={showAt} />
                                ))}
                            </ul>
                        )}
                    </Column>
                ))}
            </div>
            <DragOverlay>{lifted ? <OverlayCard w={lifted.w} today={today} showClient={showClient} /> : null}</DragOverlay>
        </DndContext>
    );
}

/** One status column: a drop target, greyed out while a card it may not take is lifted. */
function Column({
    status,
    count,
    lifted,
    children,
}: {
    status: TaskStatus;
    count: number;
    lifted: Lifted | null;
    children: React.ReactNode;
}) {
    const allowed = Boolean(lifted?.allowed.includes(status));
    const source = lifted?.w.status === status;
    const { setNodeRef, isOver } = useDroppable({ id: status, disabled: Boolean(lifted) && !allowed });
    const blocked = Boolean(lifted) && !allowed && !source;
    return (
        <div
            ref={setNodeRef}
            aria-disabled={blocked || undefined}
            className={cn(
                "rounded-lg border bg-muted/30 p-2 transition-[opacity,box-shadow,background-color]",
                blocked && "cursor-not-allowed opacity-40",
                isOver && allowed && "bg-muted/60 ring-2 ring-primary/50",
            )}
        >
            <div className="flex items-center gap-2 px-1 py-1 text-xs font-medium">
                <span className={cn("inline-block size-2 rounded-full", STATUS_DOT[status])} />
                {TASK_STATUS_LABEL[status]}
                <span className="text-muted-foreground tabular-nums">{count}</span>
            </div>
            {children}
        </div>
    );
}
