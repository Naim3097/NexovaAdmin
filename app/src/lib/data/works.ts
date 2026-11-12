/**
 * Works data adapter. Dispatches via `isSupabaseEnabled("works")`.
 *
 * Supabase keeps the responsibility split, the linked item, the submission
 * and the review as JSONB columns on the work row; everything else is a
 * plain column, so the adapter is a thin row ↔ model mapping.
 */
import { createServiceClient } from "@/lib/supabase/server";
import type { WorkRow, Database } from "@/lib/supabase/types";
import { isSupabaseEnabled } from "@/lib/data/flag";
import * as dev from "@/lib/dev-store/works";

export { LINKED_KINDS, TASK_STATUSES, buildWork, isTaskStatus, normalizeWork, sortWorks } from "@/lib/dev-store/works";
export type { CreateWorkInput, LinkedItem, LinkedKind, TaskStatus, Work, WorkPatch, WorkShare } from "@/lib/dev-store/works";

type Work = dev.Work;
type Insert = Database["public"]["Tables"]["works"]["Insert"];
type Update = Database["public"]["Tables"]["works"]["Update"];

const TABLE = "works" as const;

function rowToWork(row: WorkRow): Work {
    return dev.normalizeWork({
        id: row.id,
        contractId: row.contract_id,
        clientName: row.client_name,
        accountManager: row.account_manager,
        plannerLineId: row.planner_line_id,
        addendumVersion: row.addendum_version,
        type: row.type as Work["type"],
        title: row.title,
        channel: row.channel,
        month: row.month,
        phaseKey: row.phase_key,
        phaseName: row.phase_name,
        dueDate: row.due_date ?? "",
        defaultDueDate: row.default_due_date ?? "",
        plannedDate: row.planned_date ?? "",
        adjustedBy: row.adjusted_by,
        adjustedAt: row.adjusted_at,
        status: row.status as Work["status"],
        split: row.split as Work["split"],
        approver: row.approver as Work["approver"],
        milestone: row.milestone,
        linked: row.linked as Work["linked"],
        startedAt: row.started_at,
        submittedAt: row.submitted_at,
        submission: row.submission as Work["submission"],
        review: row.review as Work["review"],
        completedAt: row.completed_at,
        notes: row.notes,
        waitingOn: row.waiting_on as Work["waitingOn"],
        waitingSince: row.waiting_since,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    });
}

function toInsert(w: Work): Insert {
    return {
        id: w.id,
        contract_id: w.contractId,
        client_name: w.clientName,
        account_manager: w.accountManager,
        planner_line_id: w.plannerLineId,
        addendum_version: w.addendumVersion,
        type: w.type,
        title: w.title,
        channel: w.channel,
        month: w.month,
        phase_key: w.phaseKey,
        phase_name: w.phaseName,
        due_date: w.dueDate || null,
        default_due_date: w.defaultDueDate || null,
        planned_date: w.plannedDate || null,
        adjusted_by: w.adjustedBy,
        adjusted_at: w.adjustedAt,
        status: w.status,
        split: w.split,
        approver: w.approver,
        milestone: w.milestone,
        linked: w.linked,
        started_at: w.startedAt,
        submitted_at: w.submittedAt,
        submission: w.submission,
        review: w.review,
        completed_at: w.completedAt,
        notes: w.notes,
        waiting_on: w.waitingOn,
        waiting_since: w.waitingSince,
        created_at: w.createdAt,
        updated_at: w.updatedAt,
    };
}

function patchToUpdate(patch: dev.WorkPatch): Update {
    const out: Update = {};
    if (patch.contractId !== undefined) out.contract_id = patch.contractId;
    if (patch.clientName !== undefined) out.client_name = patch.clientName;
    if (patch.accountManager !== undefined) out.account_manager = patch.accountManager;
    if (patch.plannerLineId !== undefined) out.planner_line_id = patch.plannerLineId;
    if (patch.addendumVersion !== undefined) out.addendum_version = patch.addendumVersion;
    if (patch.type !== undefined) out.type = patch.type;
    if (patch.title !== undefined) out.title = patch.title;
    if (patch.channel !== undefined) out.channel = patch.channel;
    if (patch.month !== undefined) out.month = patch.month;
    if (patch.phaseKey !== undefined) out.phase_key = patch.phaseKey;
    if (patch.phaseName !== undefined) out.phase_name = patch.phaseName;
    if (patch.dueDate !== undefined) out.due_date = patch.dueDate || null;
    if (patch.defaultDueDate !== undefined) out.default_due_date = patch.defaultDueDate || null;
    if (patch.plannedDate !== undefined) out.planned_date = patch.plannedDate || null;
    if (patch.adjustedBy !== undefined) out.adjusted_by = patch.adjustedBy;
    if (patch.adjustedAt !== undefined) out.adjusted_at = patch.adjustedAt;
    if (patch.status !== undefined) out.status = patch.status;
    if (patch.split !== undefined) out.split = patch.split;
    if (patch.approver !== undefined) out.approver = patch.approver;
    if (patch.milestone !== undefined) out.milestone = patch.milestone;
    if (patch.linked !== undefined) out.linked = patch.linked;
    if (patch.startedAt !== undefined) out.started_at = patch.startedAt;
    if (patch.submittedAt !== undefined) out.submitted_at = patch.submittedAt;
    if (patch.submission !== undefined) out.submission = patch.submission;
    if (patch.review !== undefined) out.review = patch.review;
    if (patch.completedAt !== undefined) out.completed_at = patch.completedAt;
    if (patch.notes !== undefined) out.notes = patch.notes;
    if (patch.waitingOn !== undefined) out.waiting_on = patch.waitingOn;
    if (patch.waitingSince !== undefined) out.waiting_since = patch.waitingSince;
    out.updated_at = patch.updatedAt ?? new Date().toISOString();
    return out;
}

export async function createWork(input: dev.CreateWorkInput): Promise<Work> {
    if (!isSupabaseEnabled("works")) return dev.createWork(input);
    const w = dev.buildWork(input);
    const sb = createServiceClient();
    const { data, error } = await sb.from(TABLE).insert(toInsert(w)).select("*").single();
    if (error) throw new Error(`createWork: ${error.message}`);
    return rowToWork(data as WorkRow);
}

export async function listWorks(): Promise<Work[]> {
    if (!isSupabaseEnabled("works")) return dev.listWorks();
    const sb = createServiceClient();
    const { data, error } = await sb.from(TABLE).select("*");
    if (error) throw new Error(`listWorks: ${error.message}`);
    return dev.sortWorks((data as WorkRow[]).map(rowToWork));
}

export async function getWorkById(id: string): Promise<Work | null> {
    if (!isSupabaseEnabled("works")) return dev.getWorkById(id);
    const sb = createServiceClient();
    const { data, error } = await sb.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`getWorkById: ${error.message}`);
    return data ? rowToWork(data as WorkRow) : null;
}

export async function updateWork(id: string, patch: dev.WorkPatch): Promise<Work> {
    if (!isSupabaseEnabled("works")) return dev.updateWork(id, patch);
    const sb = createServiceClient();
    const { data, error } = await sb.from(TABLE).update(patchToUpdate(patch)).eq("id", id).select("*").single();
    if (error) throw new Error(`updateWork: ${error.message}`);
    return rowToWork(data as WorkRow);
}

export async function deleteWork(id: string): Promise<void> {
    if (!isSupabaseEnabled("works")) return dev.deleteWork(id);
    const sb = createServiceClient();
    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`deleteWork: ${error.message}`);
}
