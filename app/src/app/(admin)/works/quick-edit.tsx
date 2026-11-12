"use client";
/**
 * The quick edit: one small pop-up shared by the board, the calendar and the
 * task list. Status (the moves this person may make), the planned day, the
 * hours, and the deadline for the account manager. Everything saves at once
 * and shows an undo toast where undo makes sense. The full task page stays
 * one link away for links, notes and reviews.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { TaskStatus, Work } from "@/lib/data/works";
import { LINE_TYPE_LABEL } from "@/lib/planners/vocab";
import { fmtHours, isOffDay } from "@/lib/capacity/helpers";
import { TASK_STATUS_LABEL, plannedDay } from "@/lib/works/helpers";
import { moveTaskAction, setDeadlineAction, setPlannedDayAction, setTaskHoursAction, setWaitingOnAction, undoMoveAction, type MoveSnapshot } from "@/lib/works/quick-actions";
import { allowedMoves, canPlan, canSetDeadline, canSetWaiting, isAccountManagerOf, moveLabel, type Actor } from "@/lib/works/transitions";
import { WAITING_ON_LABEL, waitingDays, type WaitingOn } from "@/lib/works/waiting";
import { cn } from "@/lib/utils";
import { STATUS_CLASS } from "./ui";

/** The "Waiting on" choices, in the order the segmented control shows them. */
const WAITING_OPTIONS: Array<{ value: WaitingOn; label: string }> = [
    { value: "", label: "Nobody" },
    { value: "client", label: "Client" },
    { value: "internal", label: "Us" },
];

export type QuickEditProps = {
    w: Work;
    actor: Actor;
    today: string;
    /** `?as=` under the dev bypass, so the server knows who is acting. */
    asParam?: string;
    /** What opens the pop-up (a card title, a calendar chip). */
    trigger: React.ReactElement;
    /** The board updates its columns at once; the server catches up on refresh. */
    onMoved?: (id: string, to: TaskStatus) => void;
    /** The calendar moves the chip at once. */
    onPlanned?: (id: string, date: string) => void;
};

/** Five seconds to change your mind. */
const UNDO_MS = 5000;

export function QuickEdit({ w, actor, today, asParam, trigger, onMoved, onPlanned }: QuickEditProps) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [pending, start] = useTransition();
    const [planned, setPlanned] = useState(plannedDay(w));
    const [deadline, setDeadline] = useState(w.dueDate);
    const [shiftLater, setShiftLater] = useState(true);
    const [hours, setHours] = useState<Record<string, string>>(Object.fromEntries(w.split.map((s) => [s.member, String(s.hours)])));
    const [waiting, setWaiting] = useState<WaitingOn>(w.waitingOn);
    const asQ = asParam ? `?as=${encodeURIComponent(asParam)}` : "";
    const moves = allowedMoves(w, actor);
    const planner = canPlan(w, actor);
    const am = canSetDeadline(w, actor);
    const waiter = canSetWaiting(w, actor);
    // The saved marker's age; a pick made in this pop-up starts counting from today.
    const waitedDays = waiting && waiting === w.waitingOn ? waitingDays(w, today) : 0;

    const move = (to: TaskStatus) =>
        start(async () => {
            const r = await moveTaskAction({ id: w.id, to, as: asParam });
            if (!r.ok) {
                toast.error(r.reason);
                return;
            }
            onMoved?.(w.id, to);
            setOpen(false);
            toastUndo(`${r.label}: ${w.title}`, `now ${TASK_STATUS_LABEL[to]}`, async () => {
                const u = await undoMoveAction({ id: w.id, snapshot: r.snapshot, as: asParam });
                if (u.ok) onMoved?.(w.id, r.from);
                else toast.error(u.reason);
                router.refresh();
            });
            router.refresh();
        });

    const savePlanned = () =>
        start(async () => {
            const r = await setPlannedDayAction({ id: w.id, date: planned, as: asParam });
            if (!r.ok) {
                toast.error(r.reason);
                setPlanned(plannedDay(w));
                return;
            }
            onPlanned?.(w.id, planned);
            toast.success(`Planned for ${planned}${isOffDay(planned) ? " · off day" : ""}`);
            router.refresh();
        });

    const saveDeadline = () =>
        start(async () => {
            const r = await setDeadlineAction({ id: w.id, dueDate: deadline, shiftLater, as: asParam });
            if (!r.ok) {
                toast.error(r.reason);
                setDeadline(w.dueDate);
                return;
            }
            if (planned > deadline) setPlanned(deadline);
            toast.success(`Deadline ${deadline}${r.moved ? ` · ${r.moved} later task${r.moved === 1 ? "" : "s"} moved too` : ""}`);
            router.refresh();
        });

    const saveWaiting = (on: WaitingOn) =>
        start(async () => {
            const before = waiting;
            setWaiting(on);
            const r = await setWaitingOnAction({ id: w.id, on, as: asParam });
            if (!r.ok) {
                toast.error(r.reason);
                setWaiting(before);
                return;
            }
            toast.success(on ? `${WAITING_ON_LABEL[on]} · ${w.title}` : `No longer waiting · ${w.title}`);
            router.refresh();
        });

    const saveHours = (member: string) =>
        start(async () => {
            const h = Number(hours[member]);
            const r = await setTaskHoursAction({ id: w.id, member, hours: h, as: asParam });
            if (!r.ok) {
                toast.error(r.reason);
                setHours((prev) => ({ ...prev, [member]: String(w.split.find((s) => s.member === member)?.hours ?? "") }));
                return;
            }
            toast.success(`${member}: ${fmtHours(h)} on this task`);
            router.refresh();
        });

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={trigger} />
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="pr-6 leading-snug">{w.title}</DialogTitle>
                    <DialogDescription>
                        {w.clientName} · {LINE_TYPE_LABEL[w.type]}
                        {w.channel ? ` · ${w.channel}` : ""}
                        {w.phaseName ? ` · ${w.phaseName}` : ""}
                        {w.accountManager ? ` · AM ${w.accountManager}` : ""}
                    </DialogDescription>
                </DialogHeader>

                {/* Status */}
                <section className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className={cn(STATUS_CLASS[w.status])}>
                            {TASK_STATUS_LABEL[w.status]}
                        </Badge>
                        {moves.map((to) => (
                            <Button key={to} size="sm" variant={to === "completed" ? "default" : "outline"} disabled={pending} onClick={() => move(to)}>
                                {moveLabel(w, to)}
                            </Button>
                        ))}
                    </div>
                    {w.status === "pending_approval" && !isAccountManagerOf(w, actor) ? (
                        <p className="text-[11px] text-muted-foreground">
                            Waiting on {w.approver === "client" ? `the client via ${w.accountManager || "the AM"}` : w.accountManager || "the account manager"}.
                        </p>
                    ) : null}
                </section>

                {/* Waiting on: blocked on the client or on someone inside */}
                {w.status !== "completed" ? (
                    <section className="space-y-1.5">
                        <p className="text-xs text-muted-foreground">Waiting on{waitedDays > 0 ? ` · ${waitedDays}d so far` : ""}</p>
                        <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Waiting on">
                            {WAITING_OPTIONS.map((o) => (
                                <button
                                    key={o.value || "nobody"}
                                    type="button"
                                    aria-pressed={waiting === o.value}
                                    disabled={!waiter || pending}
                                    onClick={() => {
                                        if (waiting !== o.value) saveWaiting(o.value);
                                    }}
                                    className={cn(
                                        "rounded px-2.5 py-1 text-xs transition-colors disabled:opacity-50",
                                        // Not waiting is the normal state, so it stays quiet; a block is coloured like the chip on the card.
                                        waiting !== o.value
                                            ? "text-muted-foreground hover:bg-accent hover:text-foreground"
                                            : o.value === "client"
                                              ? "bg-amber-400/20 font-medium text-amber-700 dark:text-amber-400"
                                              : o.value === "internal"
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-muted font-medium text-foreground",
                                    )}
                                >
                                    {o.label}
                                </button>
                            ))}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            {waiter ? "Blocked on assets, access or feedback? Mark it. It clears when the task is submitted or done." : "Only the people on the task or its account manager mark it."}
                        </p>
                    </section>
                ) : null}

                {/* Planned day and deadline */}
                <section className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground">Planned day</p>
                        <div className="flex items-center gap-1.5">
                            <Input
                                type="date"
                                value={planned}
                                max={w.dueDate || undefined}
                                disabled={!planner || pending}
                                onChange={(e) => setPlanned(e.target.value)}
                                className="h-8 text-xs"
                            />
                            <Button size="sm" variant="outline" disabled={!planner || pending || planned === plannedDay(w)} onClick={savePlanned}>
                                Save
                            </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            {planner ? "Any day up to the deadline." : "Only the people on the task plan it."}
                            {planned && isOffDay(planned) ? " Off day: counts as off-day hours." : ""}
                        </p>
                    </div>
                    <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground">Deadline{am ? "" : " · set by the AM"}</p>
                        {am ? (
                            <>
                                <div className="flex items-center gap-1.5">
                                    <Input type="date" value={deadline} disabled={pending} onChange={(e) => setDeadline(e.target.value)} className="h-8 text-xs" />
                                    <Button size="sm" variant="outline" disabled={pending || deadline === w.dueDate} onClick={saveDeadline}>
                                        Save
                                    </Button>
                                </div>
                                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                    <input type="checkbox" checked={shiftLater} onChange={(e) => setShiftLater(e.target.checked)} />
                                    move later tasks too
                                </label>
                            </>
                        ) : (
                            <p className={cn("text-sm tabular-nums", w.status !== "completed" && w.dueDate && w.dueDate < today && "font-medium text-red-600 dark:text-red-400")}>
                                {w.dueDate || "—"}
                            </p>
                        )}
                    </div>
                </section>

                {/* Hours */}
                <section className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">Hours · from each profile unless changed here</p>
                    <ul className="space-y-1">
                        {w.split.map((s, i) => {
                            const editable = Boolean(s.member) && (s.member === actor.name || isAccountManagerOf(w, actor));
                            return (
                                <li key={`${s.seat}-${i}`} className="flex items-center gap-2 text-sm">
                                    <span className={cn("w-28 truncate", !s.member && "italic text-muted-foreground")}>{s.member || "open seat"}</span>
                                    <span className="w-10 text-xs tabular-nums text-muted-foreground">{s.pct}%</span>
                                    {editable ? (
                                        <>
                                            <Input
                                                type="number"
                                                step={0.25}
                                                min={0.25}
                                                value={hours[s.member] ?? ""}
                                                disabled={pending}
                                                onChange={(e) => setHours((prev) => ({ ...prev, [s.member]: e.target.value }))}
                                                className="h-8 w-20 text-xs"
                                            />
                                            <span className="text-xs text-muted-foreground">h</span>
                                            <Button size="sm" variant="ghost" disabled={pending || Number(hours[s.member]) === s.hours} onClick={() => saveHours(s.member)}>
                                                Save
                                            </Button>
                                        </>
                                    ) : (
                                        <span className="text-xs tabular-nums">{s.hours > 0 ? fmtHours(s.hours) : "—"}</span>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </section>

                <div className="flex items-center justify-between border-t pt-3 text-xs">
                    <span className="text-muted-foreground">
                        {w.month}
                        {w.milestone ? " · milestone" : ""}
                    </span>
                    <Link href={`/works/${w.id}${asQ}`} className="font-medium underline">
                        Open task
                    </Link>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** "Moved to Doing · Undo" for a few seconds. Shared with the board and the calendar. */
export function toastUndo(title: string, description: string, undo: () => void | Promise<void>) {
    toast.success(title, { description, duration: UNDO_MS, action: { label: "Undo", onClick: () => void undo() } });
}

/** Snapshot type re-exported for the board, which keeps one per optimistic move. */
export type { MoveSnapshot };
