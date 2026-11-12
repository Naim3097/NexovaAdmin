/**
 * DEV-ONLY local file store for works (the tasks under a contract).
 * Replaced by Supabase `works` table once provisioned.
 *
 * A WORK is ONE item delivered under a contract — one content post, one
 * campaign, one SEO article, one website item — created from a line of the
 * accepted content planner (or added by hand). It sits in one month and one
 * phase, moves Not started → In progress → Awaiting approval → Completed, and
 * its responsibility is split by percentage across team members
 * (50% digital marketer, 50% creative …).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { devDataRoot } from "@/lib/dev-store/root";
import { randomUUID } from "node:crypto";
import { DEFAULT_SPLIT, isApprover, toLineType, toSeat, type Approver, type LineType, type Seat } from "@/lib/dev-store/planners";
import { normalizeWaitingOn, type WaitingOn } from "@/lib/works/waiting";

const ROOT = devDataRoot();
const DIR = path.join(ROOT, "works");

export const TASK_STATUSES = ["not_started", "in_progress", "pending_approval", "completed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export function isTaskStatus(v: string): v is TaskStatus {
    return (TASK_STATUSES as readonly string[]).includes(v);
}

/** One share of a task. `member` is "" until someone is assigned. */
/**
 * One person's share of a task. `pct` = responsibility (who answers for it,
 * sums to 100); `hours` = the working time THIS person plans for it, prefilled
 * from their profile and edited only when it ran longer. Quarter-hour steps.
 */
export type WorkShare = { seat: Seat; member: string; pct: number; hours: number };

export const LINKED_KINDS = ["content", "campaign", "seo"] as const;
export type LinkedKind = (typeof LINKED_KINDS)[number];
/** The record in Contents / Campaigns / SEO where the work itself is done. */
export type LinkedItem = { kind: LinkedKind; id: string };

export type Work = {
    id: string;
    contractId: string;
    clientName: string;
    accountManager: string;
    /** Planner line this task came from. null = added by hand. */
    plannerLineId: string | null;
    /** 0 = original scope; n = added by addendum n. */
    addendumVersion: number;
    type: LineType;
    title: string;
    channel: string;
    /** YYYY-MM the task is delivered in. */
    month: string;
    phaseKey: string;
    phaseName: string;
    /** YYYY-MM-DD the account manager set (starts equal to the planner date). The deadline. */
    dueDate: string;
    /** YYYY-MM-DD from the planner. */
    defaultDueDate: string;
    /**
     * YYYY-MM-DD the owner plans to do it, never after the deadline.
     * "" = on the deadline. The calendar shows the task on this day.
     */
    plannedDate: string;
    /** Who last moved the date off the planner. "" = as planned. */
    adjustedBy: string;
    adjustedAt: string | null;
    status: TaskStatus;
    split: WorkShare[];
    approver: Approver;
    milestone: boolean;
    linked: LinkedItem | null;
    startedAt: string | null;
    submittedAt: string | null;
    submission: { url: string; note: string };
    review: { decision: "approved" | "changes" | null; note: string; by: string; at: string | null };
    completedAt: string | null;
    notes: string;
    /** Who the task waits on ("" = nobody), set from the quick edit; clears when the task moves on. */
    waitingOn: WaitingOn;
    /** ISO when it started waiting; null when not waiting. */
    waitingSince: string | null;
    createdAt: string;
    updatedAt: string;
};

export function normalizeWork(raw: Partial<Work> & { id: string }): Work {
    const now = new Date().toISOString();
    const type = toLineType(raw.type, raw.title ?? "");
    return {
        id: raw.id,
        contractId: raw.contractId ?? "",
        clientName: raw.clientName ?? "",
        accountManager: raw.accountManager ?? "",
        plannerLineId: raw.plannerLineId ?? null,
        addendumVersion: raw.addendumVersion ?? 0,
        type,
        title: raw.title ?? "",
        channel: raw.channel ?? "",
        month: raw.month ?? "",
        phaseKey: raw.phaseKey ?? "",
        phaseName: raw.phaseName ?? "",
        dueDate: raw.dueDate ?? "",
        defaultDueDate: raw.defaultDueDate ?? raw.dueDate ?? "",
        plannedDate: raw.plannedDate ?? "",
        adjustedBy: raw.adjustedBy ?? "",
        adjustedAt: raw.adjustedAt ?? null,
        status: raw.status && isTaskStatus(raw.status) ? raw.status : "not_started",
        split: (raw.split ?? DEFAULT_SPLIT[type].map((s) => ({ ...s, member: "" }))).map((s) => ({
            seat: toSeat(s.seat) ?? "am",
            member: s.member ?? "",
            pct: Number(s.pct) || 0,
            hours: Math.max(0, Math.round((Number((s as Partial<WorkShare>).hours) || 0) * 4) / 4),
        })),
        approver: raw.approver && isApprover(raw.approver) ? raw.approver : "am",
        milestone: raw.milestone ?? false,
        linked: raw.linked ?? null,
        startedAt: raw.startedAt ?? null,
        submittedAt: raw.submittedAt ?? null,
        submission: { url: "", note: "", ...(raw.submission ?? {}) },
        review: { decision: null, note: "", by: "", at: null, ...(raw.review ?? {}) },
        completedAt: raw.completedAt ?? null,
        notes: raw.notes ?? "",
        waitingOn: normalizeWaitingOn(raw.waitingOn),
        waitingSince: normalizeWaitingOn(raw.waitingOn) ? (raw.waitingSince ?? null) : null,
        createdAt: raw.createdAt ?? now,
        updatedAt: raw.updatedAt ?? now,
    };
}

export type CreateWorkInput = {
    contractId: string;
    clientName: string;
    accountManager?: string;
    plannerLineId?: string | null;
    addendumVersion?: number;
    type: LineType;
    title: string;
    channel?: string;
    month: string;
    phaseKey?: string;
    phaseName?: string;
    dueDate: string;
    split?: WorkShare[];
    approver?: Approver;
    milestone?: boolean;
    linked?: LinkedItem | null;
    notes?: string;
};

export function buildWork(input: CreateWorkInput): Work {
    const now = new Date().toISOString();
    return normalizeWork({
        id: randomUUID(),
        contractId: input.contractId,
        clientName: input.clientName,
        accountManager: input.accountManager ?? "",
        plannerLineId: input.plannerLineId ?? null,
        addendumVersion: input.addendumVersion ?? 0,
        type: input.type,
        title: input.title,
        channel: input.channel ?? "",
        month: input.month,
        phaseKey: input.phaseKey ?? "",
        phaseName: input.phaseName ?? "",
        dueDate: input.dueDate,
        defaultDueDate: input.dueDate,
        split: input.split,
        approver: input.approver ?? "am",
        milestone: input.milestone ?? false,
        linked: input.linked ?? null,
        notes: input.notes ?? "",
        createdAt: now,
        updatedAt: now,
    });
}

/** Open first (overdue soonest), then by due date, then title. */
export function sortWorks(list: Work[]): Work[] {
    return list.sort(
        (a, b) =>
            (a.status === "completed" ? 1 : 0) - (b.status === "completed" ? 1 : 0) ||
            (a.dueDate || "9999").localeCompare(b.dueDate || "9999") ||
            a.title.localeCompare(b.title),
    );
}

async function ensureDir() {
    await fs.mkdir(DIR, { recursive: true });
}

function fileFor(id: string) {
    return path.join(DIR, `${id}.json`);
}

async function writeWork(w: Work): Promise<Work> {
    await ensureDir();
    await fs.writeFile(fileFor(w.id), JSON.stringify(w, null, 2), "utf8");
    return w;
}

export async function createWork(input: CreateWorkInput): Promise<Work> {
    return writeWork(buildWork(input));
}

export async function listWorks(): Promise<Work[]> {
    await ensureDir();
    const entries = await fs.readdir(DIR);
    const out: Work[] = [];
    for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const raw = await fs.readFile(path.join(DIR, entry), "utf8");
        const parsed = JSON.parse(raw) as Partial<Work> & { id: string; tasks?: unknown };
        // Records from the old chain-of-tasks shape have no `title`; skip them.
        if (!parsed.title && Array.isArray(parsed.tasks)) continue;
        out.push(normalizeWork(parsed));
    }
    return sortWorks(out);
}

export async function getWorkById(id: string): Promise<Work | null> {
    try {
        const raw = await fs.readFile(fileFor(id), "utf8");
        return normalizeWork(JSON.parse(raw));
    } catch {
        return null;
    }
}

export type WorkPatch = Partial<Omit<Work, "id" | "createdAt">>;

export async function updateWork(id: string, patch: WorkPatch): Promise<Work> {
    const existing = await getWorkById(id);
    if (!existing) throw new Error(`Work not found: ${id}`);
    return writeWork(normalizeWork({ ...existing, ...patch, id, updatedAt: new Date().toISOString() }));
}

export async function deleteWork(id: string): Promise<void> {
    try {
        await fs.unlink(fileFor(id));
    } catch {
        // already gone
    }
}
