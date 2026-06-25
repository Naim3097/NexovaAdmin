/**
 * DEV-ONLY local file store for sprint tasks (lightweight single-layer tasks).
 * Replaced by Supabase `sprint_tasks` once provisioned.
 *
 * A sprint task = a quick unit of work with a PIC and a deadline. If no deadline
 * is given it defaults to today + 3 days. A daily cron pings the PIC 1 day before.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = path.join(process.cwd(), ".dev-data");
const TASKS_DIR = path.join(ROOT, "sprint-tasks");

export const SPRINT_TASK_STATUSES = ["open", "done"] as const;
export type SprintTaskStatus = (typeof SPRINT_TASK_STATUSES)[number];

export type SprintTask = {
    id: string;
    title: string;
    /** PIC name (matches a team_members.name). Empty = unassigned. */
    pic: string;
    details: string;
    deadline: string; // YYYY-MM-DD
    status: SprintTaskStatus;
    /** Date the "due tomorrow" ping was sent (idempotency). null = not reminded. */
    remindedFor: string | null;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
};

/** Deadline N days from today (default 3) as YYYY-MM-DD. */
export function defaultDeadline(days = 3): string {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
}

async function ensureDir() {
    await fs.mkdir(TASKS_DIR, { recursive: true });
}
function fileFor(id: string) {
    return path.join(TASKS_DIR, `${id}.json`);
}

export async function createSprintTask(input: {
    title: string;
    pic?: string;
    details?: string;
    deadline?: string;
}): Promise<SprintTask> {
    await ensureDir();
    const now = new Date().toISOString();
    const task: SprintTask = {
        id: randomUUID(),
        title: input.title,
        pic: input.pic ?? "",
        details: input.details ?? "",
        deadline: input.deadline || defaultDeadline(),
        status: "open",
        remindedFor: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
    };
    await fs.writeFile(fileFor(task.id), JSON.stringify(task, null, 2), "utf8");
    return task;
}

export async function listSprintTasks(): Promise<SprintTask[]> {
    await ensureDir();
    const entries = await fs.readdir(TASKS_DIR);
    const out: SprintTask[] = [];
    for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const raw = await fs.readFile(path.join(TASKS_DIR, entry), "utf8");
        out.push(JSON.parse(raw) as SprintTask);
    }
    // Open first, then by deadline ascending.
    return out.sort((a, b) => {
        if (a.status !== b.status) return a.status === "open" ? -1 : 1;
        return a.deadline.localeCompare(b.deadline);
    });
}

export async function getSprintTaskById(id: string): Promise<SprintTask | null> {
    try {
        const raw = await fs.readFile(fileFor(id), "utf8");
        return JSON.parse(raw) as SprintTask;
    } catch {
        return null;
    }
}

export async function updateSprintTask(
    id: string,
    patch: Partial<Omit<SprintTask, "id" | "createdAt">>,
): Promise<SprintTask> {
    const existing = await getSprintTaskById(id);
    if (!existing) throw new Error(`Sprint task ${id} not found`);
    const updated: SprintTask = {
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(fileFor(id), JSON.stringify(updated, null, 2), "utf8");
    return updated;
}

export async function deleteSprintTask(id: string): Promise<void> {
    try {
        await fs.unlink(fileFor(id));
    } catch {
        // ignore
    }
}
