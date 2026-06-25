/**
 * Sprint tasks data adapter. Dispatches via `isSupabaseEnabled("tasks")`.
 */
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import type { Database, SprintTaskRow } from "@/lib/supabase/types";
import { isSupabaseEnabled } from "@/lib/data/flag";
import * as devTasks from "@/lib/dev-store/sprint-tasks";

export { SPRINT_TASK_STATUSES, defaultDeadline } from "@/lib/dev-store/sprint-tasks";
export type { SprintTask, SprintTaskStatus } from "@/lib/dev-store/sprint-tasks";

type SprintTask = devTasks.SprintTask;
type UpdatePatch = Partial<Omit<SprintTask, "id" | "createdAt">>;

type TaskInsert = Database["public"]["Tables"]["sprint_tasks"]["Insert"];
type TaskUpdate = Database["public"]["Tables"]["sprint_tasks"]["Update"];

const TABLE = "sprint_tasks" as const;

function rowToTask(row: SprintTaskRow): SprintTask {
    return {
        id: row.id,
        title: row.title,
        pic: row.pic ?? "",
        details: row.details ?? "",
        deadline: row.deadline,
        status: row.status as SprintTask["status"],
        remindedFor: row.reminded_for ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at ?? null,
    };
}

function taskToInsert(t: SprintTask): TaskInsert {
    return {
        id: t.id,
        title: t.title,
        pic: t.pic,
        details: t.details,
        deadline: t.deadline,
        status: t.status,
        reminded_for: t.remindedFor,
        created_at: t.createdAt,
        updated_at: t.updatedAt,
        completed_at: t.completedAt,
    };
}

function patchToUpdate(patch: UpdatePatch): TaskUpdate {
    const out: TaskUpdate = {};
    if (patch.title !== undefined) out.title = patch.title;
    if (patch.pic !== undefined) out.pic = patch.pic;
    if (patch.details !== undefined) out.details = patch.details;
    if (patch.deadline !== undefined) out.deadline = patch.deadline;
    if (patch.status !== undefined) out.status = patch.status;
    if (patch.remindedFor !== undefined) out.reminded_for = patch.remindedFor;
    if (patch.completedAt !== undefined) out.completed_at = patch.completedAt;
    if (patch.updatedAt !== undefined) out.updated_at = patch.updatedAt;
    return out;
}

export async function createSprintTask(input: {
    title: string;
    pic?: string;
    details?: string;
    deadline?: string;
}): Promise<SprintTask> {
    if (!isSupabaseEnabled("tasks")) return devTasks.createSprintTask(input);
    const now = new Date().toISOString();
    const task: SprintTask = {
        id: randomUUID(),
        title: input.title,
        pic: input.pic ?? "",
        details: input.details ?? "",
        deadline: input.deadline || devTasks.defaultDeadline(),
        status: "open",
        remindedFor: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
    };
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .insert(taskToInsert(task))
        .select("*")
        .single();
    if (error) throw new Error(`createSprintTask: ${error.message}`);
    return rowToTask(data as SprintTaskRow);
}

export async function listSprintTasks(): Promise<SprintTask[]> {
    if (!isSupabaseEnabled("tasks")) return devTasks.listSprintTasks();
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .order("status", { ascending: true })
        .order("deadline", { ascending: true });
    if (error) throw new Error(`listSprintTasks: ${error.message}`);
    return (data as SprintTaskRow[]).map(rowToTask);
}

export async function getSprintTaskById(id: string): Promise<SprintTask | null> {
    if (!isSupabaseEnabled("tasks")) return devTasks.getSprintTaskById(id);
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("id", id)
        .maybeSingle();
    if (error) throw new Error(`getSprintTaskById: ${error.message}`);
    return data ? rowToTask(data as SprintTaskRow) : null;
}

export async function updateSprintTask(
    id: string,
    patch: UpdatePatch,
): Promise<SprintTask> {
    if (!isSupabaseEnabled("tasks")) return devTasks.updateSprintTask(id, patch);
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .update(patchToUpdate(patch))
        .eq("id", id)
        .select("*")
        .single();
    if (error) throw new Error(`updateSprintTask: ${error.message}`);
    return rowToTask(data as SprintTaskRow);
}

export async function deleteSprintTask(id: string): Promise<void> {
    if (!isSupabaseEnabled("tasks")) return devTasks.deleteSprintTask(id);
    const sb = createServiceClient();
    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`deleteSprintTask: ${error.message}`);
}

/** Tasks due exactly on `date` (YYYY-MM-DD), still open, not yet reminded for it. */
export async function listTasksDueOn(date: string): Promise<SprintTask[]> {
    const all = await listSprintTasks();
    return all.filter(
        (t) => t.status === "open" && t.deadline === date && t.remindedFor !== date,
    );
}
