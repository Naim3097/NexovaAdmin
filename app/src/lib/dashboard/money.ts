/**
 * Money tab maths — the head of P&L's numbers over invoices, projects, tasks,
 * the team's cost rates and each project's other costs. Pure: no I/O, no
 * React; the view renders what comes back.
 *
 * Two kinds of amount live here and the view labels them apart:
 *  - cash figures (tiles, ageing, outstanding, collected) use the invoice
 *    total, SST included, because that is what the client owes or paid;
 *  - P&L figures (the contracted chart, not-yet-billed, backlog, margin,
 *    billed to date) use the invoice subtotal, before SST, because contract
 *    values are quoted before tax and the two must line up.
 *
 * "Through" month: everything to date is read up to the picked month; under
 * All time (`month` = ALL_TIME) that is today, the tiles add up every month,
 * the chart starts at the first month with a project or an invoice, and the
 * margin table takes in finished projects too.
 */
import type { Tile } from "@/app/(admin)/dashboard/tiles";
import type { Client } from "@/lib/data/clients";
import type { Contract } from "@/lib/data/contracts";
import type { Invoice } from "@/lib/data/invoices";
import type { TeamMember } from "@/lib/data/team";
import type { Work } from "@/lib/data/works";
import { clientMonthlyMyr } from "@/lib/clients/revenue";
import { costsTotal } from "@/lib/contracts/costs";
import { ALL_TIME, axisLabel, isYm, monthEnd, monthShort, monthsAround, monthsBetween } from "@/lib/dashboard/data";
import { fmtMyrShort } from "@/lib/format";
import { computeTotals } from "@/lib/invoices/totals";
import { addMonths, daysSince, shiftYmd, type Health } from "@/lib/management/metrics";

/** Months the chart shows before and including the picked month, and after it. */
export const CHART_BACK = 6;
export const CHART_AHEAD = 3;
/** Unpaid invoices falling due inside this window are "due soon". */
export const DUE_WINDOW_DAYS = 14;
/** Margin bands: at or above the first is healthy, at or above the second needs watching. */
export const MARGIN_GOOD_PCT = 40;
export const MARGIN_WATCH_PCT = 20;

export type MoneyInput = {
    invoices: Invoice[];
    /** Real clients' projects only (internal work carries no money). */
    contracts: Contract[];
    /** Real clients only. */
    clients: Client[];
    works: Work[];
    team: TeamMember[];
    /** YYYY-MM-DD. */
    today: string;
    /** YYYY-MM the numbers are read for, or ALL_TIME. */
    month: string;
    /** YYYY-MM of today. */
    current: string;
};

/** One month on the chart. Future months carry the contracted figure only (no billed, no collected). */
export type MoneyPoint = {
    month: string;
    label: string;
    values: { contracted: number; billed?: number; collected?: number };
    future: boolean;
};

export type AgeTone = "green" | "amber" | "red";
export type AgeBucket = {
    key: string;
    label: string;
    myr: number;
    count: number;
    tone: AgeTone;
};

export type MarginRow = {
    id: string;
    code: string;
    name: string;
    clientName: string;
    /** Billed to date before SST; the contracted figure to date when nothing is billed yet. */
    revenueMyr: number;
    /** True when revenue is the contracted amount, not an invoice. */
    estimated: boolean;
    /** Planned hours through the month × each person's cost rate. */
    peopleMyr: number;
    /** The project's other costs (ad spend, freelancers, software…) dated to the end of the month. */
    otherMyr: number;
    hours: number;
    /** revenue − people − other. */
    marginMyr: number;
    /** Null when there is no revenue to divide by. */
    marginPct: number | null;
    health: Health;
    href: string;
};

export type ClientMoneyRow = {
    id: string;
    name: string;
    /** Billed before SST: the picked month's year to date, or every invoice under All time. */
    billedMyr: number;
    outstandingMyr: number;
    overdueMyr: number;
    mrrMyr: number;
    href: string;
};

export type MoneySnapshot = {
    /** YYYY-MM the "to date" figures run through: the picked month, or today's under All time. */
    through: string;
    allTime: boolean;
    tiles: Tile[];
    chart: {
        points: MoneyPoint[];
        /** Contracted through `through` that no invoice covers yet, per project, never negative. */
        notBilledMyr: number;
        /** Contracted after `through`, to the end of each active project (open-ended ones to `horizon`). */
        backlogMyr: number;
        /** YYYY-MM the chart ends; open-ended retainers are counted to here. */
        horizon: string;
        openEnded: number;
    };
    ageing: { buckets: AgeBucket[]; totalMyr: number; count: number };
    margin: {
        rows: MarginRow[];
        /** People whose hours count as RM 0 because they have no cost rate. */
        unrated: string[];
        /** YYYY-MM-DD other costs are counted to. */
        costsThrough: string;
    };
    clients: ClientMoneyRow[];
};

const norm = (s: string) => s.trim().toLowerCase();
const round = (n: number) => Math.round(n * 100) / 100;
const sum = <T>(list: T[], f: (x: T) => number) => round(list.reduce((s, x) => s + f(x), 0));
const ym = (d: string | null | undefined) => (d ? d.slice(0, 7) : "");
const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

const cash = (i: Invoice) => computeTotals(i).total;
const net = (i: Invoice) => computeTotals(i).subtotal;

/** The first month a project bills: its start, else the day it was signed or created. */
function startMonth(c: Contract): string {
    return ym(c.startDate || c.signedAt || c.createdAt);
}

/**
 * What a project is contracted to bill in each month, by its cadence:
 * monthly → the monthly amount every month of the term (open-ended runs to
 * `horizon`; a retainer entered with only a total and an end date is spread
 * evenly over it); one-off → the value in the start month.
 */
export function contractedByMonth(c: Contract, horizon: string): Map<string, number> {
    const out = new Map<string, number>();
    const add = (month: string, v: number) => {
        if (month && v > 0) out.set(month, (out.get(month) ?? 0) + v);
    };
    const start = startMonth(c);
    const value = c.valueMyr || 0;
    if (c.billing.cadence === "monthly") {
        const months = monthsBetween(start, c.endDate ? ym(c.endDate) : horizon);
        const per = c.billing.amountMyr || (c.endDate && months.length ? value / months.length : 0);
        for (const m of months) add(m, per);
    } else {
        add(start, value || c.billing.amountMyr);
    }
    return out;
}

function marginHealth(pct: number | null, cost: number): Health {
    if (pct === null) return cost > 0 ? "red" : "amber";
    if (pct >= MARGIN_GOOD_PCT) return "green";
    if (pct >= MARGIN_WATCH_PCT) return "amber";
    return "red";
}

/** All time's chart: the first month with a committed project or a live invoice, to CHART_AHEAD past today. */
function allTimeMonths(committed: Contract[], live: Invoice[], current: string): string[] {
    const starts = [...committed.map(startMonth), ...live.flatMap((i) => [ym(i.issueDate), ym(i.paidAt)])].filter(isYm).sort();
    const first = starts[0];
    const end = addMonths(current, CHART_AHEAD);
    return first && first <= current ? monthsBetween(first, end) : monthsAround(current, CHART_BACK, CHART_AHEAD);
}

export function buildMoneySnapshot(input: MoneyInput): MoneySnapshot {
    const { invoices, contracts, clients, works, team, today, month, current } = input;
    const allTime = month === ALL_TIME;
    // "To date" runs through the picked month; under All time, through today.
    const through = allTime ? current : month;
    const costsThrough = allTime ? today : monthEnd(month);
    const isCurrent = month === current;
    const when = allTime ? "yet" : isCurrent ? "this month" : monthShort(month);
    const inScope = (d: string | null | undefined) => (allTime ? Boolean(ym(d)) : ym(d) === month);

    // Invoices: void ones never count; drafts are not billed yet.
    const live = invoices.filter((i) => i.status !== "void");
    const issued = live.filter((i) => i.status !== "draft");
    const drafts = live.filter((i) => i.status === "draft");
    const unpaid = issued.filter((i) => i.status === "sent" || i.status === "overdue");
    const daysLate = (i: Invoice) => (i.status === "overdue" ? Math.max(1, daysSince(i.dueDate, today)) : daysSince(i.dueDate, today));
    const isLate = (i: Invoice) => daysLate(i) > 0;
    const overdue = unpaid.filter(isLate);
    const dueUntil = shiftYmd(today, DUE_WINDOW_DAYS);
    const dueSoon = unpaid.filter((i) => !isLate(i) && i.dueDate <= dueUntil);
    const billedMonth = issued.filter((i) => inScope(i.issueDate));
    const collectedMonth = live.filter((i) => i.status === "paid" && inScope(i.paidAt));

    // Projects: a cancelled or still-draft project is not a commitment.
    const committed = contracts.filter((c) => c.status !== "cancelled" && c.status !== "draft");
    const active = contracts.filter((c) => c.status === "active");
    const retainers = active.filter((c) => c.billing.cadence === "monthly");
    const mrr = sum(retainers, (c) => c.billing.amountMyr || 0);
    const toSign = contracts.filter((c) => c.status !== "cancelled" && c.stage === "created");
    const toSignMyr = sum(toSign, (c) => c.valueMyr || 0);

    const tiles: Tile[] = [
        {
            key: "billed",
            label: allTime ? "Billed · all time" : isCurrent ? "Billed this month" : `Billed · ${monthShort(month)}`,
            value: fmtMyrShort(sum(billedMonth, cash)),
            hint: billedMonth.length ? `${n(billedMonth.length, "invoice")} issued` : `nothing issued ${when}`,
            health: "green",
            href: "/invoices",
            count: billedMonth.length,
        },
        {
            key: "collected",
            label: allTime ? "Collected · all time" : isCurrent ? "Collected this month" : `Collected · ${monthShort(month)}`,
            value: fmtMyrShort(sum(collectedMonth, cash)),
            hint: collectedMonth.length ? n(collectedMonth.length, "receipt") : `nothing paid ${when}`,
            health: "green",
            href: "/invoices",
            count: collectedMonth.length,
        },
        {
            key: "overdue",
            label: "Overdue",
            value: fmtMyrShort(sum(overdue, cash)),
            hint: overdue.length ? `${n(overdue.length, "invoice")} past due` : "nothing past due",
            health: overdue.length ? "red" : "green",
            href: "/invoices",
            count: overdue.length,
        },
        {
            key: "due-soon",
            label: `Due in ${DUE_WINDOW_DAYS} days`,
            value: fmtMyrShort(sum(dueSoon, cash)),
            hint: dueSoon.length ? `${n(dueSoon.length, "invoice")} falling due` : "nothing falling due",
            health: dueSoon.length ? "amber" : "green",
            href: "/invoices",
            count: dueSoon.length,
        },
        {
            key: "mrr",
            label: "MRR",
            value: fmtMyrShort(mrr),
            hint: retainers.length ? `${n(retainers.length, "retainer")} a month` : "no retainers",
            health: "green",
            href: "/projects",
            count: retainers.length,
        },
        {
            key: "drafts",
            label: "Drafts waiting",
            value: String(drafts.length),
            hint: drafts.length ? `${fmtMyrShort(sum(drafts, cash))} to issue` : "no drafts",
            health: drafts.length ? "amber" : "green",
            href: "/invoices",
            count: drafts.length,
        },
        {
            key: "to-sign",
            label: "To sign",
            value: fmtMyrShort(toSignMyr),
            hint: toSign.length ? `${n(toSign.length, "account")} unsigned` : "all signed",
            health: toSign.length ? "amber" : "green",
            href: "/projects?stage=created",
            count: toSign.length,
        },
    ];

    // Contracted vs billed vs collected, with the gap behind and the backlog ahead.
    const months = allTime ? allTimeMonths(committed, live, current) : monthsAround(month, CHART_BACK, CHART_AHEAD);
    const horizon = months[months.length - 1];
    const schedule = new Map(committed.map((c) => [c.id, contractedByMonth(c, horizon)]));
    const contractedIn = (c: Contract, test: (m: string) => boolean) => {
        let total = 0;
        for (const [m, v] of schedule.get(c.id) ?? []) if (test(m)) total += v;
        return total;
    };
    const points: MoneyPoint[] = months.map((m, i) => {
        const future = m > current;
        const contracted = round(committed.reduce((s, c) => s + (schedule.get(c.id)?.get(m) ?? 0), 0));
        return {
            month: m,
            label: axisLabel(months, i),
            // Nothing can be billed or paid in a month that has not happened: leave those lines off.
            values: future
                ? { contracted }
                : {
                      contracted,
                      billed: sum(issued.filter((x) => ym(x.issueDate) === m), net),
                      collected: sum(live.filter((x) => x.status === "paid" && ym(x.paidAt) === m), net),
                  },
            future,
        };
    });
    const billedToDate = (c: Contract) => sum(issued.filter((i) => i.contractId === c.id && ym(i.issueDate) <= through), net);
    const notBilledMyr = round(committed.reduce((s, c) => s + Math.max(0, contractedIn(c, (m) => m <= through) - billedToDate(c)), 0));
    const backlogMyr = round(active.reduce((s, c) => s + contractedIn(c, (m) => m > through), 0));
    const openEnded = active.filter((c) => !c.endDate && c.billing.cadence === "monthly").length;

    // Receivables ageing at today.
    const bands: Array<{ key: string; label: string; tone: AgeTone; test: (d: number) => boolean }> = [
        { key: "current", label: "Not yet due", tone: "green", test: (d) => d <= 0 },
        { key: "d30", label: "1–30 days late", tone: "amber", test: (d) => d >= 1 && d <= 30 },
        { key: "d60", label: "31–60 days late", tone: "red", test: (d) => d >= 31 && d <= 60 },
        { key: "d60plus", label: "Over 60 days late", tone: "red", test: (d) => d > 60 },
    ];
    const buckets: AgeBucket[] = bands.map((b) => {
        const list = unpaid.filter((i) => b.test(daysLate(i)));
        return { key: b.key, label: b.label, myr: sum(list, cash), count: list.length, tone: b.tone };
    });

    // Margin by project: revenue to date − planned hours × cost rate − other costs to date.
    // A month reads the projects running now; All time adds the finished ones.
    const rate = new Map(team.map((m) => [norm(m.name), m.costRateMyr || 0]));
    const unrated = new Set<string>();
    const marginRows: MarginRow[] = (allTime ? committed : active).map((c) => {
        const billed = billedToDate(c);
        const estimated = billed <= 0;
        const revenue = estimated ? round(contractedIn(c, (m) => m <= through)) : billed;
        let people = 0;
        let hours = 0;
        for (const w of works) {
            if (w.contractId !== c.id || w.month > through) continue;
            for (const s of w.split) {
                const h = s.hours || 0;
                if (h <= 0) continue;
                hours += h;
                const r = s.member ? (rate.get(norm(s.member)) ?? 0) : 0;
                if (r > 0) people += h * r;
                else if (s.member) unrated.add(s.member);
            }
        }
        people = Math.round(people);
        const other = round(costsTotal(c.costs ?? [], costsThrough));
        const margin = round(revenue - people - other);
        const pct = revenue > 0 ? Math.round((margin / revenue) * 100) : null;
        return {
            id: c.id,
            code: c.code,
            name: c.name,
            clientName: c.clientName,
            revenueMyr: revenue,
            estimated: estimated && revenue > 0,
            peopleMyr: people,
            otherMyr: other,
            hours: round(hours),
            marginMyr: margin,
            marginPct: pct,
            health: marginHealth(pct, people + other),
            href: `/projects/${c.id}?tab=money`,
        };
    });
    // Problems first: thinnest margin at the top; projects with nothing to say yet at the bottom.
    const rank = (r: MarginRow) => (r.marginPct === null ? (r.peopleMyr + r.otherMyr > 0 ? -1000 : 1000) : r.marginPct);
    marginRows.sort((a, b) => rank(a) - rank(b) || b.revenueMyr - a.revenueMyr);

    // By client: every real client with money moving this year (every year under All time) or still owed.
    const year = through.slice(0, 4);
    const billedCounts = (i: Invoice) => i.status !== "draft" && (allTime || (i.issueDate.startsWith(year) && ym(i.issueDate) <= month));
    const clientRows: ClientMoneyRow[] = [];
    for (const cl of clients) {
        const key = norm(cl.name);
        const mine = live.filter((i) => norm(i.clientName) === key);
        const open = mine.filter((i) => i.status === "sent" || i.status === "overdue");
        const row: ClientMoneyRow = {
            id: cl.id,
            name: cl.name,
            billedMyr: sum(mine.filter(billedCounts), net),
            outstandingMyr: sum(open, cash),
            overdueMyr: sum(open.filter(isLate), cash),
            mrrMyr: clientMonthlyMyr(cl.name, contracts),
            href: `/settings/clients/${cl.id}`,
        };
        if (row.billedMyr || row.outstandingMyr || row.mrrMyr) clientRows.push(row);
    }
    clientRows.sort((a, b) => b.outstandingMyr - a.outstandingMyr || b.billedMyr - a.billedMyr || a.name.localeCompare(b.name));

    return {
        through,
        allTime,
        tiles,
        chart: { points, notBilledMyr, backlogMyr, horizon, openEnded },
        ageing: { buckets, totalMyr: sum(unpaid, cash), count: unpaid.length },
        margin: { rows: marginRows, unrated: [...unrated].sort(), costsThrough },
        clients: clientRows,
    };
}
