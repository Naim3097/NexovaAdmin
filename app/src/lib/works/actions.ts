"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentTeamMember, getCurrentUser } from "@/lib/auth";
import { createWork, deleteWork, getWorkById, listWorks, updateWork, type TaskStatus, type WorkShare } from "@/lib/data/works";
import { getContractById } from "@/lib/data/contracts";
import { defaultApprover, isApprover, isLineType, isSeat, DEFAULT_SPLIT, SEAT_LABEL, type LineType } from "@/lib/data/planners";
import { listTeamMembers, roundHours, type TeamMember } from "@/lib/data/team";
import { withHours } from "@/lib/capacity/helpers";
import { syncLinkedContent } from "@/lib/works/sync";
import { recordAudit } from "@/lib/data/audit";
import { notify } from "@/lib/data/notifications";
import { applyDueDate, members, splitTotal } from "@/lib/works/helpers";
import { WAITING_CLEARED } from "@/lib/works/transitions";

function clean(v: FormDataEntryValue | null): string {
    return String(v ?? "").trim();
}

function num(v: FormDataEntryValue | null): number {
    const n = Number.parseFloat(clean(v));
    return Number.isFinite(n) ? n : 0;
}

/** "none" (the empty Select option) → "". */
function pick(v: FormDataEntryValue | null): string {
    const s = clean(v);
    return s === "none" ? "" : s;
}

/**
 * Who is acting. A linked team member wins; otherwise the `as` field the page
 * passes through (the "acting as" picker, needed in DEV_AUTH_BYPASS where
 * there is no real session); otherwise the login email.
 */
async function actorName(formData: FormData): Promise<string> {
    const member = await getCurrentTeamMember();
    if (member?.name) return member.name;
    const as = clean(formData.get("as"));
    if (as && as !== "none") return as;
    const user = await getCurrentUser();
    return user?.email ?? "Team";
}

function withAs(path: string, formData: FormData): string {
    const as = clean(formData.get("as"));
    return as && as !== "none" ? `${path}?as=${encodeURIComponent(as)}` : path;
}

function revalidate(id?: string, contractId?: string) {
    revalidatePath("/works");
    revalidatePath("/website");
    if (id) revalidatePath(`/works/${id}`);
    revalidatePath("/calendar");
    revalidatePath("/custom-tasks");
    revalidatePath("/projects");
    if (contractId) {
        revalidatePath(`/projects/${contractId}`);
        revalidatePath(`/projects/${contractId}/document`);
    }
    revalidatePath("/my-work");
    revalidatePath("/dashboard");
    revalidatePath("/notifications");
}

/** A share as it comes off a form: hours are optional (filled from the profile table when absent). */
type ShareInput = Omit<WorkShare, "hours"> & { hours?: number };

/** Up to four `seat_n` / `member_n` / `pct_n` (+ optional `hours_n`) rows → a split. */
function splitFrom(formData: FormData): ShareInput[] | null {
    const out: ShareInput[] = [];
    for (let i = 1; i <= 4; i += 1) {
        const seat = clean(formData.get(`seat_${i}`));
        const pct = Math.round(num(formData.get(`pct_${i}`)));
        if (!isSeat(seat) || pct <= 0) continue;
        const hoursRaw = formData.get(`hours_${i}`);
        out.push({ seat, member: pick(formData.get(`member_${i}`)), pct, hours: hoursRaw === null ? undefined : roundHours(num(hoursRaw)) });
    }
    return out.length ? out : null;
}

/**
 * Hours on a share: keep what the form sent, else what the same person already
 * had on this task, else their profile table / the type default.
 */
function hoursFrom(shares: ShareInput[], previous: WorkShare[], team: TeamMember[], type: LineType): WorkShare[] {
    const prev = new Map(previous.map((s) => [s.member.trim().toLowerCase(), s.hours]));
    return withHours(
        shares.map((s) => ({ ...s, hours: s.hours && s.hours > 0 ? s.hours : prev.get(s.member.trim().toLowerCase()) })),
        team,
        type,
    );
}

// ---------------------------------------------------------------------------
// Work (one task)
// ---------------------------------------------------------------------------

/**
 * Add a task by hand under a project from a form (the Website and Other tasks
 * pages). The Tasks board adds through createTaskAction in quick-actions.ts,
 * which checks the same things and also requires a signed or running project.
 */
export async function createWorkAction(formData: FormData) {
    const contractId = clean(formData.get("contractId"));
    const contract = contractId ? await getContractById(contractId) : null;
    const typeRaw = clean(formData.get("type"));
    const title = clean(formData.get("title"));
    const month = clean(formData.get("month"));
    if (!contract || !isLineType(typeRaw) || !title || !/^\d{4}-\d{2}$/.test(month)) return;
    const dueDate = clean(formData.get("dueDate")) || `${month}-15`;
    const approverRaw = clean(formData.get("approver"));
    // Forms may send the phase by key or by name; resolve against the project phases.
    const phaseIn = pick(formData.get("phaseKey")) || pick(formData.get("phaseName"));
    const phase = contract.phases.find((ph) => ph.key === phaseIn || ph.name === phaseIn);
    // Seats with nobody named fall to the account manager when the seat is "am".
    const fillAm = (list: ShareInput[]) => list.map((s) => (s.seat === "am" && !s.member ? { ...s, member: contract.accountManager } : s));
    const w = await createWork({
        contractId,
        clientName: contract.clientName,
        accountManager: contract.accountManager,
        type: typeRaw,
        title,
        channel: clean(formData.get("channel")),
        month,
        phaseKey: phase?.key ?? "",
        phaseName: phase?.name ?? clean(formData.get("phaseName")),
        dueDate,
        split: hoursFrom(fillAm(splitFrom(formData) ?? DEFAULT_SPLIT[typeRaw].map((s) => ({ ...s, member: "" }))), [], await listTeamMembers(), typeRaw),
        approver: isApprover(approverRaw) ? approverRaw : defaultApprover(typeRaw),
        milestone: clean(formData.get("milestone")) === "1",
        notes: clean(formData.get("notes")),
    });
    await recordAudit({
        entity: "work",
        entityId: w.id,
        kind: "create",
        summary: `Task added: ${w.title} (${w.month}) under ${contract.code}`,
        actor: await actorName(formData),
    });
    revalidate(w.id, contractId);
    const back = clean(formData.get("back"));
    if (back) redirect(back);
}

export async function updateWorkAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const w = id ? await getWorkById(id) : null;
    if (!w) return;
    const patch: Parameters<typeof updateWork>[1] = {};
    if (formData.has("title") && clean(formData.get("title"))) patch.title = clean(formData.get("title"));
    if (formData.has("channel")) patch.channel = clean(formData.get("channel"));
    if (formData.has("notes")) patch.notes = clean(formData.get("notes"));
    if (formData.has("month") && /^\d{4}-\d{2}$/.test(clean(formData.get("month")))) patch.month = clean(formData.get("month"));
    if (formData.has("phaseName")) patch.phaseName = clean(formData.get("phaseName"));
    const approverRaw = clean(formData.get("approver"));
    if (isApprover(approverRaw)) patch.approver = approverRaw;
    if (formData.has("milestone")) patch.milestone = clean(formData.get("milestone")) === "1";
    await updateWork(id, patch);
    revalidate(id, w.contractId);
}

export async function deleteWorkAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const w = id ? await getWorkById(id) : null;
    if (!w) return;
    await deleteWork(id);
    await recordAudit({ entity: "work", entityId: id, kind: "delete", summary: `Task deleted: ${w.title}`, actor: await actorName(formData) });
    revalidate(undefined, w.contractId);
    redirect(`/projects/${w.contractId}#works`);
}

/** Who holds what share. Must add up to 100%. */
export async function setSplitAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const w = id ? await getWorkById(id) : null;
    const shares = splitFrom(formData);
    if (!w || !shares || splitTotal(shares) !== 100) return;
    const split = hoursFrom(shares, w.split, await listTeamMembers(), w.type);
    const before = members(w).join(", ") || "nobody";
    await updateWork(id, { split });
    const after = members({ ...w, split }).join(", ") || "nobody";
    if (before !== after) {
        await recordAudit({
            entity: "work",
            entityId: id,
            kind: "update",
            summary: `${w.title}: assigned to ${split.map((s) => `${s.member || SEAT_LABEL[s.seat]} ${s.pct}%`).join(" · ")}`,
            actor: await actorName(formData),
            changes: [{ field: "assignees", before, after }],
        });
    }
    revalidate(id, w.contractId);
}

/** Account manager moves the date; optionally everything later that month moves with it. */
export async function setDueAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const dueDate = clean(formData.get("dueDate"));
    const shiftLater = clean(formData.get("shiftLater")) === "1";
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return;
    const all = await listWorks();
    const w = all.find((x) => x.id === id);
    if (!w || w.dueDate === dueDate) return;
    const actor = await actorName(formData);
    const now = new Date().toISOString();
    const patches = applyDueDate(all, id, dueDate, shiftLater, actor, now);
    for (const [wid, patch] of patches) await updateWork(wid, patch);
    const moved = patches.size - 1;
    await recordAudit({
        entity: "work",
        entityId: id,
        kind: "update",
        summary: `Timeline adjusted: ${w.title} ${w.dueDate} → ${dueDate}${moved > 0 ? ` · ${moved} later task${moved === 1 ? "" : "s"} moved with it` : ""}`,
        actor,
        changes: [{ field: "dueDate", before: w.dueDate, after: dueDate }],
    });
    revalidate(id, w.contractId);
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

async function setStatus(
    formData: FormData,
    allowed: TaskStatus[],
    next: TaskStatus,
    extra: (actor: string, now: string) => Record<string, unknown> = () => ({}),
) {
    const id = clean(formData.get("id"));
    const w = id ? await getWorkById(id) : null;
    if (!w || !allowed.includes(w.status)) return null;
    const actor = await actorName(formData);
    const now = new Date().toISOString();
    await updateWork(id, { status: next, ...extra(actor, now) });
    await recordAudit({
        entity: "work",
        entityId: id,
        kind: "status",
        summary: `${w.title}: ${w.status.replace(/_/g, " ")} → ${next.replace(/_/g, " ")}`,
        actor,
        changes: [{ field: "status", before: w.status, after: next }],
    });
    revalidate(id, w.contractId);
    return { w, actor };
}

export async function startWorkAction(formData: FormData) {
    await setStatus(formData, ["not_started"], "in_progress", (_a, now) => ({ startedAt: now }));
}

/** Whoever holds a share finishes: straight to Completed when nobody approves, else Awaiting approval. */
/**
 * "Took N hours": on submit the person may correct their own planned hours on
 * the task. Only their share changes; nothing happens when the field is absent.
 */
async function applyOwnHours(id: string, actor: string, hoursRaw: FormDataEntryValue | null) {
    if (hoursRaw === null || clean(hoursRaw) === "") return;
    const h = roundHours(num(hoursRaw));
    if (h <= 0) return;
    const w = await getWorkById(id);
    if (!w) return;
    const key = actor.trim().toLowerCase();
    if (!w.split.some((s) => s.member.trim().toLowerCase() === key)) return;
    await updateWork(id, { split: w.split.map((s) => (s.member.trim().toLowerCase() === key ? { ...s, hours: h } : s)) });
}

export async function submitWorkAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const w = id ? await getWorkById(id) : null;
    if (!w) return;
    const url = clean(formData.get("url"));
    const note = clean(formData.get("note"));
    await applyOwnHours(id, await actorName(formData), formData.get("hours"));
    // Handing it over ends whatever it was waiting on.
    if (w.approver === "none") {
        await setStatus(formData, ["not_started", "in_progress"], "completed", (_a, now) => ({
            completedAt: now,
            submittedAt: now,
            submission: { url, note },
            ...WAITING_CLEARED,
        }));
        return;
    }
    const res = await setStatus(formData, ["not_started", "in_progress"], "pending_approval", (_a, now) => ({
        submittedAt: now,
        submission: { url, note },
        review: { decision: null, note: "", by: "", at: null },
        ...WAITING_CLEARED,
    }));
    if (!res) return;
    await notify({
        kind: "approval_requested",
        title: `Approval needed: ${w.title}`,
        body: `${w.clientName} · ${w.month} · submitted by ${res.actor} · ${w.approver === "client" ? `client approval via ${w.accountManager || "AM"}` : `approve as ${w.accountManager || "account manager"}`}${url ? ` · ${url}` : ""}`,
        link: `/works/${w.id}`,
    });
}

/** Account manager (or the client through them) approves or sends it back. Changes never move forward. */
export async function reviewWorkAction(formData: FormData) {
    const decision = clean(formData.get("decision"));
    const note = clean(formData.get("note"));
    const id = clean(formData.get("id"));
    const w = id ? await getWorkById(id) : null;
    if (!w || (decision !== "approve" && decision !== "changes")) return;
    if (decision === "approve") {
        const res = await setStatus(formData, ["pending_approval"], "completed", (actor, now) => ({
            completedAt: now,
            review: { decision: "approved", note, by: actor, at: now },
            ...WAITING_CLEARED,
        }));
        if (!res) return;
        await syncLinkedContent(w, "approved", res.actor, note);
        await notify({
            kind: "work_approved",
            title: `Approved: ${w.title}`,
            body: `${w.clientName} · ${w.month} · by ${res.actor}${note ? ` — ${note}` : ""}`,
            link: `/works/${w.id}`,
        });
        return;
    }
    const res = await setStatus(formData, ["pending_approval"], "in_progress", (actor, now) => ({
        review: { decision: "changes", note, by: actor, at: now },
    }));
    if (!res) return;
    await syncLinkedContent(w, "changes", res.actor, note);
    await notify({
        kind: "work_changes_requested",
        title: `Changes requested: ${w.title}`,
        body: `${w.clientName} · back to ${members(w).join(", ") || "the team"}${note ? ` — ${note}` : ""}`,
        link: `/works/${w.id}`,
    });
}

/** Account manager marks a task done regardless of where it is. */
export async function completeWorkAction(formData: FormData) {
    await setStatus(formData, ["not_started", "in_progress", "pending_approval"], "completed", (_a, now) => ({ completedAt: now, ...WAITING_CLEARED }));
}

export async function reopenWorkAction(formData: FormData) {
    await setStatus(formData, ["in_progress", "pending_approval", "completed"], "not_started", () => ({
        startedAt: null,
        submittedAt: null,
        completedAt: null,
        submission: { url: "", note: "" },
        review: { decision: null, note: "", by: "", at: null },
    }));
}

/** Keep the `?as=` picker across a redirecting form. */
export async function backToWork(formData: FormData) {
    redirect(withAs(`/works/${clean(formData.get("id"))}`, formData));
}
