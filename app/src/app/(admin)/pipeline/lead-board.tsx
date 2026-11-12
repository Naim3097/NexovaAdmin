"use client";
/**
 * The pipeline as a board: one column per stage, a card per deal. Drag a card
 * to another column to move the deal there — Won is an ordinary drop; a drop
 * on Lost shows the card there at once and asks why before saving (dismiss the
 * question and it is filed under "Other", so the move never silently fails);
 * the column it came from greys out while it is lifted. The move shows at
 * once, the server saves, and the toast's Undo puts it back. A click on the
 * name opens the lead page; the quote and project links work as usual.
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
    useDraggable,
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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
// Types only: the leads adapter itself is server code (file store, Supabase).
import type { LeadStatus } from "@/lib/data/leads";
import { fmtMyrWhole } from "@/lib/format";
import { lostReasonLabel, type LostReason } from "@/lib/leads/lost";
import { moveLeadAction } from "@/lib/leads/quick-actions";
import { cn } from "@/lib/utils";
import { toastUndo } from "@/app/(admin)/works/quick-edit";
import { LostReasonDialog, type LostPick } from "./lost-reason-dialog";

/** What a card shows: the deal, and the quote / project it links to. */
export type BoardLead = {
    id: string;
    name: string;
    company: string;
    estValueMyr: number;
    status: LeadStatus;
    /** The deal's company, or the contact's name when there is none — the client a project would be under. */
    clientName: string;
    quote: { id: string; number: string; status: string } | null;
    contract: { id: string; code: string } | null;
    /** Why it was lost, shown on the card in the Lost column and offered back when it is dropped there again. */
    lostReason: LostReason;
    lostNote: string;
};

export const STAGE_LABEL: Record<LeadStatus, string> = {
    new: "New",
    contacted: "Contacted",
    qualified: "Qualified",
    proposal: "Quoted",
    won: "Won",
    lost: "Lost",
};

/**
 * One optimistic move: show `to` while the server still reports `from`. Once
 * the server shows anything else (the move landed, or someone changed the
 * deal meanwhile) the entry is inert, so it never masks a later change.
 */
type Override = { from: LeadStatus; to: LeadStatus };

const CARD = "rounded-lg border bg-card p-3 text-sm shadow-xs";

/** Where the pointer is wins; the keyboard (no pointer) falls back to rectangle overlap. */
const collision: CollisionDetection = (args) => {
    const within = pointerWithin(args);
    return within.length > 0 ? within : rectIntersection(args);
};

/**
 * Arrow keys jump the lifted card from column to column: Right / Down to the
 * next column in reading order, Left / Up to the previous one, skipping the
 * source column (disabled while lifted). The card lands just inside the
 * column's top left, so a short or empty column still counts as "over".
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

export function LeadBoard({ leads, stages, asParam }: { leads: BoardLead[]; stages: readonly LeadStatus[]; asParam?: string }) {
    const router = useRouter();
    const [overrides, setOverrides] = useState<Record<string, Override>>({});
    const [lifted, setLifted] = useState<BoardLead | null>(null);
    /** The deal just dropped on Lost, waiting for its reason before the save. */
    const [losing, setLosing] = useState<BoardLead | null>(null);
    const isStage = (v: UniqueIdentifier | undefined): v is LeadStatus => typeof v === "string" && (stages as readonly string[]).includes(v);

    const sensors = useSensors(
        // Mouse (and pen): 6px before a drag starts, so a plain click still follows the link.
        useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
        // Touch: hold 150ms, then drag; a flick before that scrolls the page as usual.
        useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: columnCoordinates }),
    );

    // The server's list with the optimistic moves laid over it.
    const items = useMemo(
        () =>
            leads.map((l) => {
                const o = overrides[l.id];
                return o && o.from === l.status && o.to !== l.status ? { ...l, status: o.to } : l;
            }),
        [leads, overrides],
    );
    const columns = useMemo(() => {
        const out = Object.fromEntries(stages.map((s) => [s, [] as BoardLead[]])) as Record<LeadStatus, BoardLead[]>;
        for (const l of items) (out[l.status] ??= []).push(l);
        return out;
    }, [items, stages]);

    /** Show the card under `to` until the server confirms it. */
    const showAt = (id: string, to: LeadStatus) => {
        const from = leads.find((l) => l.id === id)?.status;
        if (from) setOverrides((prev) => ({ ...prev, [id]: { from, to } }));
    };
    const dropOverride = (id: string) =>
        setOverrides((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
        });

    /** A drop: move at once, save, offer Undo; put the card back if the server says no. A move to Lost carries the reason. */
    const move = async (l: BoardLead, to: LeadStatus, lost?: LostPick) => {
        showAt(l.id, to);
        const r = await moveLeadAction({ id: l.id, to, as: asParam, lostReason: lost?.reason, lostNote: lost?.note });
        if (!r.ok) {
            dropOverride(l.id);
            toast.error(r.reason);
            return;
        }
        toastUndo(`${STAGE_LABEL[to]}: ${l.name}`, lost ? `${lostReasonLabel(lost.reason)} · was ${STAGE_LABEL[r.from]}` : `was ${STAGE_LABEL[r.from]}`, async () => {
            showAt(l.id, r.from);
            const u = await moveLeadAction({ id: l.id, to: r.from, as: asParam });
            if (!u.ok) {
                dropOverride(l.id);
                toast.error(u.reason);
            }
            router.refresh();
        });
        router.refresh();
    };

    const onDragStart = ({ active }: DragStartEvent) => setLifted(items.find((l) => l.id === active.id) ?? null);
    const onDragEnd = ({ over }: DragEndEvent) => {
        const l = lifted;
        setLifted(null);
        if (!l || !isStage(over?.id) || over.id === l.status) return;
        if (over.id === "lost") {
            // Show it under Lost now; the save waits for the reason.
            showAt(l.id, "lost");
            setLosing(l);
            return;
        }
        void move(l, over.id);
    };
    /** The dialog's answer: the pick, or "Other" when it was dismissed, so the drop always lands. */
    const onLostClose = (pick: LostPick | null) => {
        const l = losing;
        setLosing(null);
        if (l) void move(l, "lost", pick ?? { reason: "other", note: "" });
    };

    const nameOf = (id: UniqueIdentifier) => items.find((l) => l.id === id)?.name ?? "deal";
    const columnOf = (id: UniqueIdentifier | undefined) => (isStage(id) ? STAGE_LABEL[id] : "no column");

    return (
        <DndContext
            id="lead-board"
            sensors={sensors}
            collisionDetection={collision}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={() => setLifted(null)}
            accessibility={{
                screenReaderInstructions: {
                    draggable: "Press Space or Enter to lift the deal, the arrow keys to move it to another stage, Space or Enter to drop it, Escape to cancel.",
                },
                announcements: {
                    onDragStart: ({ active }) => `Lifted ${nameOf(active.id)}.`,
                    onDragOver: ({ active, over }) => `${nameOf(active.id)} over ${columnOf(over?.id)}.`,
                    onDragEnd: ({ active, over }) => (over ? `${nameOf(active.id)} dropped on ${columnOf(over.id)}.` : `${nameOf(active.id)} put back.`),
                    onDragCancel: ({ active }) => `Move of ${nameOf(active.id)} cancelled.`,
                },
            }}
        >
            <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
                <div className="grid min-w-[900px] grid-cols-6 gap-3 md:min-w-0">
                    {stages.map((s) => {
                        const list = columns[s] ?? [];
                        return (
                            <Column key={s} status={s} count={list.length} lifted={lifted}>
                                {list.length === 0 ? (
                                    lifted && lifted.status !== s ? (
                                        <li className="rounded-md border border-dashed border-primary/40 p-3 text-center text-xs text-muted-foreground">drop here</li>
                                    ) : (
                                        <li className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">Empty</li>
                                    )
                                ) : (
                                    list.map((l) => <LeadCard key={l.id} l={l} />)
                                )}
                            </Column>
                        );
                    })}
                </div>
            </div>
            <DragOverlay>{lifted ? <OverlayCard l={lifted} /> : null}</DragOverlay>
            {losing ? <LostReasonDialog key={losing.id} open name={losing.company ? `${losing.name} · ${losing.company}` : losing.name} reason={losing.lostReason || "other"} note={losing.lostNote} onClose={onLostClose} /> : null}
        </DndContext>
    );
}

/** One stage column: a drop target, greyed out while it is the lifted card's own column. */
function Column({ status, count, lifted, children }: { status: LeadStatus; count: number; lifted: BoardLead | null; children: React.ReactNode }) {
    const source = lifted?.status === status;
    const { setNodeRef, isOver } = useDroppable({ id: status, disabled: source });
    return (
        <div
            ref={setNodeRef}
            aria-disabled={source || undefined}
            className={cn(
                "rounded-lg border bg-muted/30 p-3 transition-[opacity,box-shadow,background-color]",
                source && "opacity-40",
                isOver && !source && "bg-muted/60 ring-2 ring-primary/50",
            )}
        >
            <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium">{STAGE_LABEL[status]}</h2>
                <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
            </div>
            <ul className="space-y-2">{children}</ul>
        </div>
    );
}

/** The card's contents; `live` renders the links, the overlay plain text. */
function CardBody({ l, live }: { l: BoardLead; live: boolean }) {
    const showQuote = l.status !== "lost" && (l.quote || l.status === "won" || l.status === "proposal");
    return (
        <>
            {live ? (
                // Not natively draggable: a link's own drag would fight the card's.
                <Link href={`/leads/${l.id}`} draggable={false} className="block truncate font-medium hover:text-primary">
                    {l.name}
                </Link>
            ) : (
                <p className="truncate font-medium">{l.name}</p>
            )}
            {l.company ? <p className="truncate text-xs text-muted-foreground">{l.company}</p> : null}
            {l.estValueMyr > 0 ? <p className="mt-1.5 text-xs font-medium tabular-nums">{fmtMyrWhole(l.estValueMyr)}</p> : null}
            {l.status === "lost" ? (
                <p className="mt-1.5 truncate text-xs text-muted-foreground" title={l.lostNote || undefined}>
                    {lostReasonLabel(l.lostReason)}
                    {l.lostNote ? ` — ${l.lostNote}` : ""}
                </p>
            ) : null}
            {live && showQuote ? (
                <div className="mt-2.5 space-y-1 border-t pt-2.5 text-xs">
                    {l.quote ? (
                        <Link href={`/quotes/${l.quote.id}`} draggable={false} className="block font-medium text-primary hover:underline">
                            Quote {l.quote.number} · {l.quote.status}
                        </Link>
                    ) : (
                        <Link href="/quotes" draggable={false} className="block text-muted-foreground hover:underline">
                            Write a quote
                        </Link>
                    )}
                    {l.status === "won" ? (
                        l.contract ? (
                            <Link href={`/projects/${l.contract.id}`} draggable={false} className="block font-medium text-primary hover:underline">
                                Account {l.contract.code} →
                            </Link>
                        ) : (
                            <Link href={`/projects/new?client=${encodeURIComponent(l.clientName)}`} draggable={false} className="block font-medium text-primary hover:underline">
                                Create account
                            </Link>
                        )
                    ) : null}
                </div>
            ) : null}
        </>
    );
}

/**
 * A deal as a card you can pick up: the whole card is the drag handle (mouse,
 * touch, or Space + arrow keys); the card itself is the keyboard activator,
 * so Enter on a link inside still follows the link.
 */
function LeadCard({ l }: { l: BoardLead }) {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: l.id, attributes: { roleDescription: "draggable deal" } });
    return (
        <li
            ref={(el) => {
                setNodeRef(el);
                setActivatorNodeRef(el);
            }}
            {...attributes}
            {...listeners}
            className={cn(
                CARD,
                "cursor-grab touch-manipulation select-none transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isDragging && "opacity-30",
            )}
        >
            <CardBody l={l} live />
        </li>
    );
}

/** The card as the drag overlay shows it: the same look, nothing interactive. */
function OverlayCard({ l }: { l: BoardLead }) {
    return (
        <div className={cn(CARD, "cursor-grabbing shadow-lg ring-1 ring-primary/30")}>
            <CardBody l={l} live={false} />
        </div>
    );
}
