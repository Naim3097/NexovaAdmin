/**
 * Clients tab maths: the head of client relationships' numbers. Pure
 * functions over the records the dashboard page already loaded, external
 * clients only (our own company is never a relationship to manage). The
 * view renders what comes back and does no sums of its own.
 *
 * Client health, ONE rule; the first line that fires names the reason:
 *   red   — an overdue invoice; a client approval waiting over 7 days; a
 *           project ending within 30 days with renewal not discussed or at
 *           risk; no check-in for 45 days.
 *   amber — a client approval waiting over 3 days; an open task waiting on
 *           the client; no check-in for 30 days; a project ending within 60
 *           days with renewal not discussed; overdue tasks on their projects.
 *   green — none of the above.
 * A client nobody has checked in on yet is measured from the day it was
 * created, so a client signed last week is not red for a call nobody could
 * have had. Paused clients keep the rule but render muted and sort last.
 */
import type { Tile } from "@/app/(admin)/dashboard/tiles";
import type { Tone } from "@/components/bars";
import type { Client } from "@/lib/data/clients";
import type { Contract } from "@/lib/data/contracts";
import type { Invoice } from "@/lib/data/invoices";
import type { Work } from "@/lib/data/works";
import type { Health } from "@/lib/management/metrics";
import { clientMonthlyMyr } from "@/lib/clients/revenue";
import { renewalLabel, type RenewalStatus } from "@/lib/contracts/renewal";
import { fmtMyrShort, fmtMyrWhole } from "@/lib/format";
import { waitingDays } from "@/lib/works/waiting";

/** Projects ending inside this window need a renewal conversation. */
export const RENEWAL_WINDOW_DAYS = 60;
/** Inside this window an undiscussed renewal is an emergency. */
export const RENEWAL_URGENT_DAYS = 30;
/** The "ending soon" list looks this far ahead. */
export const ENDING_LIST_DAYS = 90;
/** A client approval waiting longer than this turns the client red. */
export const APPROVAL_RED_DAYS = 7;
/** The Approvals tile counts waits longer than this. */
export const APPROVAL_TILE_DAYS = 5;
/** A client approval waiting longer than this turns the client amber. */
export const APPROVAL_AMBER_DAYS = 3;
export const CHECK_IN_RED_DAYS = 45;
export const CHECK_IN_AMBER_DAYS = 30;
/** One client above this share of revenue is a concentration risk. */
export const CONCENTRATION_PCT = 40;

/** The client directory lives under Settings; one place to change when it moves. */
export const CLIENTS_PATH = "/settings/clients";
/** Project tasks waiting on a client sit on the Works list. */
const APPROVALS_HREF = "/works?status=pending_approval";

/** Chip colours, the same four the Management UI uses. */
export type ChipTone = "neutral" | "good" | "warn" | "bad";

export type ClientCard = {
    id: string;
    name: string;
    status: Client["status"];
    health: Health;
    /** The dot colour: the health, or muted for a paused client. */
    tone: Tone;
    /** Why, in plain words: the first health line that fired. */
    reason: string;
    mrrMyr: number;
    projects: number;
    accountManagers: string[];
    /** "12 days ago" or "never". */
    lastCheckIn: string;
    href: string;
};

export type ShareRow = {
    key: string;
    name: string;
    valueMyr: number;
    pct: number;
    /** Above the concentration line. */
    over: boolean;
    href: string;
};

export type Concentration = {
    /** Shares of MRR, or of active contracted value when nobody bills monthly. */
    basis: "mrr" | "value";
    totalMyr: number;
    rows: ShareRow[];
};

export type EndingRow = {
    id: string;
    code: string;
    name: string;
    clientName: string;
    clientHref: string;
    accountManager: string;
    endDate: string;
    daysLeft: number;
    /** "RM 2,500/mo", or the contract value for one-off projects. */
    amountLabel: string;
    renewalStatus: RenewalStatus;
    renewalLabel: string;
    renewalTone: ChipTone;
    href: string;
};

export type EndingMonth = {
    /** YYYY-MM. */
    month: string;
    /** "Dec 2026". */
    label: string;
    rows: EndingRow[];
};

export type ClientRow = {
    id: string;
    name: string;
    status: Client["status"];
    health: Health;
    tone: Tone;
    /** Why, in plain words, for the dot's tooltip. */
    reason: string;
    dealOwner: string;
    accountManagers: string[];
    projects: number;
    mrrMyr: number;
    approvalsWaiting: number;
    overdueInvoices: number;
    lastCheckIn: string;
    /** Worst renewal standing among the client's ending projects; null when none end soon. */
    renewal: { label: string; tone: ChipTone } | null;
    href: string;
};

export type ClientRelations = {
    tiles: Tile[];
    /** Active and paused clients, worst first. */
    cards: ClientCard[];
    concentration: Concentration;
    ending: EndingMonth[];
    rows: ClientRow[];
    counts: { active: number; paused: number; prospects: number; churned: number };
};

// ---------------------------------------------------------------------------
// Small helpers (kept local so this module stays pure and client-safe)
// ---------------------------------------------------------------------------

const MS_DAY = 86_400_000;
const norm = (s: string) => s.trim().toLowerCase();
const HEALTH_RANK: Record<Health, number> = { red: 0, amber: 1, green: 2 };

/** Whole days from `fromYmd` (or an ISO timestamp) to `toYmd`; 0 when either is unreadable. */
function daysBetween(fromYmd: string, toYmd: string): number {
    const from = Date.parse(`${fromYmd.slice(0, 10)}T00:00:00Z`);
    const to = Date.parse(`${toYmd}T00:00:00Z`);
    if (Number.isNaN(from) || Number.isNaN(to)) return 0;
    return Math.floor((to - from) / MS_DAY);
}

/** YYYY-MM-DD the calendar quarter holding `today` started. */
export function quarterStart(today: string): string {
    const [y, m] = today.split("-").map(Number);
    const first = Math.floor((m - 1) / 3) * 3 + 1;
    return `${y}-${String(first).padStart(2, "0")}-01`;
}

/** "1 Oct" for a YYYY-MM-DD. */
function dayMonth(ymd: string): string {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleString("en-MY", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** "Dec 2026" for a YYYY-MM. */
function monthYear(ym: string): string {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-MY", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** "today", "yesterday", "12 days ago", or "never" for an empty date. */
export function agoLabel(ymd: string, today: string): string {
    if (!ymd) return "never";
    const d = daysBetween(ymd, today);
    if (d <= 0) return "today";
    if (d === 1) return "yesterday";
    return `${d} days ago`;
}

const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/** Days until an active project's end date; null when open-ended, ended or not active. */
function endsIn(c: Contract, today: string): number | null {
    if (c.status !== "active" || !c.endDate || c.endDate < today) return null;
    return daysBetween(today, c.endDate);
}

function monthlyOf(c: Contract): number {
    return c.billing.cadence === "monthly" ? Number(c.billing.amountMyr) || 0 : 0;
}

/** A sent invoice past its due date is overdue whether or not someone flipped the status. */
function isOverdueInvoice(i: Invoice, today: string): boolean {
    return i.status === "overdue" || (i.status === "sent" && Boolean(i.dueDate) && i.dueDate < today);
}

function isOverdueWork(w: Work, today: string): boolean {
    return w.status !== "completed" && Boolean(w.dueDate) && w.dueDate < today;
}

function isClientApproval(w: Work): boolean {
    return w.status === "pending_approval" && w.approver === "client";
}

function approvalAge(w: Work, today: string): number {
    return daysBetween(w.submittedAt ?? w.updatedAt, today);
}

const RENEWAL_TONE: Record<RenewalStatus, ChipTone> = {
    "": "bad",
    at_risk: "bad",
    not_renewing: "bad",
    in_talks: "warn",
    renewing: "good",
    renewed: "good",
};

/** Worst first, for the table's one renewal cell per client. */
const RENEWAL_RANK: Record<RenewalStatus, number> = {
    not_renewing: 0,
    at_risk: 1,
    "": 2,
    in_talks: 3,
    renewing: 4,
    renewed: 5,
};

// ---------------------------------------------------------------------------
// Per-client facts and the health rule
// ---------------------------------------------------------------------------

type Facts = {
    client: Client;
    active: Contract[];
    mrr: number;
    overdueInvoices: Invoice[];
    approvals: Work[];
    oldestApproval: number;
    /** Open tasks marked as blocked on the client, and the longest such wait in days. */
    waitingOnClient: number;
    longestWait: number;
    overdueTasks: number;
    /** Days since the last check-in, or since the client was created when there is none. */
    checkInDays: number;
    never: boolean;
    /** Active projects with an end date inside the ending list, soonest first. */
    ending: Array<{ c: Contract; days: number }>;
};

function factsFor(client: Client, contracts: Contract[], works: Work[], invoices: Invoice[], today: string): Facts {
    const name = norm(client.name);
    const mine = contracts.filter((c) => norm(c.clientName) === name);
    const active = mine.filter((c) => c.status === "active");
    const myWorks = works.filter((w) => norm(w.clientName) === name);
    const approvals = myWorks.filter(isClientApproval);
    const ending = active
        .map((c) => ({ c, days: endsIn(c, today) }))
        .filter((x): x is { c: Contract; days: number } => x.days !== null && x.days <= ENDING_LIST_DAYS)
        .sort((a, b) => a.days - b.days);
    const never = !client.lastCheckInAt;
    const waiting = myWorks.filter((w) => w.status !== "completed" && w.waitingOn === "client");
    return {
        client,
        active,
        mrr: clientMonthlyMyr(client.name, contracts),
        overdueInvoices: invoices.filter((i) => norm(i.clientName) === name && isOverdueInvoice(i, today)),
        approvals,
        oldestApproval: approvals.length ? Math.max(...approvals.map((w) => approvalAge(w, today))) : 0,
        waitingOnClient: waiting.length,
        longestWait: waiting.length ? Math.max(...waiting.map((w) => waitingDays(w, today))) : 0,
        overdueTasks: myWorks.filter((w) => isOverdueWork(w, today)).length,
        checkInDays: daysBetween(never ? client.createdAt : client.lastCheckInAt, today),
        never,
        ending,
    };
}

/** The health rule from the header, top to bottom; the first line that fires is the reason. */
function judge(f: Facts, today: string): { health: Health; reason: string } {
    if (f.overdueInvoices.length) {
        const late = Math.max(...f.overdueInvoices.map((i) => daysBetween(i.dueDate, today)));
        return { health: "red", reason: f.overdueInvoices.length === 1 ? `invoice ${days(late)} overdue` : `${f.overdueInvoices.length} invoices overdue` };
    }
    if (f.oldestApproval > APPROVAL_RED_DAYS) return { health: "red", reason: `approval waiting ${days(f.oldestApproval)}` };
    const urgent = f.ending.find((e) => e.days <= RENEWAL_URGENT_DAYS && (e.c.renewalStatus === "" || e.c.renewalStatus === "at_risk"));
    if (urgent) {
        return {
            health: "red",
            reason: urgent.c.renewalStatus === "at_risk" ? `renewal at risk, ends in ${days(urgent.days)}` : `ends in ${days(urgent.days)}, renewal not discussed`,
        };
    }
    if (f.checkInDays > CHECK_IN_RED_DAYS) return { health: "red", reason: f.never ? "never checked in" : `no check-in for ${days(f.checkInDays)}` };
    if (f.oldestApproval > APPROVAL_AMBER_DAYS) return { health: "amber", reason: `approval waiting ${days(f.oldestApproval)}` };
    if (f.waitingOnClient) return { health: "amber", reason: f.longestWait > 0 ? `waiting on them ${days(f.longestWait)}` : "waiting on them since today" };
    if (f.checkInDays > CHECK_IN_AMBER_DAYS) return { health: "amber", reason: f.never ? "never checked in" : `no check-in for ${days(f.checkInDays)}` };
    const soon = f.ending.find((e) => e.days <= RENEWAL_WINDOW_DAYS && e.c.renewalStatus === "");
    if (soon) return { health: "amber", reason: `ends in ${days(soon.days)}, renewal not discussed` };
    if (f.overdueTasks) return { health: "amber", reason: `${f.overdueTasks} overdue task${f.overdueTasks === 1 ? "" : "s"}` };
    return { health: "green", reason: "nothing waiting" };
}

function managersOf(active: Contract[]): string[] {
    return [...new Set(active.map((c) => c.accountManager.trim()).filter(Boolean))];
}

/** Active before paused, then worst health, then the biggest retainer. */
function compareRows(a: { status: Client["status"]; health: Health; mrrMyr: number; name: string }, b: typeof a): number {
    return (
        (a.status === "paused" ? 1 : 0) - (b.status === "paused" ? 1 : 0) ||
        HEALTH_RANK[a.health] - HEALTH_RANK[b.health] ||
        b.mrrMyr - a.mrrMyr ||
        a.name.localeCompare(b.name)
    );
}

// ---------------------------------------------------------------------------
// The snapshot
// ---------------------------------------------------------------------------

export function clientRelations(input: {
    /** External clients only (`data.externalClients`). */
    clients: Client[];
    /** External projects only (`data.external`). */
    contracts: Contract[];
    works: Work[];
    invoices: Invoice[];
    /** YYYY-MM-DD. */
    today: string;
}): ClientRelations {
    const { clients, contracts, works, invoices, today } = input;
    const names = new Set(clients.map((c) => norm(c.name)));
    const qStart = quarterStart(today);
    const hrefFor = (c: Client) => `${CLIENTS_PATH}/${c.id}`;

    // The relationships to manage: active and paused. Prospects have nothing
    // to check in on yet; churned clients are history.
    const managed = clients.filter((c) => c.status === "active" || c.status === "paused");
    const judged = managed.map((client) => {
        const f = factsFor(client, contracts, works, invoices, today);
        const { health, reason } = judge(f, today);
        return { f, health, reason: client.status === "paused" ? "paused" : reason };
    });

    const cards: ClientCard[] = judged
        .map(({ f, health, reason }) => ({
            id: f.client.id,
            name: f.client.name,
            status: f.client.status,
            health,
            tone: f.client.status === "paused" ? ("muted" as Tone) : health,
            reason,
            mrrMyr: f.mrr,
            projects: f.active.length,
            accountManagers: managersOf(f.active),
            lastCheckIn: agoLabel(f.client.lastCheckInAt, today),
            href: hrefFor(f.client),
        }))
        .sort(compareRows);

    const rows: ClientRow[] = judged
        .map(({ f, health, reason }) => {
            const worst = [...f.ending].sort((a, b) => RENEWAL_RANK[a.c.renewalStatus] - RENEWAL_RANK[b.c.renewalStatus])[0];
            return {
                id: f.client.id,
                name: f.client.name,
                status: f.client.status,
                health,
                tone: f.client.status === "paused" ? ("muted" as Tone) : health,
                reason,
                dealOwner: f.client.dealOwner,
                accountManagers: managersOf(f.active),
                projects: f.active.length,
                mrrMyr: f.mrr,
                approvalsWaiting: f.approvals.length,
                overdueInvoices: f.overdueInvoices.length,
                lastCheckIn: agoLabel(f.client.lastCheckInAt, today),
                renewal: worst ? { label: renewalLabel(worst.c.renewalStatus), tone: RENEWAL_TONE[worst.c.renewalStatus] } : null,
                href: hrefFor(f.client),
            };
        })
        .sort(compareRows);

    // Revenue concentration: shares of MRR; of active contracted value when nobody bills monthly.
    const mrrTotal = judged.reduce((s, j) => s + j.f.mrr, 0);
    const basis: Concentration["basis"] = mrrTotal > 0 ? "mrr" : "value";
    const shares = judged
        .map((j) => ({
            key: j.f.client.id,
            name: j.f.client.name,
            valueMyr: basis === "mrr" ? j.f.mrr : j.f.active.reduce((s, c) => s + (Number(c.valueMyr) || 0), 0),
            href: hrefFor(j.f.client),
        }))
        .filter((r) => r.valueMyr > 0)
        .sort((a, b) => b.valueMyr - a.valueMyr);
    const shareTotal = shares.reduce((s, r) => s + r.valueMyr, 0);
    const concentration: Concentration = {
        basis,
        totalMyr: shareTotal,
        rows: shares.map((r) => {
            const pct = shareTotal > 0 ? Math.round((r.valueMyr / shareTotal) * 100) : 0;
            return { ...r, pct, over: pct > CONCENTRATION_PCT };
        }),
    };

    // Ending soon: active external projects with an end date inside the list window, by month.
    const clientIdByName = new Map(clients.map((c) => [norm(c.name), c.id]));
    const endingRows: EndingRow[] = contracts
        .map((c) => ({ c, d: endsIn(c, today) }))
        .filter((x): x is { c: Contract; d: number } => x.d !== null && x.d <= ENDING_LIST_DAYS)
        .sort((a, b) => a.c.endDate.localeCompare(b.c.endDate) || a.c.name.localeCompare(b.c.name))
        .map(({ c, d }) => {
            const monthly = monthlyOf(c);
            const clientId = clientIdByName.get(norm(c.clientName));
            return {
                id: c.id,
                code: c.code,
                name: c.name,
                clientName: c.clientName,
                clientHref: clientId ? `${CLIENTS_PATH}/${clientId}` : CLIENTS_PATH,
                accountManager: c.accountManager,
                endDate: c.endDate,
                daysLeft: d,
                amountLabel: monthly ? `${fmtMyrWhole(monthly)}/mo` : c.valueMyr ? `${fmtMyrWhole(c.valueMyr)} value` : "no value set",
                renewalStatus: c.renewalStatus,
                renewalLabel: renewalLabel(c.renewalStatus),
                renewalTone: RENEWAL_TONE[c.renewalStatus],
                href: `/projects/${c.id}`,
            };
        });
    const ending: EndingMonth[] = [];
    for (const r of endingRows) {
        const month = r.endDate.slice(0, 7);
        const group = ending.find((g) => g.month === month);
        if (group) group.rows.push(r);
        else ending.push({ month, label: monthYear(month), rows: [r] });
    }

    // Tiles.
    const active = clients.filter((c) => c.status === "active");
    const paused = clients.filter((c) => c.status === "paused");
    const atRisk = cards.filter((c) => c.status === "active" && c.health === "red");
    const renewals = contracts.filter((c) => {
        const d = endsIn(c, today);
        return d !== null && d <= RENEWAL_WINDOW_DAYS;
    });
    const renewalsMyr = renewals.reduce((s, c) => s + (monthlyOf(c) || Number(c.valueMyr) || 0), 0);
    const renewalUrgent = renewals.some((c) => (endsIn(c, today) ?? 99) <= RENEWAL_URGENT_DAYS && (c.renewalStatus === "" || c.renewalStatus === "at_risk"));
    const approvals = works.filter((w) => names.has(norm(w.clientName)) && isClientApproval(w) && approvalAge(w, today) > APPROVAL_TILE_DAYS);
    const longest = approvals.length ? Math.max(...approvals.map((w) => approvalAge(w, today))) : 0;
    const fresh = clients.filter((c) => c.createdAt.slice(0, 10) >= qStart);
    // Grew: a second active project, or a client who already had a project
    // (one signed or started before this quarter) and signed another this
    // quarter. A first project signed this quarter is a win, not an expansion.
    const expansions = clients.filter((c) => {
        const name = norm(c.name);
        const mine = contracts.filter((k) => norm(k.clientName) === name && k.status !== "cancelled");
        if (mine.filter((k) => k.status === "active").length > 1) return true;
        const signedNow = mine.filter((k) => (k.signedAt ?? "") >= qStart);
        const earlier = mine.filter((k) => !signedNow.includes(k) && ((k.signedAt && k.signedAt < qStart) || (k.startDate && k.startDate < qStart)));
        return signedNow.length > 0 && earlier.length > 0;
    });

    const tiles: Tile[] = [
        {
            key: "active",
            label: "Active clients",
            value: String(active.length),
            hint: paused.length ? `${paused.length} paused` : "clients with us",
            health: "green",
            href: CLIENTS_PATH,
            count: active.length,
        },
        {
            key: "at-risk",
            label: "At risk",
            value: String(atRisk.length),
            hint: atRisk.length === 0 ? "nobody red" : atRisk.length === 1 ? atRisk[0].name : `${atRisk[0].name} +${atRisk.length - 1}`,
            health: atRisk.length ? "red" : "green",
            href: `${CLIENTS_PATH}`,
            count: atRisk.length,
        },
        {
            key: "renewals",
            label: `Renewals in ${RENEWAL_WINDOW_DAYS} days`,
            value: String(renewals.length),
            hint: renewals.length ? `${fmtMyrShort(renewalsMyr)} to renew` : "nothing ending soon",
            health: renewalUrgent ? "red" : renewals.length ? "amber" : "green",
            href: "/projects",
            count: renewals.length,
        },
        {
            key: "approvals",
            label: "Approvals waiting",
            value: String(approvals.length),
            hint: approvals.length ? `longest ${longest}d` : `none over ${APPROVAL_TILE_DAYS} days`,
            health: longest > APPROVAL_RED_DAYS ? "red" : approvals.length ? "amber" : "green",
            href: APPROVALS_HREF,
            count: approvals.length,
        },
        {
            key: "new",
            label: "New this quarter",
            value: String(fresh.length),
            hint: `since ${dayMonth(qStart)}`,
            health: "green",
            href: CLIENTS_PATH,
            count: fresh.length,
        },
        {
            key: "expansions",
            label: "Expansions",
            value: String(expansions.length),
            hint: expansions.length ? "clients that grew" : "no upsells yet",
            health: "green",
            href: "/projects",
            count: expansions.length,
        },
    ];

    return {
        tiles,
        cards,
        concentration,
        ending,
        rows,
        counts: {
            active: active.length,
            paused: paused.length,
            prospects: clients.filter((c) => c.status === "prospect").length,
            churned: clients.filter((c) => c.status === "churned").length,
        },
    };
}
