"use client";
/**
 * One task as a board card you can pick up: the same look as `WorkCard` in
 * ./ui (title, milestone, type, channel, client, owners, due, "waiting on"),
 * plus the planned hours as a chip. The title opens the quick edit, the arrow
 * opens the task page, and the whole card is the drag handle (mouse, touch,
 * or Space + arrow keys). `OverlayCard` is the static copy the drag overlay
 * carries under the pointer.
 */
import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import type { TaskStatus, Work } from "@/lib/data/works";
import { fmtHours } from "@/lib/capacity/helpers";
import type { Actor } from "@/lib/works/transitions";
import { waitingLabel } from "@/lib/works/waiting";
import { cn } from "@/lib/utils";
import { QuickEdit } from "./quick-edit";
import { DueLabel, SplitLabel, TypeBadge } from "./ui";

/** Planned hours across every share of the task. */
export function totalHours(w: Pick<Work, "split">): number {
    return w.split.reduce((sum, s) => sum + (Number(s.hours) || 0), 0);
}

const CARD = "rounded-lg border bg-card p-3 text-sm shadow-xs";

function isOverdue(w: Work, today: string): boolean {
    return w.status !== "completed" && Boolean(w.dueDate) && w.dueDate < today;
}

/** The card's contents. `title` is the quick-edit trigger on the board and plain text in the overlay. */
function CardBody({ w, today, showClient, title, open }: { w: Work; today: string; showClient: boolean; title: React.ReactNode; open?: React.ReactNode }) {
    const hours = totalHours(w);
    return (
        <>
            <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 leading-snug">
                    {title}
                    {w.milestone ? (
                        <span title="Milestone" className="ml-1 text-amber-500">
                            ◆
                        </span>
                    ) : null}
                </span>
                {open}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                <TypeBadge type={w.type} short />
                {w.channel ? <span className="text-[11px] text-muted-foreground">{w.channel}</span> : null}
                {showClient ? <span className="text-[11px] text-muted-foreground">· {w.clientName}</span> : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-1">
                <SplitLabel split={w.split} short />
                <span className="flex items-center gap-1">
                    <DueLabel due={w.dueDate} status={w.status} today={today} adjusted={Boolean(w.defaultDueDate) && w.dueDate !== w.defaultDueDate} defaultDue={w.defaultDueDate} />
                    {hours > 0 ? (
                        <span className="rounded bg-muted px-1 text-[10px] tabular-nums text-muted-foreground" title="Planned hours on this task">
                            {fmtHours(hours)}
                        </span>
                    ) : null}
                </span>
            </div>
            {w.status === "pending_approval" ? (
                <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                    {w.approver === "client" ? `waiting on the client via ${w.accountManager || "AM"}` : `waiting on ${w.accountManager || "the account manager"}`}
                </p>
            ) : null}
            {w.waitingOn && w.status !== "completed" ? (
                <p className="mt-1.5">
                    <span
                        className={cn(
                            "inline-flex h-5 items-center rounded-md px-1.5 text-[11px] font-medium whitespace-nowrap",
                            w.waitingOn === "client" ? "bg-amber-400/15 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground",
                        )}
                        title={w.waitingSince ? `Blocked since ${w.waitingSince.slice(0, 10)}` : undefined}
                    >
                        {waitingLabel(w, today)}
                    </span>
                </p>
            ) : null}
        </>
    );
}

/**
 * The quick-edit pop-up renders in a portal, so React still bubbles its
 * events up to the card's drag listeners; a drag inside the dialog must not
 * lift the card. Events that start on the trigger itself pass through.
 */
function stopPortalled(e: React.SyntheticEvent) {
    if (!(e.currentTarget as HTMLElement).contains(e.target as Node)) e.stopPropagation();
}

export type BoardCardProps = {
    w: Work;
    today: string;
    /** `?as=…` for links, "" otherwise. */
    asQ: string;
    actor: Actor;
    /** `?as=` under the dev bypass, so the server actions know who is acting. */
    asParam?: string;
    showClient: boolean;
    /** The board moves the card at once; the quick edit calls this after its own save. */
    onMoved: (id: string, to: TaskStatus) => void;
};

export function BoardCard({ w, today, asQ, actor, asParam, showClient, onMoved }: BoardCardProps) {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: w.id, attributes: { roleDescription: "draggable task" } });
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
                "cursor-grab touch-manipulation select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isOverdue(w, today) && "border-red-500/40",
                isDragging && "opacity-30",
            )}
        >
            <CardBody
                w={w}
                today={today}
                showClient={showClient}
                title={
                    <span onMouseDown={stopPortalled} onPointerDown={stopPortalled} onTouchStart={stopPortalled} onKeyDown={stopPortalled}>
                        <QuickEdit
                            w={w}
                            actor={actor}
                            today={today}
                            asParam={asParam}
                            onMoved={onMoved}
                            trigger={
                                <button type="button" className="text-left font-medium hover:underline">
                                    {w.title}
                                </button>
                            }
                        />
                    </span>
                }
                open={
                    <Link
                        href={`/works/${w.id}${asQ}`}
                        title="Open task"
                        aria-label={`Open ${w.title}`}
                        className="-mr-1 -mt-1 shrink-0 rounded px-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                        ↗
                    </Link>
                }
            />
        </li>
    );
}

/** The card as the drag overlay shows it: the same look, nothing interactive. */
export function OverlayCard({ w, today, showClient }: { w: Work; today: string; showClient: boolean }) {
    return (
        <div className={cn(CARD, "cursor-grabbing shadow-lg ring-1 ring-primary/30", isOverdue(w, today) && "border-red-500/40")}>
            <CardBody w={w} today={today} showClient={showClient} title={<span className="font-medium">{w.title}</span>} />
        </div>
    );
}
