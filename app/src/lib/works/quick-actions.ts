"use server";
/**
 * The small, direct task edits the project page, the board, the calendar and
 * the quick-edit pop-up make: add a task (the project page's "New task"), move
 * a card to another status, plan a day, set hours, move the deadline, and undo
 * a move. Plain arguments in, a result out, so a
 * client component can update optimistically and offer Undo in a toast.
 *
 * The rules live in transitions.ts and are the same ones the task page uses.
 * Everything else (requests, submissions with a link, reviews with a note)
 * stays on the task page and its form actions.
 */
import { revalidatePath } from "next/cache";
import { getActingMember } from "@/lib/auth";
import { recordAudit } from "@/lib/data/audit";
import { notify } from "@/lib/data/notifications";
import { listTeamMembers, roundHours } from "@/lib/data/team";
import { createWork, getWorkById, listWorks, updateWork, type LinkedKind, type TaskStatus, type Work } from "@/lib/data/works";
import { getContractById } from "@/lib/data/contracts";
import { DEFAULT_SPLIT, LINE_TYPE_LABEL, defaultApprover, isLineType } from "@/lib/data/planners";
import { phaseForMonth } from "@/lib/planners/helpers";
import { findMember, withHours } from "@/lib/capacity/helpers";
import { isManager } from "@/lib/roles";
import { createLinkedItem } from "@/lib/contracts/generate";
import { DEFAULT_CHANNEL } from "@/lib/contracts/requirements";
import { TASK_STATUS_ORDER, applyDueDate, isOpen, plannedDay } from "@/lib/works/helpers";
import { syncLinkedContent } from "@/lib/works/sync";
import {
    WAITING_CLEARED,
    allowedMoves,
    canAddTask,
    canPlan,
    canSetDeadline,
    canSetWaiting,
    endsWaiting,
    isAccountManagerOf,
    moveLabel,
    takesTasks,
    type Actor,
} from "@/lib/works/transitions";
import { WAITING_ON_LABEL, isWaitingOn, normalizeWaitingOn, type WaitingOn } from "@/lib/works/waiting";

export type QuickResult<T extends object = object> = ({ ok: true } & T) | { ok: false; reason: string };

/** What a move changed, so Undo can put it back exactly (the waiting marker included, since a submit clears it). */
export type MoveSnapshot = Pick<Work, "status" | "startedAt" | "submittedAt" | "completedAt" | "review"> & Partial<Pick<Work, "waitingOn" | "waitingSince">>;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** The acting person: the linked login, else the `as` pick / cookie. Nobody picked acts as management. */
async function actorFor(as?: string): Promise<Actor> {
    const m = await getActingMember(as || undefined);
    return { name: m?.name ?? "", manager: !m || isManager(m) };
}

function revalidateTask(id: string, contractId: string) {
    for (const p of ["/works", "/website", "/calendar", "/custom-tasks", "/my-work", "/projects", "/dashboard", "/notifications"]) {
        revalidatePath(p);
    }
    revalidatePath(`/works/${id}`);
    if (contractId) revalidatePath(`/projects/${contractId}`);
}

const pretty = (s: TaskStatus) => s.replace(/_/g, " ");

// ---------------------------------------------------------------------------
// New task (the project page's "New task")
// ---------------------------------------------------------------------------

/**
 * Add one task under a project from its page. Only the project's account
 * manager, management and the people already on the project may add
 * (canAddTask), and only to a signed or running project (takesTasks); the
 * due date may not fall before the project starts. The month and phase
 * follow the due date; the type's default seats are filled from the project
 * crew, the first one with `owner` when it is given ("" leaves that seat
 * open). Sign-off is the type's default. A Static post, Video post, Campaign
 * or SEO article task also gets the record it is done in, as generated tasks do.
 */
export async function createTaskAction(input: {
    contractId: string;
    type: string;
    title: string;
    dueDate: string;
    /** The person on the type's first seat; omitted = the crew's pick, "" = open seat. */
    owner?: string;
    as?: string;
}): Promise<QuickResult<{ id: string; title: string }>> {
    const member = await getActingMember(input.as || undefined);
    const c = input.contractId ? await getContractById(input.contractId) : null;
    if (!c) return { ok: false, reason: "Account not found" };
    if (!takesTasks(c)) {
        return { ok: false, reason: `${c.name} is not signed or running, so it takes no tasks` };
    }
    const actor: Actor = { name: member?.name ?? "", manager: !member || isManager(member) };
    if (!canAddTask(c, await listWorks(), actor)) {
        return { ok: false, reason: `Only ${c.accountManager || "the account manager"}, management or the people on ${c.name} add tasks to it` };
    }
    const type = input.type;
    if (!isLineType(type)) return { ok: false, reason: "Pick a task type" };
    const title = String(input.title ?? "").trim().slice(0, 200);
    if (!title) return { ok: false, reason: "Give the task a title" };
    if (!YMD.test(input.dueDate)) return { ok: false, reason: "Pick a due date" };
    if (c.startDate && input.dueDate < c.startDate) return { ok: false, reason: `Due before the account starts (${c.startDate})` };
    const month = input.dueDate.slice(0, 7);

    const team = await listTeamMembers();
    let owner: string | undefined;
    if (input.owner !== undefined) {
        const picked = input.owner.trim();
        const m = picked ? findMember(team.filter((t) => t.active), picked) : undefined;
        if (picked && !m) return { ok: false, reason: `${picked} is not on the active team` };
        owner = m?.name ?? "";
    }
    // The crew fills each seat the type needs (the AM seat falls to the account manager); the owner pick wins on the first seat.
    const split = withHours(
        DEFAULT_SPLIT[type].map((s, i) => ({
            seat: s.seat,
            pct: s.pct,
            member: i === 0 && owner !== undefined ? owner : (c.crew[s.seat] ?? (s.seat === "am" ? c.accountManager : "")),
        })),
        team,
        type,
    );
    const phase = phaseForMonth(c, month);
    const created = await createWork({
        contractId: c.id,
        clientName: c.clientName,
        accountManager: c.accountManager,
        type,
        title,
        channel: DEFAULT_CHANNEL[type],
        month,
        phaseKey: phase?.key ?? "",
        phaseName: phase?.name ?? "",
        dueDate: input.dueDate,
        split,
        approver: defaultApprover(type),
    });
    // The post / campaign / article the task is done in, linked the way the generator links it.
    const linked = await createLinkedItem(created);
    const w = linked ? await updateWork(created.id, { linked }) : created;
    const by = member?.name || input.as || "Team";
    await recordAudit({
        entity: "work",
        entityId: w.id,
        kind: "create",
        summary: `Task added on the account: ${w.title} (${LINE_TYPE_LABEL[type]}, due ${w.dueDate}) under ${c.code}`,
        actor: by,
    });
    revalidateTask(w.id, c.id);
    revalidatePath(`/projects/${c.id}/document`);
    if (linked) for (const p of LINKED_PAGES[linked.kind]) revalidatePath(p);
    return { ok: true, id: w.id, title: w.title };
}

/** The Delivery pages that list each kind of linked record. */
const LINKED_PAGES: Record<LinkedKind, string[]> = {
    content: ["/content", "/static-posts", "/video-posts"],
    campaign: ["/campaigns"],
    seo: ["/seo"],
};

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** Move a task to another status (a drop on the board, or a quick-edit button). */
export async function moveTaskAction(input: { id: string; to: TaskStatus; as?: string }): Promise<QuickResult<{ from: TaskStatus; snapshot: MoveSnapshot; label: string }>> {
    const w = await getWorkById(input.id);
    if (!w) return { ok: false, reason: "Task not found" };
    if (!TASK_STATUS_ORDER.includes(input.to)) return { ok: false, reason: "Unknown status" };
    const actor = await actorFor(input.as);
    if (!allowedMoves(w, actor).includes(input.to)) return { ok: false, reason: `${moveLabel(w, input.to)} is not yours to do from here` };

    const now = new Date().toISOString();
    const by = actor.name || "Team";
    const snapshot: MoveSnapshot = {
        status: w.status,
        startedAt: w.startedAt,
        submittedAt: w.submittedAt,
        completedAt: w.completedAt,
        review: w.review,
        waitingOn: w.waitingOn,
        waitingSince: w.waitingSince,
    };
    let patch: Parameters<typeof updateWork>[1] = { status: input.to };
    let after: () => Promise<void> = async () => {};

    if (input.to === "in_progress") {
        if (w.status === "pending_approval") {
            patch.review = { decision: "changes", note: "", by, at: now };
            after = () => syncLinkedContent(w, "changes", by, "");
        } else {
            patch.startedAt = now;
        }
    } else if (input.to === "pending_approval") {
        patch.submittedAt = now;
        patch.review = { decision: null, note: "", by: "", at: null };
        after = () =>
            notify({
                kind: "approval_requested",
                title: `Approval needed: ${w.title}`,
                body: `${w.clientName} · ${w.month} · submitted by ${by} · ${w.approver === "client" ? `client approval via ${w.accountManager || "AM"}` : `approve as ${w.accountManager || "account manager"}`}`,
                link: `/works/${w.id}`,
            });
    } else if (input.to === "completed") {
        patch.completedAt = now;
        if (w.status === "pending_approval") {
            patch.review = { decision: "approved", note: "", by, at: now };
            after = async () => {
                await syncLinkedContent(w, "approved", by, "");
                await notify({ kind: "work_approved", title: `Approved: ${w.title}`, body: `${w.clientName} · ${w.month} · by ${by}`, link: `/works/${w.id}` });
            };
        } else if (!w.submittedAt) {
            patch.submittedAt = now;
        }
    } else {
        patch = {
            status: "not_started",
            startedAt: null,
            submittedAt: null,
            completedAt: null,
            submission: { url: "", note: "" },
            review: { decision: null, note: "", by: "", at: null },
        };
    }
    // Handed over or finished: whatever it was waiting on no longer blocks it.
    if (endsWaiting(input.to)) patch = { ...patch, ...WAITING_CLEARED };

    await updateWork(w.id, patch);
    await recordAudit({
        entity: "work",
        entityId: w.id,
        kind: "status",
        summary: `${w.title}: ${pretty(w.status)} → ${pretty(input.to)}`,
        actor: by,
        changes: [{ field: "status", before: w.status, after: input.to }],
    });
    await after();
    revalidateTask(w.id, w.contractId);
    return { ok: true, from: w.status, snapshot, label: moveLabel(w, input.to) };
}

/** Put a task back the way it was before a move (the toast's Undo). */
export async function undoMoveAction(input: { id: string; snapshot: MoveSnapshot; as?: string }): Promise<QuickResult> {
    const w = await getWorkById(input.id);
    if (!w) return { ok: false, reason: "Task not found" };
    const s = input.snapshot;
    if (!s || !TASK_STATUS_ORDER.includes(s.status)) return { ok: false, reason: "Nothing to undo" };
    const actor = await actorFor(input.as);
    await updateWork(w.id, {
        status: s.status,
        startedAt: s.startedAt ?? null,
        submittedAt: s.submittedAt ?? null,
        completedAt: s.completedAt ?? null,
        review: s.review ?? { decision: null, note: "", by: "", at: null },
        waitingOn: normalizeWaitingOn(s.waitingOn),
        waitingSince: isWaitingOn(s.waitingOn) ? (s.waitingSince ?? null) : null,
    });
    await recordAudit({
        entity: "work",
        entityId: w.id,
        kind: "status",
        summary: `${w.title}: undo · back to ${pretty(s.status)}`,
        actor: actor.name || "Team",
        changes: [{ field: "status", before: w.status, after: s.status }],
    });
    revalidateTask(w.id, w.contractId);
    return { ok: true };
}

// ---------------------------------------------------------------------------
// Waiting on
// ---------------------------------------------------------------------------

/**
 * Mark who an open task is blocked on — the client (assets, access, feedback)
 * or someone inside — or clear it. The wait counts from now; a submit or a
 * completion clears it on its own.
 */
export async function setWaitingOnAction(input: { id: string; on: string; as?: string }): Promise<QuickResult<{ previous: WaitingOn }>> {
    if (input.on !== "" && !isWaitingOn(input.on)) return { ok: false, reason: "Unknown option" };
    const on = normalizeWaitingOn(input.on);
    const w = await getWorkById(input.id);
    if (!w) return { ok: false, reason: "Task not found" };
    if (!isOpen(w)) return { ok: false, reason: "A finished task waits on nobody" };
    const actor = await actorFor(input.as);
    if (!canSetWaiting(w, actor)) return { ok: false, reason: "Only the people on the task or its account manager can mark it" };
    const previous = w.waitingOn;
    if (previous === on) return { ok: true, previous };
    await updateWork(w.id, on ? { waitingOn: on, waitingSince: new Date().toISOString() } : WAITING_CLEARED);
    await recordAudit({
        entity: "work",
        entityId: w.id,
        kind: "update",
        summary: `${w.title}: ${on ? WAITING_ON_LABEL[on].toLowerCase() : "no longer waiting on anyone"}`,
        actor: actor.name || "Team",
        changes: [{ field: "waitingOn", before: previous, after: on }],
    });
    revalidateTask(w.id, w.contractId);
    return { ok: true, previous };
}

// ---------------------------------------------------------------------------
// Planned day, hours, deadline
// ---------------------------------------------------------------------------

/** The owner (or the account manager) plans the task for a day, never after the deadline. */
export async function setPlannedDayAction(input: { id: string; date: string; as?: string }): Promise<QuickResult<{ previous: string }>> {
    if (!YMD.test(input.date)) return { ok: false, reason: "Pick a day" };
    const w = await getWorkById(input.id);
    if (!w) return { ok: false, reason: "Task not found" };
    const actor = await actorFor(input.as);
    if (!canPlan(w, actor)) return { ok: false, reason: "Only the people on the task or its account manager can plan it" };
    if (w.dueDate && input.date > w.dueDate) return { ok: false, reason: `After the deadline (${w.dueDate}). Ask ${w.accountManager || "the account manager"} to move it.` };
    const previous = plannedDay(w);
    if (previous === input.date) return { ok: true, previous };
    await updateWork(w.id, { plannedDate: input.date === w.dueDate ? "" : input.date });
    await recordAudit({
        entity: "work",
        entityId: w.id,
        kind: "update",
        summary: `${w.title}: planned for ${input.date}${w.dueDate && input.date !== w.dueDate ? ` (due ${w.dueDate})` : ""}`,
        actor: actor.name || "Team",
        changes: [{ field: "plannedDate", before: previous, after: input.date }],
    });
    revalidateTask(w.id, w.contractId);
    return { ok: true, previous };
}

/** A person sets their own hours on a task; the account manager may set anyone's. */
export async function setTaskHoursAction(input: { id: string; member: string; hours: number; as?: string }): Promise<QuickResult<{ previous: number }>> {
    const h = roundHours(Number(input.hours));
    if (!(h > 0)) return { ok: false, reason: "Hours must be more than zero" };
    const w = await getWorkById(input.id);
    if (!w) return { ok: false, reason: "Task not found" };
    const actor = await actorFor(input.as);
    const own = Boolean(actor.name) && actor.name === input.member;
    if (!own && !isAccountManagerOf(w, actor)) return { ok: false, reason: "You can only change your own hours" };
    const share = w.split.find((s) => s.member === input.member);
    if (!share) return { ok: false, reason: `${input.member} is not on this task` };
    const previous = share.hours;
    if (previous === h) return { ok: true, previous };
    await updateWork(w.id, { split: w.split.map((s) => (s.member === input.member ? { ...s, hours: h } : s)) });
    await recordAudit({
        entity: "work",
        entityId: w.id,
        kind: "update",
        summary: `${w.title}: ${input.member} ${previous}h → ${h}h`,
        actor: actor.name || "Team",
        changes: [{ field: `hours:${input.member}`, before: String(previous), after: String(h) }],
    });
    revalidateTask(w.id, w.contractId);
    return { ok: true, previous };
}

/** The account manager moves the deadline, optionally pushing the later tasks of the project with it. */
export async function setDeadlineAction(input: { id: string; dueDate: string; shiftLater?: boolean; as?: string }): Promise<QuickResult<{ previous: string; moved: number }>> {
    if (!YMD.test(input.dueDate)) return { ok: false, reason: "Pick a day" };
    const all = await listWorks();
    const w = all.find((x) => x.id === input.id);
    if (!w) return { ok: false, reason: "Task not found" };
    const actor = await actorFor(input.as);
    if (!canSetDeadline(w, actor)) return { ok: false, reason: "Only the account manager moves the deadline" };
    const previous = w.dueDate;
    if (previous === input.dueDate) return { ok: true, previous, moved: 0 };
    const by = actor.name || "Team";
    const now = new Date().toISOString();
    const patches = applyDueDate(all, w.id, input.dueDate, Boolean(input.shiftLater), by, now);
    for (const [wid, patch] of patches) {
        const target = all.find((x) => x.id === wid);
        const due = (patch as { dueDate?: string }).dueDate;
        // A planned day never sits after its deadline.
        const extra = target && due && target.plannedDate && target.plannedDate > due ? { plannedDate: "" } : {};
        await updateWork(wid, { ...patch, ...extra });
    }
    const moved = patches.size - 1;
    await recordAudit({
        entity: "work",
        entityId: w.id,
        kind: "update",
        summary: `Timeline adjusted: ${w.title} ${previous} → ${input.dueDate}${moved > 0 ? ` · ${moved} later task${moved === 1 ? "" : "s"} moved with it` : ""}`,
        actor: by,
        changes: [{ field: "dueDate", before: previous, after: input.dueDate }],
    });
    revalidateTask(w.id, w.contractId);
    return { ok: true, previous, moved };
}
