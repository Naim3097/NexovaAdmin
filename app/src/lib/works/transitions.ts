/**
 * Which status moves a person may make on a task, shared by the board (to
 * grey out the columns a card cannot be dropped on), the quick edit (its
 * buttons) and the server action that applies the move. Pure, no I/O.
 *
 * The rules are the ones the task page already lives by: anyone on the task
 * starts and submits it; the account manager (or management) approves,
 * sends it back or marks it done regardless; reopening is open to all.
 */
import type { TaskStatus, Work } from "@/lib/data/works";

/** Who is acting. An empty name (nobody picked under the dev bypass) acts as management. */
export type Actor = { name: string; manager: boolean };

export function isAccountManagerOf(w: Pick<Work, "accountManager">, actor: Actor): boolean {
    return !actor.name || actor.manager || w.accountManager === actor.name;
}

export function ownsShare(w: Pick<Work, "split">, actor: Actor): boolean {
    return Boolean(actor.name) && w.split.some((s) => s.member === actor.name);
}

/** May change the planned day and hours: an owner, the account manager, management. */
export function canPlan(w: Pick<Work, "split" | "accountManager">, actor: Actor): boolean {
    return ownsShare(w, actor) || isAccountManagerOf(w, actor);
}

/** May move the deadline: the account manager or management only. */
export function canSetDeadline(w: Pick<Work, "accountManager">, actor: Actor): boolean {
    return isAccountManagerOf(w, actor);
}

/** May say who the task is waiting on: the same people who plan it. */
export function canSetWaiting(w: Pick<Work, "split" | "accountManager">, actor: Actor): boolean {
    return canPlan(w, actor);
}

/**
 * The patch that drops the "waiting on" marker. Spread into a submit or a
 * completion so the marker never outlives the block it described.
 */
export const WAITING_CLEARED: Pick<Work, "waitingOn" | "waitingSince"> = { waitingOn: "", waitingSince: null };

/** The moves that end a wait: handing the task over for review, or finishing it. */
export function endsWaiting(to: TaskStatus): boolean {
    return to === "pending_approval" || to === "completed";
}

/** The statuses `actor` may move the task to from where it is now. */
export function allowedMoves(w: Pick<Work, "status" | "approver" | "accountManager" | "split">, actor: Actor): TaskStatus[] {
    const am = isAccountManagerOf(w, actor);
    const out: TaskStatus[] = [];
    switch (w.status) {
        case "not_started":
            out.push("in_progress");
            out.push(w.approver === "none" ? "completed" : "pending_approval");
            if (w.approver !== "none" && am) out.push("completed");
            break;
        case "in_progress":
            out.push("not_started");
            out.push(w.approver === "none" ? "completed" : "pending_approval");
            if (w.approver !== "none" && am) out.push("completed");
            break;
        case "pending_approval":
            out.push("not_started");
            if (am) out.push("in_progress", "completed");
            break;
        case "completed":
            out.push("not_started");
            break;
    }
    return out;
}

/** The verb on the button / toast for a move. */
export function moveLabel(w: Pick<Work, "status" | "approver">, to: TaskStatus): string {
    if (to === "not_started") return "Reopen";
    if (to === "in_progress") return w.status === "pending_approval" ? "Changes" : "Start";
    if (to === "pending_approval") return "Submit";
    if (w.status === "pending_approval") return w.approver === "client" ? "Client approved" : "Approve";
    return w.approver === "none" || w.status === "not_started" ? "Done" : "Mark done";
}
