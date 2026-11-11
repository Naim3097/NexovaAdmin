/**
 * My accounts — the per-contract view model and the rules behind "next
 * action". Pure functions, no I/O. The health numbers follow the contract
 * page header (shared.tsx / header.tsx) rule for rule so both screens agree.
 */
import type { Contract } from "@/lib/data/contracts";
import type { Invoice } from "@/lib/data/invoices";
import type { Work } from "@/lib/data/works";
import { invoicesFor, setupChecklist, type SetupCheck } from "@/lib/contracts/helpers";
import { emptyFilter, filterQuery, type WorkFilter } from "@/lib/works/filter";
import { daysBetween, isOpen, isOverdue, monthLabel, nextDue, nextMonth, progress, type Progress } from "@/lib/works/helpers";

const norm = (s: string) => s.trim().toLowerCase();

/** An invoice due within this many days is worth a reminder. */
export const INVOICE_SOON_DAYS = 7;

/** Same rule as the contract header: flagged overdue, or sent and past due. */
export function isInvoiceOverdue(i: Invoice, today: string): boolean {
    return i.status === "overdue" || (i.status === "sent" && i.dueDate < today);
}

/** Days a submitted task has waited for its approval (null when never submitted). */
export function waitingDays(w: Work, today: string): number | null {
    return w.submittedAt ? daysBetween(w.submittedAt.slice(0, 10), today) : null;
}

/** Oldest submission first; tasks with no stamp go last. */
export function sortPending(list: Work[]): Work[] {
    return [...list].sort((a, b) => (a.submittedAt || "~").localeCompare(b.submittedAt || "~") || a.title.localeCompare(b.title));
}

export type NextAction = {
    kind: "overdue" | "approvals" | "requests" | "invoice" | "setup" | "milestone" | "ok";
    /** The situation: "3 tasks overdue". */
    text: string;
    /** The verb on the link / button: "open board". Empty when there is nothing to do. */
    cta: string;
    href: string;
    /** `requests` only: the month the Brief-team form targets. */
    month?: string;
    tone: "bad" | "warn" | "ok";
};

export type ClientCard = {
    c: Contract;
    works: Work[];
    p: Progress;
    overdue: number;
    awaiting: number;
    /** Approvals the client gives (through the AM). */
    clientApprovals: number;
    /** Longest wait among the approvals, in days (0 when none). */
    staleDays: number;
    nextMilestone: Work | undefined;
    nextInvoice: Invoice | undefined;
    invoiceOverdue: boolean;
    urgent: SetupCheck[];
    /** Due date of the next open task, "" when none. */
    nearestDue: string;
    /** Next month's to-do tasks nobody has been briefed on yet. */
    unrequestedNext: Work[];
    action: NextAction;
    links: {
        work: string;
        document: string;
        setup: string;
        /** The contract's Tasks list view, filtered to exactly this. */
        listOf: (extra: Partial<WorkFilter>) => string;
    };
};

function plural(n: number, one: string, many = `${one}s`): string {
    return `${n} ${n === 1 ? one : many}`;
}

export function deriveCard(c: Contract, allWorks: Work[], invoices: Invoice[], today: string, asParam?: string): ClientCard {
    const thisMonth = today.slice(0, 7);
    const works = allWorks.filter((w) => w.contractId === c.id);
    const base = `/contracts/${c.id}`;
    const asQ = asParam ? `?as=${encodeURIComponent(asParam)}` : "";
    const links = {
        work: `${base}${asQ}`,
        document: `${base}/document`,
        setup: `${base}${filterQuery({}, { tab: "setup", as: asParam })}`,
        listOf: (extra: Partial<WorkFilter>) => `${base}${filterQuery({ ...emptyFilter(), ...extra }, { view: "list", as: asParam })}#works`,
    };

    const p = progress(works);
    const overdue = works.filter((w) => isOverdue(w, today)).length;
    const pending = works.filter((w) => w.status === "pending_approval");
    const awaiting = pending.length;
    const clientApprovals = pending.filter((w) => w.approver === "client").length;
    const staleDays = pending.reduce((max, w) => Math.max(max, waitingDays(w, today) ?? 0), 0);
    const nextMilestone = nextDue(works.filter((w) => w.milestone));
    // Earliest unpaid invoice on the contract (void ones are already out).
    const nextInvoice = invoicesFor(c, invoices)
        .filter((i) => i.status !== "paid")
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    const invoiceOverdue = Boolean(nextInvoice) && isInvoiceOverdue(nextInvoice, today);
    const urgent = setupChecklist(c, invoices, today).filter((x) => !x.ok && x.urgent);
    const nearestDue = nextDue(works)?.dueDate ?? "";
    const nm = nextMonth(thisMonth);
    // Same set requestMonthAction would send, so the count matches what the button does.
    const unrequestedNext = works.filter((w) => w.month === nm && w.status === "not_started" && !w.requestedAt);

    // ---- The one next move, in priority order.
    let action: NextAction;
    if (overdue > 0) {
        action = { kind: "overdue", text: `${plural(overdue, "task")} overdue`, cta: "open board", href: `${base}${filterQuery({ overdue: true }, { as: asParam })}#works`, tone: "bad" };
    } else if (awaiting > 0) {
        action = {
            kind: "approvals",
            text: `${plural(awaiting, "approval")} waiting${staleDays > 0 ? ` ${staleDays}d` : ""}`,
            cta: clientApprovals > 0 ? "chase client" : "approve",
            href: "#approvals",
            tone: staleDays >= 3 ? "bad" : "warn",
        };
    } else if (unrequestedNext.length > 0) {
        action = {
            kind: "requests",
            text: `${plural(unrequestedNext.length, "task")} not yet briefed for ${monthLabel(nm)}`,
            cta: "Brief team",
            href: "",
            month: nm,
            tone: "warn",
        };
    } else if (nextInvoice && invoiceOverdue) {
        const late = daysBetween(nextInvoice.dueDate, today);
        action = { kind: "invoice", text: `Invoice ${nextInvoice.number} overdue${late > 0 ? ` by ${late}d` : ""}`, cta: "remind", href: `/invoices/${nextInvoice.id}`, tone: "bad" };
    } else if (nextInvoice && nextInvoice.status === "sent" && daysBetween(today, nextInvoice.dueDate) <= INVOICE_SOON_DAYS) {
        const d = daysBetween(today, nextInvoice.dueDate);
        action = { kind: "invoice", text: `Invoice ${nextInvoice.number} due ${d === 0 ? "today" : `in ${d}d`}`, cta: "remind", href: `/invoices/${nextInvoice.id}`, tone: "warn" };
    } else if (nextInvoice && nextInvoice.status === "draft" && daysBetween(today, nextInvoice.dueDate) <= INVOICE_SOON_DAYS) {
        action = { kind: "invoice", text: `Invoice ${nextInvoice.number} not sent yet · due ${nextInvoice.dueDate}`, cta: "send", href: `/invoices/${nextInvoice.id}`, tone: "warn" };
    } else if (!c.signedAt) {
        action = { kind: "setup", text: "Unsigned contract", cta: "Setup", href: links.setup, tone: "warn" };
    } else if (urgent.length > 0) {
        action = { kind: "setup", text: plural(urgent.length, "setup gap"), cta: "Setup", href: links.setup, tone: "warn" };
    } else if (nextMilestone) {
        action = { kind: "milestone", text: `Milestone ${nextMilestone.title} due ${nextMilestone.dueDate}`, cta: "open", href: `/works/${nextMilestone.id}${asQ}`, tone: "ok" };
    } else {
        action = { kind: "ok", text: "On track", cta: "", href: "", tone: "ok" };
    }

    return { c, works, p, overdue, awaiting, clientApprovals, staleDays, nextMilestone, nextInvoice, invoiceOverdue, urgent, nearestDue, unrequestedNext, action, links };
}

/** Most at risk first: overdue, then the stalest approval, then the nearest due date. */
export function sortByRisk(cards: ClientCard[]): ClientCard[] {
    return [...cards].sort(
        (a, b) =>
            b.overdue - a.overdue ||
            b.staleDays - a.staleDays ||
            (a.nearestDue || "9999").localeCompare(b.nearestDue || "9999") ||
            a.c.name.localeCompare(b.c.name),
    );
}

/** A contract someone else manages where I hold a task share, with my tasks on it. */
export type AlsoOnGroup = {
    c: Contract;
    /** My tasks on the contract, open ones first, then by due date. */
    works: Work[];
    open: number;
    done: number;
};

/**
 * "Also on": the contracts I am not the account manager of but hold a task
 * share on. A contract stays listed while it is live (active or draft) or
 * while any of my tasks on it is still open; tasks whose contract is gone
 * are skipped. Sorted by client, then contract name.
 */
export function alsoOnGroups(me: string, contracts: Contract[], works: Work[]): AlsoOnGroup[] {
    if (!me) return [];
    const byId = new Map(contracts.map((c) => [c.id, c]));
    const mine = new Map<string, Work[]>();
    for (const w of works) {
        const c = byId.get(w.contractId);
        if (!c || norm(c.accountManager) === norm(me)) continue;
        if (!w.split.some((s) => s.member === me)) continue;
        mine.set(c.id, [...(mine.get(c.id) ?? []), w]);
    }
    return [...mine.entries()]
        .map(([id, list]) => {
            const sorted = [...list].sort(
                (a, b) =>
                    Number(isOpen(b)) - Number(isOpen(a)) ||
                    (a.dueDate || "9999").localeCompare(b.dueDate || "9999") ||
                    a.title.localeCompare(b.title),
            );
            const open = sorted.filter(isOpen).length;
            return { c: byId.get(id)!, works: sorted, open, done: sorted.length - open };
        })
        .filter((g) => g.open > 0 || g.c.status === "active" || g.c.status === "draft")
        .sort((a, b) => a.c.clientName.localeCompare(b.c.clientName) || a.c.name.localeCompare(b.c.name));
}

export type Totals = {
    contracts: number;
    /** This month's tasks across the contracts. */
    month: Progress;
    overdue: number;
    awaiting: number;
    invoicesOverdue: number;
};

export function totalsOf(cards: ClientCard[], invoices: Invoice[], today: string): Totals {
    const thisMonth = today.slice(0, 7);
    const works = cards.flatMap((k) => k.works);
    return {
        contracts: cards.length,
        month: progress(works.filter((w) => w.month === thisMonth)),
        overdue: cards.reduce((s, k) => s + k.overdue, 0),
        awaiting: cards.reduce((s, k) => s + k.awaiting, 0),
        invoicesOverdue: cards.reduce((s, k) => s + invoicesFor(k.c, invoices).filter((i) => isInvoiceOverdue(i, today)).length, 0),
    };
}
