/**
 * Daily cron — ping the PIC 1 day before a sprint task's deadline, and the
 * people on a contract task the day before it is due, on the day, and the
 * first day it is overdue.
 *
 * Vercel Cron calls this once a day (see app/vercel.json). It finds open sprint
 * tasks whose deadline is TOMORROW and that haven't been reminded for that date
 * yet, posts a Telegram alert (via notify → team chat, tagging the PIC by name),
 * and stamps `remindedFor` so re-runs that day don't double-ping.
 *
 * Auth: when CRON_SECRET is set, the caller must send
 *   Authorization: Bearer <CRON_SECRET>
 * which Vercel Cron does automatically. Unset → allowed (dev only).
 */
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { listTasksDueOn, updateSprintTask } from "@/lib/data/sprint-tasks";
import { listWorks } from "@/lib/data/works";
import { isOpen } from "@/lib/works/helpers";
import { listClients } from "@/lib/data/clients";
import {
    computeTotals,
    listInvoices,
    setInvoiceStatus,
} from "@/lib/data/invoices";
import { recordAudit } from "@/lib/data/audit";
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
    const yesterday = day(-1);

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

    // 2) Contract tasks. Single-day conditions (== tomorrow, == today, and
    //    == yesterday for the first overdue day) so the daily cron naturally
    //    fires each once — no dedup state on the task.
    const works = await listWorks();
    for (const w of works) {
        if (!isOpen(w) || !w.dueDate) continue;
        const when =
            w.dueDate === tomorrow
                ? "due tomorrow"
                : w.dueDate === today
                  ? "due today"
                  : w.dueDate === yesterday
                    ? "overdue"
                    : null;
        if (!when) continue;
        const people = w.split
            .map((s) => s.member)
            .filter(Boolean)
            .join(", ");
        await notify({
            kind: "task_due_soon",
            title: `${w.title} ${when} · ${w.clientName}`,
            body: `${w.phaseName ? `${w.phaseName} · ` : ""}due ${w.dueDate} · ${people || "unassigned"}${w.accountManager ? ` · AM: ${w.accountManager}` : ""}`,
            link: `/works/${w.id}`,
        });
        pinged++;
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

    // 4) Invoices past due — flip sent → overdue (once; the status change is the
    //    dedup) and ping Telegram so the collection ladder (SOP 5) starts.
    const invoices = await listInvoices();
    for (const inv of invoices) {
        if (inv.status !== "sent" || !inv.dueDate || inv.dueDate >= today) continue;
        await setInvoiceStatus(inv.id, "overdue");
        await recordAudit({
            entity: "invoice",
            entityId: inv.id,
            kind: "status",
            summary: `Status: sent → overdue (auto, due ${inv.dueDate})`,
            changes: [{ field: "status", before: "sent", after: "overdue" }],
        });
        await notify({
            kind: "invoice_overdue",
            title: `Invoice overdue: ${inv.number} — ${inv.clientName}`,
            body: `MYR ${computeTotals(inv).total.toLocaleString()} was due ${inv.dueDate}`,
            link: `/invoices/${inv.id}`,
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
