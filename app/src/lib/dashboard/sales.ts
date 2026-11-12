/**
 * Sales maths for the Dashboard's Sales tab and the Pipeline page's owner
 * strip: one place, so both show the same numbers. Pure: takes the records a
 * page already loaded and returns plain data. No fs, no React, so it is safe
 * to import anywhere.
 *
 * Vocabulary: a deal is a lead, open until it is won or lost. "Closed" money is
 * a signed external project (Contract.signedAt + valueMyr), because a won lead
 * has no value of record until the contract is written. On a lead, createdAt
 * is when it arrived and updatedAt is the last touch; for a won or lost deal
 * that is the day it was decided (a later edit moves it, so treat it as
 * approximate). Internal projects are never a deal: pass external contracts only.
 *
 * All time (`month` = ALL_TIME): closed is every signed project (no target
 * colour, since the target is monthly), win rate, cycle, sources and lost
 * reasons read every decided deal instead of the last WINDOW_DAYS, and the
 * trend runs from the first signing to this month.
 */
import type { Contract } from "@/lib/data/contracts";
import type { Lead, LeadSource, LeadStatus } from "@/lib/data/leads";
import type { Quotation } from "@/lib/data/quotations";
import type { Health } from "@/lib/management/metrics";
import { ALL_TIME, axisLabel, monthShort, monthYear, monthsAround, monthsBetween } from "@/lib/dashboard/data";
import { fmtMyrShort } from "@/lib/format";
import { lostReasonLabel, type LostReason } from "@/lib/leads/lost";

/** Win rate, cycle, sources and lost reasons look back this far. */
export const WINDOW_DAYS = 90;
/** An open deal untouched for longer than this is stuck. */
export const STUCK_DAYS = 7;
/** A new lead nobody has touched after this many days has missed its first touch. */
export const FIRST_TOUCH_DAYS = 2;
/** Months on the won trend, ending at the month being read. */
export const TREND_MONTHS = 6;

export type SalesTile = {
    key: string;
    label: string;
    value: string;
    hint: string;
    health: Health;
    href: string;
    count: number;
};

export type FunnelStage = {
    status: LeadStatus;
    label: string;
    count: number;
    myr: number;
    /**
     * Conversion from the stage before: deals that reached this stage or a later
     * one, over those that reached the previous one (lost deals left out, since
     * nothing records where they fell). Null on the first stage.
     */
    fromPrevPct: number | null;
    prevLabel: string | null;
};

export type TrendPoint = {
    month: string;
    /** "Nov", or "Jan '27" where a long run turns the year. */
    label: string;
    signedMyr: number;
    signedCount: number;
    /** Estimated value of the deals lost that month. */
    lostMyr: number;
    future: boolean;
};

export type AgeTone = "green" | "primary" | "amber" | "red";
export type AgeBucket = { key: string; label: string; count: number; myr: number; tone: AgeTone };

export type OwnerStats = {
    /** Team member name, or "Unassigned". */
    name: string;
    open: number;
    openMyr: number;
    stuck: number;
    won90: number;
    won90Myr: number;
    lost90: number;
    /** won / (won + lost) over the window; null when nothing was decided. */
    winRatePct: number | null;
    /** Deals won (by last touch) in the month being read. */
    wonMonth: number;
    wonMonthMyr: number;
};

export type SourceRow = { source: LeadSource; label: string; count: number; won: number };
export type LostRow = { reason: LostReason; label: string; count: number; myr: number };

export type SalesSnapshot = {
    tiles: SalesTile[];
    funnel: FunnelStage[];
    trend: TrendPoint[];
    age: AgeBucket[];
    owners: OwnerStats[];
    sources: SourceRow[];
    lost: LostRow[];
    /** Monthly target in MYR; 0 = none set. */
    targetMyr: number;
    openCount: number;
    /** True when the snapshot reads every month (the window is then all time too). */
    allTime: boolean;
};

export type SalesInput = {
    leads: Lead[];
    quotes: Quotation[];
    /** External projects only. */
    contracts: Contract[];
    /** Agency profile's monthly sales target; 0 = none. */
    targetMyr: number;
    /** YYYY-MM the tab is read for, or ALL_TIME. */
    month: string;
    /** YYYY-MM-DD. */
    today: string;
};

/** The funnel's stage names as the board shows them. */
const STAGE_LABEL: Record<LeadStatus, string> = {
    new: "New",
    contacted: "Contacted",
    qualified: "Qualified",
    proposal: "Quoted",
    won: "Won",
    lost: "Lost",
};
const FUNNEL: LeadStatus[] = ["new", "contacted", "qualified", "proposal", "won"];

const SOURCE_LABEL: Record<LeadSource, string> = {
    referral: "Referral",
    website: "Website",
    instagram: "Instagram",
    facebook: "Facebook",
    tiktok: "TikTok",
    google: "Google",
    linkedin: "LinkedIn",
    event: "Event",
    cold_outreach: "Cold outreach",
    other: "Other",
};

const AGE_BUCKETS: { key: string; label: string; maxDays: number; tone: AgeTone }[] = [
    { key: "under-7", label: "Under 7 days", maxDays: 6, tone: "green" },
    { key: "7-14", label: "7–14 days", maxDays: 14, tone: "primary" },
    { key: "15-30", label: "15–30 days", maxDays: 30, tone: "amber" },
    { key: "over-30", label: "Over 30 days", maxDays: Infinity, tone: "red" },
];

// ---------------------------------------------------------------------------
// Small pure helpers (mirrors of metrics.ts, kept local so this file stays fs-free)
// ---------------------------------------------------------------------------

const MS_DAY = 86_400_000;
const norm = (s: string) => s.trim().toLowerCase();
const ymd = (iso: string) => iso.slice(0, 10);
const ym = (iso: string) => iso.slice(0, 7);

/** Whole calendar days from one date (ISO or YYYY-MM-DD) to another. */
function daysBetween(fromIso: string, toIso: string): number {
    const from = Date.parse(`${ymd(fromIso)}T00:00:00Z`);
    const to = Date.parse(`${ymd(toIso)}T00:00:00Z`);
    if (Number.isNaN(from) || Number.isNaN(to)) return 0;
    return Math.floor((to - from) / MS_DAY);
}

function shiftYmd(today: string, offset: number): string {
    return new Date(Date.parse(`${today}T00:00:00Z`) + offset * MS_DAY).toISOString().slice(0, 10);
}

function sum<T>(list: T[], pick: (t: T) => number): number {
    return list.reduce((s, t) => s + (pick(t) || 0), 0);
}

function pct(part: number, whole: number): number | null {
    return whole > 0 ? Math.round((part / whole) * 100) : null;
}

function plural(n: number, one: string, many = `${one}s`): string {
    return `${n} ${n === 1 ? one : many}`;
}

export function isOpenLead(l: Pick<Lead, "status">): boolean {
    return l.status !== "won" && l.status !== "lost";
}

/** Quote total with tax, as the quote document prints it (same sum as computeTotals in the quotations store). */
function quoteTotal(q: Pick<Quotation, "items" | "taxRatePct">): number {
    const subtotal = q.items.reduce((s, it) => s + (it.quantity || 0) * (it.unitPriceMyr || 0), 0);
    return +(subtotal * (1 + (q.taxRatePct || 0) / 100)).toFixed(2);
}

/** Signed in the month (any month under All time), one-off or retainer alike; a cancelled project does not count. */
function signedIn(contracts: Contract[], month: string): Contract[] {
    const all = month === ALL_TIME;
    return contracts.filter((c) => c.status !== "cancelled" && Boolean(c.signedAt) && (all || (c.signedAt ?? "").startsWith(month)));
}

/**
 * Closed money against the target. The current month is judged on pace (the
 * share of the target its elapsed days ask for), a past month on the whole
 * target; red only once the month is half gone, so day one is never red.
 */
function closedHealth(closedMyr: number, target: number, month: string, today: string): Health {
    // The target is monthly: All time has nothing to measure it against.
    if (target <= 0 || month === ALL_TIME) return "green";
    const current = ym(today);
    if (month > current) return "green";
    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const dayOfMonth = Number(today.slice(8, 10));
    const due = month === current ? (target * dayOfMonth) / daysInMonth : target;
    const ratio = due > 0 ? closedMyr / due : 1;
    if (ratio >= 1) return "green";
    const lateEnough = month < current || dayOfMonth > daysInMonth / 2;
    return ratio < 0.5 && lateEnough ? "red" : "amber";
}

// ---------------------------------------------------------------------------
// Per owner — shared with the Pipeline page's strip
// ---------------------------------------------------------------------------

/** One row per deal owner (lead.assignedTo) plus "Unassigned" when it has deals; sorted by open MYR. Under ALL_TIME, `wonMonth` is every win. */
export function ownerStats(input: { leads: Lead[]; month: string; today: string }): OwnerStats[] {
    const { leads, month, today } = input;
    const since = shiftYmd(today, -WINDOW_DAYS);
    const byOwner = new Map<string, Lead[]>();
    for (const l of leads) {
        const key = l.assignedTo.trim() || "Unassigned";
        (byOwner.get(key) ?? byOwner.set(key, []).get(key)!).push(l);
    }
    const rows: OwnerStats[] = [];
    for (const [name, list] of byOwner) {
        const open = list.filter(isOpenLead);
        const decided = list.filter((l) => !isOpenLead(l) && ymd(l.updatedAt) >= since);
        const won90 = decided.filter((l) => l.status === "won");
        const lost90 = decided.filter((l) => l.status === "lost");
        const wonMonth = list.filter((l) => l.status === "won" && (month === ALL_TIME || ym(l.updatedAt) === month));
        rows.push({
            name,
            open: open.length,
            openMyr: sum(open, (l) => l.estValueMyr),
            stuck: open.filter((l) => daysBetween(l.updatedAt, today) > STUCK_DAYS).length,
            won90: won90.length,
            won90Myr: sum(won90, (l) => l.estValueMyr),
            lost90: lost90.length,
            winRatePct: pct(won90.length, won90.length + lost90.length),
            wonMonth: wonMonth.length,
            wonMonthMyr: sum(wonMonth, (l) => l.estValueMyr),
        });
    }
    return rows.sort((a, b) => b.openMyr - a.openMyr || b.open - a.open || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// The snapshot
// ---------------------------------------------------------------------------

export function salesSnapshot(input: SalesInput): SalesSnapshot {
    const { leads, quotes, contracts, targetMyr, month, today } = input;
    const current = ym(today);
    const allTime = month === ALL_TIME;
    // The look-back window: WINDOW_DAYS, or everything under All time ("" sorts before any date).
    const since = allTime ? "" : shiftYmd(today, -WINDOW_DAYS);
    const windowWords = allTime ? "yet" : `in ${WINDOW_DAYS}d`;

    const open = leads.filter(isOpenLead);
    const openMyr = sum(open, (l) => l.estValueMyr);
    const decided = leads.filter((l) => !isOpenLead(l) && ymd(l.updatedAt) >= since);
    const won90 = decided.filter((l) => l.status === "won");
    const lost90 = decided.filter((l) => l.status === "lost");
    const winRate = pct(won90.length, decided.length);
    const cycleDays = won90.length ? Math.round(sum(won90, (l) => daysBetween(l.createdAt, l.updatedAt)) / won90.length) : null;
    const untouched = leads.filter((l) => l.status === "new" && daysBetween(l.createdAt, today) > FIRST_TOUCH_DAYS);
    const stuck = open.filter((l) => daysBetween(l.updatedAt, today) > STUCK_DAYS);
    const closed = signedIn(contracts, month);
    const closedMyr = sum(closed, (c) => c.valueMyr);
    const closedPct = pct(closedMyr, targetMyr);
    const firstSigned = closed.map((c) => ym(c.signedAt ?? "")).sort()[0] ?? "";
    const closedHint = allTime
        ? closed.length
            ? `since ${monthYear(firstSigned)}`
            : "nothing signed yet"
        : targetMyr > 0
          ? `${closedPct}% of ${fmtMyrShort(targetMyr)}`
          : closed.length
            ? `${plural(closed.length, "project")} signed`
            : "nothing signed yet";

    const tiles: SalesTile[] = [
        {
            key: "closed",
            label: allTime ? "Closed · all time" : month === current ? "Closed this month" : `Closed · ${monthShort(month)}`,
            value: fmtMyrShort(closedMyr),
            hint: closedHint,
            health: closedHealth(closedMyr, targetMyr, month, today),
            href: "/projects?stage=signed",
            count: closed.length,
        },
        {
            key: "win-rate",
            label: "Win rate",
            value: winRate === null ? "—" : `${winRate}%`,
            hint: decided.length ? `${won90.length} won · ${lost90.length} lost` : `nothing decided ${windowWords}`,
            health: winRate === null ? "green" : winRate >= 50 ? "green" : winRate >= 25 ? "amber" : "red",
            href: "/pipeline",
            count: decided.length,
        },
        {
            key: "pipeline",
            label: "Open pipeline",
            value: fmtMyrShort(openMyr),
            hint: open.length ? plural(open.length, "open deal") : "no open deals",
            health: open.length ? "green" : "amber",
            href: "/pipeline",
            count: open.length,
        },
        {
            key: "cycle",
            label: "Avg cycle",
            value: cycleDays === null ? "—" : `${cycleDays}d`,
            hint: cycleDays === null ? `no wins ${windowWords}` : `new → won · ${plural(won90.length, "deal")}`,
            health: "green",
            href: "/pipeline",
            count: won90.length,
        },
        {
            key: "first-touch",
            label: "First touch",
            value: String(untouched.length),
            hint: untouched.length ? `new, untouched ${FIRST_TOUCH_DAYS}d+` : "every new lead touched",
            health: untouched.some((l) => daysBetween(l.createdAt, today) > STUCK_DAYS) ? "red" : untouched.length ? "amber" : "green",
            href: "/leads",
            count: untouched.length,
        },
        {
            key: "stuck",
            label: "Stuck deals",
            value: String(stuck.length),
            hint: stuck.length ? `no touch ${STUCK_DAYS}d+` : "all deals moving",
            health: stuck.length ? "amber" : "green",
            href: "/pipeline",
            count: stuck.length,
        },
    ];

    // Funnel: where the deals sit today. A quoted deal is worth its sent quote
    // when there is one (the latest per client), else the estimate.
    const sentQuote = new Map<string, Quotation>();
    for (const q of quotes) {
        if (q.status !== "sent") continue;
        const key = norm(q.clientName);
        const cur = sentQuote.get(key);
        if (!cur || q.updatedAt > cur.updatedAt) sentQuote.set(key, q);
    }
    const dealValue = (l: Lead) => {
        if (l.status !== "proposal") return l.estValueMyr || 0;
        const q = sentQuote.get(norm(l.company || l.name));
        return q ? quoteTotal(q) : l.estValueMyr || 0;
    };
    const funnel: FunnelStage[] = [];
    const reached = (i: number) => leads.filter((l) => FUNNEL.indexOf(l.status) >= i).length;
    for (const [i, status] of FUNNEL.entries()) {
        const list = leads.filter((l) => l.status === status);
        const prev = funnel[funnel.length - 1];
        funnel.push({
            status,
            label: STAGE_LABEL[status],
            count: list.length,
            myr: sum(list, dealValue),
            fromPrevPct: prev ? pct(reached(i), reached(i - 1)) : null,
            prevLabel: prev ? prev.label : null,
        });
    }

    // Won trend: MYR signed per month, and what was lost beside it. All time runs from
    // the first signing to this month (the usual window when nothing is signed yet).
    const trendMonths = allTime ? (firstSigned ? monthsBetween(firstSigned < current ? firstSigned : current, current) : monthsAround(current, TREND_MONTHS)) : monthsAround(month, TREND_MONTHS);
    const trend: TrendPoint[] = trendMonths.map((m, i) => {
        const signed = signedIn(contracts, m);
        const lost = leads.filter((l) => l.status === "lost" && ym(l.updatedAt) === m);
        return {
            month: m,
            label: axisLabel(trendMonths, i),
            signedMyr: sum(signed, (c) => c.valueMyr),
            signedCount: signed.length,
            lostMyr: sum(lost, (l) => l.estValueMyr),
            future: m > current,
        };
    });

    // Deal age: open deals by days since they arrived.
    const age: AgeBucket[] = AGE_BUCKETS.map((b, i) => {
        const min = i === 0 ? -Infinity : AGE_BUCKETS[i - 1].maxDays;
        const list = open.filter((l) => {
            const d = daysBetween(l.createdAt, today);
            return d > min && d <= b.maxDays;
        });
        return { key: b.key, label: b.label, count: list.length, myr: sum(list, (l) => l.estValueMyr), tone: b.tone };
    });

    // Lead sources: what arrived in the window, and how much of it won.
    const recent = leads.filter((l) => ymd(l.createdAt) >= since);
    const bySource = new Map<LeadSource, Lead[]>();
    for (const l of recent) (bySource.get(l.source) ?? bySource.set(l.source, []).get(l.source)!).push(l);
    const sources: SourceRow[] = [...bySource]
        .map(([source, list]) => ({ source, label: SOURCE_LABEL[source] ?? source, count: list.length, won: list.filter((l) => l.status === "won").length }))
        .sort((a, b) => b.count - a.count || b.won - a.won || a.label.localeCompare(b.label));

    // Lost reasons over the window; "" is "Not recorded" (older leads).
    const byReason = new Map<LostReason, Lead[]>();
    for (const l of lost90) (byReason.get(l.lostReason) ?? byReason.set(l.lostReason, []).get(l.lostReason)!).push(l);
    const lost: LostRow[] = [...byReason]
        .map(([reason, list]) => ({ reason, label: lostReasonLabel(reason), count: list.length, myr: sum(list, (l) => l.estValueMyr) }))
        .sort((a, b) => b.count - a.count || b.myr - a.myr || a.label.localeCompare(b.label));

    return {
        tiles,
        funnel,
        trend,
        age,
        owners: ownerStats({ leads, month, today }),
        sources,
        lost,
        targetMyr,
        openCount: open.length,
        allTime,
    };
}
