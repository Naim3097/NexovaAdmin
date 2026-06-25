"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
    createSprintTask,
    deleteSprintTask,
    getSprintTaskById,
    updateSprintTask,
} from "@/lib/data/sprint-tasks";
import { listTeamMembers } from "@/lib/data/team";
import { generateJSON } from "@/lib/ai/generate";

export type ActionResult = { ok: boolean; message?: string };

function clean(v: FormDataEntryValue | null): string {
    return String(v ?? "").trim();
}

export async function createSprintTaskAction(formData: FormData) {
    const title = clean(formData.get("title"));
    if (!title) return;
    await createSprintTask({
        title,
        pic: clean(formData.get("pic")) === "none" ? "" : clean(formData.get("pic")),
        details: clean(formData.get("details")),
        // empty → data layer applies the default (today + 3 days)
        deadline: clean(formData.get("deadline")) || undefined,
    });
    revalidatePath("/tasks");
}

export async function toggleSprintTaskAction(formData: FormData) {
    const id = clean(formData.get("id"));
    if (!id) return;
    const task = await getSprintTaskById(id);
    if (!task) return;
    const done = task.status !== "done";
    await updateSprintTask(id, {
        status: done ? "done" : "open",
        completedAt: done ? new Date().toISOString() : null,
    });
    revalidatePath("/tasks");
}

export async function updateSprintTaskAction(formData: FormData) {
    const id = clean(formData.get("id"));
    if (!id) return;
    const patch: { title?: string; pic?: string; deadline?: string } = {};
    const title = clean(formData.get("title"));
    if (title) patch.title = title;
    const picRaw = formData.get("pic");
    if (picRaw !== null) {
        const p = clean(picRaw);
        patch.pic = p === "none" ? "" : p;
    }
    const dueRaw = formData.get("deadline");
    if (dueRaw !== null) {
        const d = clean(dueRaw);
        if (d) patch.deadline = d; // don't allow blanking the deadline
    }
    await updateSprintTask(id, patch);
    revalidatePath("/tasks");
}

export async function deleteSprintTaskAction(formData: FormData) {
    const id = clean(formData.get("id"));
    if (!id) return;
    await deleteSprintTask(id);
    revalidatePath("/tasks");
}

// --- AI dump → tasks per PIC ----------------------------------------------

const AiTasksSchema = z.object({
    tasks: z
        .array(
            z.object({
                title: z.string().min(1),
                pic: z.string().default(""),
                deadline: z.string().optional(), // YYYY-MM-DD
            }),
        )
        .max(40),
});

/**
 * Parse a free-text brain-dump into discrete sprint tasks, one per line of work,
 * matching PICs to team members and pulling out any mentioned deadline. Creates
 * the tasks (unspecified deadline → today + 3 days, applied in the data layer).
 */
export async function aiDumpTasksAction(
    _prev: ActionResult,
    formData: FormData,
): Promise<ActionResult> {
    const dump = clean(formData.get("dump"));
    if (!dump) return { ok: false, message: "Paste some work to parse first." };

    const team = (await listTeamMembers()).filter((m) => m.active);
    const names = team.map((m) => `${m.name} (${m.role})`).join(", ") || "none";
    const today = new Date().toISOString().slice(0, 10);

    let parsed: z.infer<typeof AiTasksSchema>;
    try {
        parsed = await generateJSON(
            `Split this work brain-dump into discrete, single-owner tasks.
For each task return:
- "title": a concise actionable task name
- "pic": the person in charge — MATCH to one of these team members by name (return just the name, no role), or "" if unclear. Team: ${names}
- "deadline": YYYY-MM-DD if a date or timeframe is mentioned (today is ${today}); omit if none.

Brain-dump:
${dump}

Return JSON: {"tasks":[{"title":"...","pic":"...","deadline":"YYYY-MM-DD"}]}`,
            AiTasksSchema,
        );
    } catch (e) {
        return { ok: false, message: `AI parse failed: ${(e as Error).message}` };
    }

    const validNames = new Set(team.map((m) => m.name.toLowerCase()));
    let created = 0;
    for (const t of parsed.tasks) {
        const pic = validNames.has(t.pic.trim().toLowerCase()) ? t.pic.trim() : "";
        const deadline =
            t.deadline && /^\d{4}-\d{2}-\d{2}$/.test(t.deadline)
                ? t.deadline
                : undefined;
        await createSprintTask({ title: t.title.trim(), pic, deadline });
        created++;
    }

    revalidatePath("/tasks");
    return { ok: true, message: `Created ${created} task${created === 1 ? "" : "s"}.` };
}
