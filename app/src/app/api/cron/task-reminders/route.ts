/**
 * Daily cron — ping the PIC 1 day before a sprint task's deadline.
 *
 * Vercel Cron calls this once a day (see app/vercel.json). It finds open tasks
 * whose deadline is TOMORROW and that haven't been reminded for that date yet,
 * posts a Telegram alert (via notify → team chat, tagging the PIC by name), and
 * stamps `remindedFor` so re-runs that day don't double-ping.
 *
 * Auth: when CRON_SECRET is set, the caller must send
 *   Authorization: Bearer <CRON_SECRET>
 * which Vercel Cron does automatically. Unset → allowed (dev only).
 */
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { listTasksDueOn, updateSprintTask } from "@/lib/data/sprint-tasks";
import { notify } from "@/lib/data/notifications";

export const dynamic = "force-dynamic";

function authorised(req: NextRequest): boolean {
    if (!env.CRON_SECRET) return true; // not configured (dev)
    const header = req.headers.get("authorization") ?? "";
    return header === `Bearer ${env.CRON_SECRET}`;
}

async function run(req: NextRequest) {
    if (!authorised(req)) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
    const due = await listTasksDueOn(tomorrow);

    let pinged = 0;
    for (const t of due) {
        await notify({
            kind: "task_due_soon",
            title: `Task due tomorrow: ${t.title}`,
            body: `PIC: ${t.pic || "unassigned"} · due ${t.deadline}`,
            link: "/tasks",
        });
        await updateSprintTask(t.id, { remindedFor: tomorrow });
        pinged++;
    }

    return NextResponse.json({ ok: true, date: tomorrow, pinged });
}

export async function GET(req: NextRequest) {
    return run(req);
}
// Allow POST too, for external schedulers that prefer it.
export async function POST(req: NextRequest) {
    return run(req);
}
