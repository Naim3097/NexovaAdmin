/**
 * Project helpers — pure functions shared by the project pages, the client
 * pages and the Management tabs. No I/O. (The code keeps the word "contract"
 * for the project record; people read "project".)
 *
 * Client → Project → Work. A client "has a job" when it has an active
 * project; the work (tasks, content, campaigns) hangs off the project via
 * `contractId`, and invoices bill it.
 */
import type { Contract } from "@/lib/data/contracts";
import type { Invoice } from "@/lib/data/invoices";
import type { Work } from "@/lib/data/works";
import type { ContentPost } from "@/lib/data/content";
import type { Campaign } from "@/lib/data/campaigns";
import { isOpen, isOverdue } from "@/lib/works/helpers";

export const CONTRACT_ENDING_SOON_DAYS = 30;

export function todayKey(): string {
    return new Date().toISOString().slice(0, 10);
}

function daysBetween(fromYmd: string, toYmd: string): number {
    return Math.round(
        (Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / 86_400_000,
    );
}

export function isActiveContract(c: Contract): boolean {
    return c.status === "active";
}

/** Active project whose end date has passed. */
export function hasEnded(c: Contract, today: string): boolean {
    return c.status === "active" && Boolean(c.endDate) && c.endDate < today;
}

/** Days until the end date (null when open-ended, ended, or not active). */
export function endsInDays(c: Contract, today: string): number | null {
    if (c.status !== "active" || !c.endDate || c.endDate < today) return null;
    return daysBetween(today, c.endDate);
}

export function endedDaysAgo(c: Contract, today: string): number | null {
    return hasEnded(c, today) ? daysBetween(c.endDate, today) : null;
}

export function hasTerms(c: Contract): boolean {
    return Boolean(c.reference || c.valueMyr || c.fileUrl);
}

/** YYYY-MM list from the project's start month to its end (or this month). */
export function monthsInSpan(c: Contract, today: string): string[] {
    const start = (c.startDate || today).slice(0, 7);
    // Never run past this month for open-ended projects, but do include
    // future months for a fixed-term one so the invoice plan is visible.
    const end = c.endDate ? c.endDate.slice(0, 7) : today.slice(0, 7);
    const [sy, sm] = start.split("-").map(Number);
    const [ey, em] = end.split("-").map(Number);
    const out: string[] = [];
    let y = sy;
    let m = sm;
    while (y < ey || (y === ey && m <= em)) {
        out.push(`${y}-${String(m).padStart(2, "0")}`);
        m++;
        if (m > 12) {
            m = 1;
            y++;
        }
        if (out.length > 36) break; // safety
    }
    return out;
}

export function invoicesFor(c: Contract, invoices: Invoice[]): Invoice[] {
    return invoices.filter((i) => i.contractId === c.id && i.status !== "void");
}

export function invoiceForMonth(c: Contract, invoices: Invoice[], month: string): Invoice | undefined {
    return invoicesFor(c, invoices).find((i) => i.issueDate.startsWith(month));
}

export type SetupCheck = {
    key: "terms" | "signed" | "invoice";
    label: string;
    ok: boolean;
    detail: string;
    /** For invoice checks: the month in question. */
    month?: string;
    /** Only gaps that are actionable now (past / current months). */
    urgent: boolean;
};

/** The mandatory setup: terms on file, signed, and an invoice for each month. */
export function setupChecklist(c: Contract, invoices: Invoice[], today: string): SetupCheck[] {
    const checks: SetupCheck[] = [];
    const terms = hasTerms(c);
    checks.push({
        key: "terms",
        label: "Terms recorded",
        ok: terms,
        detail: terms
            ? `${c.reference || "ref —"}${c.valueMyr ? ` · RM ${c.valueMyr.toLocaleString()}` : ""}`
            : "No reference, value or document yet",
        urgent: c.status === "active",
    });
    checks.push({
        key: "signed",
        label: "Signed",
        ok: Boolean(c.signedAt),
        detail: c.signedAt
            ? `Signed ${c.signedAt}${c.signedBy ? ` by ${c.signedBy}` : ""}`
            : "Not signed by the client",
        urgent: c.status === "active" && Boolean(c.startDate) && c.startDate <= today,
    });
    if (c.billing.cadence === "monthly") {
        const thisMonth = today.slice(0, 7);
        for (const month of monthsInSpan(c, today)) {
            const inv = invoiceForMonth(c, invoices, month);
            checks.push({
                key: "invoice",
                label: `Invoice ${month}`,
                ok: Boolean(inv),
                detail: inv
                    ? `${inv.number} · ${inv.status}${inv.status === "sent" && inv.dueDate < today ? " · OVERDUE" : ""}`
                    : "Not yet raised",
                month,
                urgent: !inv && month <= thisMonth && c.status === "active",
            });
        }
    } else {
        const linked = invoicesFor(c, invoices);
        checks.push({
            key: "invoice",
            label: "Invoice raised",
            ok: linked.length > 0,
            detail: linked.length
                ? linked.map((i) => `${i.number} · ${i.status}`).join(" · ")
                : "No invoice linked to this project yet",
            urgent: linked.length === 0 && c.status === "active",
        });
    }
    return checks;
}

export function urgentGaps(c: Contract, invoices: Invoice[], today: string): SetupCheck[] {
    return setupChecklist(c, invoices, today).filter((x) => !x.ok && x.urgent);
}

/** Short label for a failing setup check, for badges. */
export function gapLabel(g: SetupCheck): string {
    if (g.key === "terms") return "No terms";
    if (g.key === "signed") return "Unsigned";
    return `${g.label} missing`;
}

// ---------------------------------------------------------------------------
// Work under a project
// ---------------------------------------------------------------------------

export type ContractWorks = {
    /** The project's tasks. */
    works: Work[];
    content: ContentPost[];
    campaigns: Campaign[];
};

export function worksFor(
    c: Contract,
    all: { works: Work[]; content: ContentPost[]; campaigns: Campaign[] },
): ContractWorks {
    return {
        works: all.works.filter((w) => w.contractId === c.id),
        content: all.content.filter((x) => x.contractId === c.id),
        campaigns: all.campaigns.filter((x) => x.contractId === c.id),
    };
}

const OPEN_CONTENT = new Set(["idea", "draft", "review", "scheduled"]);
const LIVE_CAMPAIGN = new Set(["planning", "live"]);

export type WorkSummary = {
    tasks: number;
    tasksDone: number;
    openTasks: number;
    /** Open tasks past their due date. */
    overdueTasks: number;
    content: number;
    openContent: number;
    campaigns: number;
    liveCampaigns: number;
    /** Everything still moving: open tasks + open content + live campaigns. */
    openItems: number;
};

export function summarizeWorks(w: ContractWorks, today: string): WorkSummary {
    const openTasks = w.works.filter(isOpen);
    const openContent = w.content.filter((x) => OPEN_CONTENT.has(x.status));
    const liveCampaigns = w.campaigns.filter((x) => LIVE_CAMPAIGN.has(x.status));
    return {
        tasks: w.works.length,
        tasksDone: w.works.length - openTasks.length,
        openTasks: openTasks.length,
        overdueTasks: openTasks.filter((x) => isOverdue(x, today)).length,
        content: w.content.length,
        openContent: openContent.length,
        campaigns: w.campaigns.length,
        liveCampaigns: liveCampaigns.length,
        openItems: openTasks.length + openContent.length + liveCampaigns.length,
    };
}

// ---------------------------------------------------------------------------
// Does this client have a job?
// ---------------------------------------------------------------------------

export type JobState = "active" | "unsigned" | "ending" | "ended" | "draft" | "none";

export type JobStatus = {
    state: JobState;
    label: string;
    tone: "good" | "warn" | "bad" | "neutral";
    /** Active projects for this client. */
    active: Contract[];
    /** All non-cancelled projects for this client. */
    all: Contract[];
};

/** One line per client: do we have a job with them, and is it in order? */
export function clientJobStatus(clientName: string, contracts: Contract[], today: string): JobStatus {
    const all = contracts.filter((c) => c.clientName === clientName && c.status !== "cancelled");
    const active = all.filter((c) => c.status === "active");
    const base = { active, all };
    if (active.length === 0) {
        if (all.some((c) => c.status === "draft")) {
            return { ...base, state: "draft", label: "Draft project", tone: "warn" };
        }
        return { ...base, state: "none", label: "No project", tone: "bad" };
    }
    if (active.some((c) => hasEnded(c, today))) {
        return { ...base, state: "ended", label: "Project ended", tone: "bad" };
    }
    if (active.some((c) => !c.signedAt)) {
        return { ...base, state: "unsigned", label: "Contract unsigned", tone: "bad" };
    }
    const soon = active
        .map((c) => endsInDays(c, today))
        .filter((d): d is number => d !== null && d <= CONTRACT_ENDING_SOON_DAYS);
    if (soon.length > 0) {
        return { ...base, state: "ending", label: `Ends in ${Math.min(...soon)}d`, tone: "warn" };
    }
    return {
        ...base,
        state: "active",
        label: active.length === 1 ? "Active project" : `${active.length} active projects`,
        tone: "good",
    };
}
