/**
 * Weekly client update — the playbook's slide-13 template, auto-drafted from
 * live data so the AM edits two lines instead of writing from scratch.
 *
 * Bucket mapping (all derived, nothing stored):
 *   Completed this week — approvals + posts in the last 7 days, plus contract
 *                         tasks completed in the last 7 days
 *   In progress         — items being revised after feedback + contract tasks
 *                         in progress
 *   Waiting for client  — drafts awaiting review (with age), contract tasks
 *                         awaiting the client's approval, sent/overdue invoices
 *   Next week           — items scheduled in the next 7 days
 *   Issues / risks      — visuals beyond the month's plan, overdue invoices,
 *                         reviews stuck > 3 days
 *
 * The content quota comes from the client's active projects (their "post"
 * deliverables), and the sign-off names the account manager(s) of those
 * projects — the client record carries neither any more.
 */
import type { ContentPost } from "@/lib/dev-store/content";
import type { Contract } from "@/lib/data/contracts";
import type { Work } from "@/lib/data/works";
import type { Invoice } from "@/lib/dev-store/invoices";
import type { Client } from "@/lib/dev-store/clients";
import { computeTotals } from "@/lib/dev-store/invoices";
import { visualsUsed } from "@/lib/data/content";
import { clientContentQuota } from "@/lib/clients/quota";

export type WeeklyUpdate = {
    clientName: string;
    /** Account manager(s) of the client's active projects, "" when none. */
    accountManager: string;
    rangeLabel: string;
    completed: string[];
    inProgress: string[];
    waitingFor: string[];
    nextWeek: string[];
    issues: string[];
};

const DAY = 24 * 60 * 60 * 1000;

function eq(a: string, b: string) {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}
function fmtDay(iso: string) {
    const d = new Date(iso.length > 10 ? iso : iso + "T00:00:00");
    return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}
function daysAgo(iso: string, now: number) {
    return Math.max(0, Math.floor((now - Date.parse(iso)) / DAY));
}

export function buildWeeklyUpdate(input: {
    client: Client;
    posts: ContentPost[];
    works: Work[];
    contracts: Contract[];
    invoices: Invoice[];
    now?: number;
}): WeeklyUpdate {
    const { client } = input;
    const now = input.now ?? Date.now();
    const weekAgo = now - 7 * DAY;
    const weekAhead = now + 7 * DAY;
    const today = new Date(now).toISOString().slice(0, 10);
    const month = today.slice(0, 7);

    const mine = input.posts.filter((p) => eq(p.clientName, client.name));
    const myContracts = input.contracts.filter((c) => eq(c.clientName, client.name));
    const contractIds = new Set(myContracts.map((c) => c.id));
    // Tasks linked to a content post are already covered by the post's own
    // review line above, so only standalone tasks are listed here.
    const myWorks = input.works.filter(
        (w) =>
            (contractIds.has(w.contractId) || eq(w.clientName, client.name)) &&
            w.linked?.kind !== "content",
    );
    const myInvoices = input.invoices.filter((i) => eq(i.clientName, client.name));

    // A task line reads "<title> (<contract>)" only when the client has more
    // than one contract — otherwise the contract name is just noise.
    const contractName = new Map(myContracts.map((c) => [c.id, c.name]));
    const taskLabel = (w: Work) =>
        myContracts.length > 1 && contractName.get(w.contractId)
            ? `${w.title} (${contractName.get(w.contractId)})`
            : w.title;

    // Completed this week — approvals, posts and contract tasks inside the window.
    const completed: string[] = [];
    for (const p of mine) {
        if (p.approvedAt && Date.parse(p.approvedAt) >= weekAgo) {
            completed.push(`${p.title} — approved ${fmtDay(p.approvedAt)}`);
        } else if (p.postedAt && Date.parse(p.postedAt) >= weekAgo) {
            completed.push(`${p.title} — posted ${fmtDay(p.postedAt)}`);
        }
    }
    for (const w of myWorks) {
        if (w.status === "completed" && w.completedAt && Date.parse(w.completedAt) >= weekAgo) {
            completed.push(`${taskLabel(w)} — completed ${fmtDay(w.completedAt)}`);
        }
    }

    // In progress — revising after feedback, plus every contract task in progress.
    const inProgress: string[] = [];
    for (const p of mine) {
        if (p.reviewStatus === "changes_requested") {
            inProgress.push(
                `${p.title} — revising (${p.draftNumber || "draft"} after your feedback)`,
            );
        }
    }
    for (const w of myWorks) {
        if (w.status === "in_progress") {
            inProgress.push(
                `${taskLabel(w)} — ${w.phaseName || "in progress"}${w.dueDate ? `, due ${fmtDay(w.dueDate)}` : ""}`,
            );
        }
    }

    // Waiting for the client — reviews in their court, tasks awaiting their
    // approval, and unpaid invoices.
    const waitingFor: string[] = [];
    for (const p of mine) {
        if (p.reviewStatus === "awaiting_client") {
            const lastDraft = p.drafts[p.drafts.length - 1];
            const age = lastDraft ? daysAgo(lastDraft.submittedAt, now) : 0;
            waitingFor.push(
                `${p.title} — your review (${p.draftNumber || "draft"} sent ${age === 0 ? "today" : `${age}d ago`})`,
            );
        }
    }
    for (const w of myWorks) {
        if (w.status === "pending_approval" && w.approver === "client") {
            const age = w.submittedAt ? daysAgo(w.submittedAt, now) : 0;
            waitingFor.push(
                `${taskLabel(w)} — awaiting your approval (sent ${age === 0 ? "today" : `${age}d ago`})`,
            );
        }
    }
    for (const i of myInvoices) {
        if (i.status === "sent" || i.status === "overdue") {
            const t = computeTotals(i);
            const overdue = i.dueDate < today;
            waitingFor.push(
                `Invoice ${i.number} — MYR ${t.total.toFixed(2)} ${overdue ? `overdue since ${fmtDay(i.dueDate)}` : `due ${fmtDay(i.dueDate)}`}`,
            );
        }
    }

    // Next week — scheduled items in the coming 7 days.
    const nextWeek: string[] = [];
    for (const p of mine) {
        if (p.status === "posted" || p.status === "archived" || !p.scheduledFor) continue;
        const ts = Date.parse(p.scheduledFor + "T00:00:00");
        if (ts >= now - DAY && ts <= weekAhead) {
            nextWeek.push(`${p.title} — scheduled ${fmtDay(p.scheduledFor)}`);
        }
    }

    // Issues / risks — visuals beyond the plan, overdue invoices, stuck reviews.
    const issues: string[] = [];
    const quota = clientContentQuota(client.name, input.contracts);
    if (quota > 0) {
        const used = visualsUsed(mine, client.name, month);
        if (used > quota) {
            issues.push(
                `${used}/${quota} visuals this month — ${used - quota} beyond the plan`,
            );
        } else if (used === quota) {
            issues.push(`Monthly plan fully used (${used}/${quota} visuals)`);
        }
    }
    const overdueCount = myInvoices.filter(
        (i) => i.status !== "paid" && i.status !== "void" && i.status !== "draft" && i.dueDate < today,
    ).length;
    if (overdueCount > 0) issues.push(`${overdueCount} invoice(s) past due`);
    for (const p of mine) {
        if (p.reviewStatus === "awaiting_client") {
            const lastDraft = p.drafts[p.drafts.length - 1];
            if (lastDraft && daysAgo(lastDraft.submittedAt, now) > 3) {
                issues.push(`${p.title} — review pending ${daysAgo(lastDraft.submittedAt, now)} days`);
            }
        }
    }

    const start = new Date(weekAgo).toLocaleDateString(undefined, { day: "numeric", month: "short" });
    const end = new Date(now).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

    const accountManagers = [
        ...new Set(
            myContracts
                .filter((c) => c.status === "active")
                .map((c) => c.accountManager.trim())
                .filter(Boolean),
        ),
    ];

    return {
        clientName: client.name,
        accountManager: accountManagers.join(" / "),
        rangeLabel: `${start} – ${end}`,
        completed,
        inProgress,
        waitingFor,
        nextWeek,
        issues,
    };
}

/**
 * WhatsApp/email-ready plain text of the update, written for the CLIENT:
 * long lists collapse to a count (nobody reads 20 identical lines), empty
 * sections say something human, and the notes section only appears when
 * there's actually something to flag.
 */
export function weeklyUpdateText(u: WeeklyUpdate): string {
    const bullets = (items: string[], empty: string) => {
        if (items.length === 0) return `• ${empty}`;
        if (items.length <= 5) return items.map((i) => `• ${i}`).join("\n");
        return [
            ...items.slice(0, 3).map((i) => `• ${i}`),
            `• …and ${items.length - 3} more`,
        ].join("\n");
    };

    // A batch of scheduled posts reads better as one line than as a wall.
    const nextWeekBlock = (() => {
        if (u.nextWeek.length === 0) return "• Nothing scheduled yet";
        if (u.nextWeek.length <= 5)
            return u.nextWeek.map((i) => `• ${i}`).join("\n");
        const firstDate = u.nextWeek[0]?.split("— scheduled ")[1];
        return `• ${u.nextWeek.length} posts lined up${firstDate ? ` — first goes out ${firstDate}` : ""}`;
    })();

    const out = [
        `*Weekly update — ${u.clientName}*`,
        `_${u.rangeLabel}${u.accountManager ? ` · ${u.accountManager}` : ""}_`,
        "",
        `*✅ Done this week*`,
        bullets(u.completed, "Nothing wrapped this week — see In progress"),
        "",
        `*🔄 In progress*`,
        bullets(u.inProgress, "Nothing in flight right now"),
        "",
        `*👀 Waiting on you*`,
        bullets(u.waitingFor, "Nothing — you're all caught up"),
        "",
        `*📅 Coming up*`,
        nextWeekBlock,
    ];
    if (u.issues.length > 0) {
        out.push("", `*⚠️ Notes*`, bullets(u.issues, ""));
    }
    return out.join("\n");
}
