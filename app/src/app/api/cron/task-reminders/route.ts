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
import { listProjects } from "@/lib/data/projects";
import { listClients } from "@/lib/data/clients";
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

    const DAY = 24 * 60 * 60 * 1000;
    const day = (offset: number) =>
        new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
    const today = day(0);
    const tomorrow = day(1);

    let pinged = 0;

    // 1) Sprint tasks due tomorrow (dedup via remindedFor).
    const due = await listTasksDueOn(tomorrow);
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

    // 2) Project stages with a PIC deadline. Single-day conditions (== tomorrow,
    //    == today) so the daily cron naturally fires each once — no dedup state.
    const projects = await listProjects();
    for (const pr of projects) {
        for (const s of pr.stages) {
            if (s.state === "done" || !s.dueDate) continue;
            if (s.dueDate === tomorrow || s.dueDate === today) {
                const when = s.dueDate === today ? "today" : "tomorrow";
                await notify({
                    kind: "task_due_soon",
                    title: `Stage due ${when}: ${s.label} — ${pr.name}`,
                    body: `PIC: ${s.assignee || "unassigned"} · ${pr.clientName}`,
                    link: `/projects/${pr.id}`,
                });
                pinged++;
            }
        }
    }

    // 3) Client package renewals — heads-up at 30 days, 7 days, and on the day.
    const clients = await listClients();
    for (const c of clients) {
        if (c.status !== "active" || !c.packageRenewsOn) continue;
        const label =
            c.packageRenewsOn === day(30)
                ? "in 30 days"
                : c.packageRenewsOn === day(7)
                  ? "in 7 days"
                  : c.packageRenewsOn === today
                    ? "TODAY"
                    : null;
        if (!label) continue;
        await notify({
            kind: "renewal_due",
            title: `Renewal ${label}: ${c.name}`,
            body: `${c.packageName || "Package"} renews ${c.packageRenewsOn}${c.accountManager ? ` · AM: ${c.accountManager}` : ""}`,
            link: `/settings/clients/${c.id}`,
        });
        pinged++;
    }

    return NextResponse.json({ ok: true, date: today, pinged });
}

export async function GET(req: NextRequest) {
    return run(req);
}
// Allow POST too, for external schedulers that prefer it.
export async function POST(req: NextRequest) {
    return run(req);
}
