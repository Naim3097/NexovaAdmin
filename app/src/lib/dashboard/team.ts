/**
 * The Team tab's maths: the hours the team has planned against the hours it
 * has, who is over or under, days off, non-delivery hours, the month after
 * and the outlook. Pure functions over the team and the tasks; the view only
 * renders what comes back. Hours are planned per task share — nobody tracks
 * actual time — so every figure here is a plan, never a timesheet.
 *
 * Who counts: active members with the delivery duty. Business support people
 * carry only the finance duty, so they are never delivery capacity (checked on
 * the category too, in case an admin ticked delivery for one). Every project
 * counts, internal ones included, because the hours are real either way.
 *
 * All time (`month` = ALL_TIME): the whole planning horizon, every month from
 * the earliest task to the latest, summed — planned against available, load
 * per person, days off and hours by type over that span; the outlook shows
 * every month in it.
 */
import type { Tile } from "@/app/(admin)/dashboard/tiles";
import type { TeamMember } from "@/lib/data/team";
import type { Work } from "@/lib/data/works";
import { fmtHours, monthlyAvailable, shareHours, taskHours } from "@/lib/capacity/helpers";
import { ALL_TIME, isYm, monthYear, monthShort, monthsAround, monthsBetween } from "@/lib/dashboard/data";
import { addMonths, loadBand, loadPct, type Health, type LoadBand } from "@/lib/management/metrics";
import { LINE_TYPES, type LineType } from "@/lib/planners/vocab";
import { hasFunction } from "@/lib/roles";
import { roundHours, setAsideWeekly } from "@/lib/team/hours";
import { isOverdue } from "@/lib/works/helpers";

/** Team load up to here is comfortable; up to 100 % is full; over it is red. */
export const TEAM_FULL_PCT = 85;
/** A person with less than this share of their hours planned is under-used. */
export const UNDER_USED_PCT = 60;
/** Months the outlook shows: one before the chosen month and two after it. */
export const OUTLOOK_BACK = 2;
export const OUTLOOK_AHEAD = 2;

/** Task types in plain words, for the Hours by task type bars. */
export const TYPE_LABEL: Record<LineType, string> = {
    campaign: "Campaigns",
    static: "Static images",
    video: "Videos",
    seo: "SEO",
    website: "Website",
    custom: "Other",
};

export type TeamPerson = {
    id: string;
    name: string;
    role: string;
    /** Hours available in the month (summed over the span under All time), days off already taken out. */
    available: number;
    /** Hours on the shares this person holds on tasks in the month (or the span). */
    planned: number;
    /** planned / available × 100 (999 when hours are planned but none are available). */
    pct: number;
    band: LoadBand;
    /** Tasks in the month (or the span) this person holds a share of. */
    tasks: number;
    /** Open tasks past their due date this person holds a share of, any month. */
    overdue: number;
    /** Days off in the month (or the span). */
    daysOff: number;
    /** Non-delivery hours a week: work that leaves no task behind (management, sales, onboarding…). */
    nonDeliveryWeekly: number;
    over: boolean;
    under: boolean;
    href: string;
};

/** The team's hours in one month. */
export type MonthHours = {
    /** YYYY-MM. */
    month: string;
    planned: number;
    available: number;
    pct: number;
    /** After the current month: drawn hollow. */
    future: boolean;
};

export type TypeHours = {
    type: LineType;
    label: string;
    /** Hours on every share of the month's tasks of this type, open seats included. */
    hours: number;
    tasks: number;
};

export type TeamSnapshot = {
    /** YYYY-MM the figures are read for, or ALL_TIME. */
    month: string;
    allTime: boolean;
    /** The months summed: the picked one, or every month from the first task to the last under All time. */
    span: string[];
    /** Heaviest first. */
    people: TeamPerson[];
    planned: number;
    available: number;
    pct: number;
    /** Hours on the month's shares that nobody counted here holds: open seats, inactive or non-delivery names. */
    unheld: number;
    /** People over 100 % of their hours. */
    over: number;
    /** People under UNDER_USED_PCT with hours to give. */
    under: number;
    daysOff: { days: number; people: number };
    /** Non-delivery hours a week across the team, and the team's weekly hours they come out of. */
    nonDelivery: { hours: number; weekly: number };
    next: MonthHours;
    /** Biggest first; types with nothing planned are left out. */
    byType: TypeHours[];
    /** OUTLOOK_BACK − 1 months before `month` to OUTLOOK_AHEAD after it; every month of the span under All time. */
    outlook: MonthHours[];
};

/** Green up to TEAM_FULL_PCT, amber up to 100, red over. */
export function loadHealth(pct: number): Health {
    return pct > 100 ? "red" : pct > TEAM_FULL_PCT ? "amber" : "green";
}

/** "68%", or "∞" when hours are planned against none available. */
export function pctLabel(pct: number): string {
    return pct >= 999 ? "∞" : `${pct}%`;
}

/** "412" — hours without the unit, for "412 / 560 h". */
function bare(hours: number): string {
    return fmtHours(hours).replace(/h$/, "");
}

function plural(n: number, one: string, many = `${one}s`): string {
    return `${n} ${n === 1 ? one : many}`;
}

/** The planning horizon: every month from the earliest task month to the latest; this month when there are no tasks. */
export function planningSpan(works: Work[], current: string): string[] {
    const months = works.map((w) => w.month).filter(isYm).sort();
    return months.length ? monthsBetween(months[0], months[months.length - 1]) : [current];
}

/** "Mar 2026 – Feb 2027", or the one month. */
export function spanLabel(span: string[]): string {
    if (span.length === 0) return "";
    const first = monthYear(span[0]);
    return span.length === 1 ? first : `${first} – ${monthYear(span[span.length - 1])}`;
}

/** The team's planned and available hours in one month. */
function teamHours(people: TeamMember[], works: Work[], month: string, current: string): MonthHours {
    const inMonth = works.filter((w) => w.month === month);
    const planned = roundHours(people.reduce((sum, m) => sum + inMonth.reduce((t, w) => t + shareHours(w, m.name), 0), 0));
    const available = roundHours(people.reduce((sum, m) => sum + monthlyAvailable(m, month), 0));
    return { month, planned, available, pct: loadPct(planned, available), future: month > current };
}

export function buildTeamSnapshot(input: {
    team: TeamMember[];
    works: Work[];
    /** YYYY-MM the figures are read for, or ALL_TIME. */
    month: string;
    /** YYYY-MM of today, so later months draw hollow. */
    current: string;
    /** YYYY-MM-DD, for overdue. */
    today: string;
}): TeamSnapshot {
    const { team, works, month, current, today } = input;
    const allTime = month === ALL_TIME;
    const people = team.filter((m) => m.active && hasFunction(m, "delivery") && m.category !== "business_support");
    const span = allTime ? planningSpan(works, current) : [month];
    const inSpan = new Set(span);
    // "The month's tasks": every task in the span (one month, or the whole horizon).
    const monthWorks = works.filter((w) => inSpan.has(w.month));
    const overdueWorks = works.filter((w) => isOverdue(w, today));
    const offIn = (m: TeamMember) => span.reduce((sum, ym) => sum + (m.daysOff[ym] ?? 0), 0);

    const rows: TeamPerson[] = people
        .map((m) => {
            const mine = monthWorks.filter((w) => shareHours(w, m.name) > 0);
            const planned = roundHours(mine.reduce((sum, w) => sum + shareHours(w, m.name), 0));
            const available = roundHours(span.reduce((sum, ym) => sum + monthlyAvailable(m, ym), 0));
            const pct = loadPct(planned, available);
            return {
                id: m.id,
                name: m.name,
                role: m.role,
                available,
                planned,
                pct,
                band: loadBand(pct),
                tasks: mine.length,
                overdue: overdueWorks.filter((w) => shareHours(w, m.name) > 0).length,
                daysOff: offIn(m),
                nonDeliveryWeekly: setAsideWeekly(m),
                over: available > 0 ? planned > available : planned > 0,
                under: available > 0 && pct < UNDER_USED_PCT,
                href: `/team/${m.id}`,
            };
        })
        .sort((a, b) => b.pct - a.pct || b.planned - a.planned || a.name.localeCompare(b.name));

    // The span's months one by one: summed for the tiles, and the outlook under All time.
    const spanHours = span.map((ym) => teamHours(people, works, ym, current));
    const planned = roundHours(spanHours.reduce((sum, h) => sum + h.planned, 0));
    const available = roundHours(spanHours.reduce((sum, h) => sum + h.available, 0));
    const allShares = roundHours(monthWorks.reduce((sum, w) => sum + taskHours(w), 0));

    const byType: TypeHours[] = LINE_TYPES.map((type) => {
        const ofType = monthWorks.filter((w) => w.type === type);
        return { type, label: TYPE_LABEL[type], hours: roundHours(ofType.reduce((sum, w) => sum + taskHours(w), 0)), tasks: ofType.length };
    })
        .filter((t) => t.hours > 0)
        .sort((a, b) => b.hours - a.hours || a.label.localeCompare(b.label));

    const offPeople = people.filter((m) => offIn(m) > 0);

    return {
        month,
        allTime,
        span,
        people: rows,
        planned,
        available,
        pct: loadPct(planned, available),
        unheld: roundHours(Math.max(0, allShares - planned)),
        over: rows.filter((p) => p.over).length,
        under: rows.filter((p) => p.under).length,
        daysOff: { days: offPeople.reduce((sum, m) => sum + offIn(m), 0), people: offPeople.length },
        nonDelivery: {
            hours: roundHours(people.reduce((sum, m) => sum + setAsideWeekly(m), 0)),
            weekly: roundHours(people.reduce((sum, m) => sum + m.weeklyHours, 0)),
        },
        // The month after the picked one; under All time, the month after this one.
        next: teamHours(people, works, addMonths(allTime ? current : month, 1), current),
        byType,
        outlook: allTime ? spanHours : monthsAround(month, OUTLOOK_BACK, OUTLOOK_AHEAD).map((ym) => teamHours(people, works, ym, current)),
    };
}

/**
 * The six numbers at the top of the Team tab. `nextHref` is the dashboard
 * on the month after the chosen one, so the Next month tile switches the page.
 */
export function teamTiles(snap: TeamSnapshot, nextHref: string): Tile[] {
    const { next } = snap;
    return [
        {
            key: "load",
            label: "Planned / available",
            value: `${bare(snap.planned)} / ${bare(snap.available)} h`,
            hint: snap.allTime
                ? `${pctLabel(snap.pct)} · all time · ${plural(snap.span.length, "month")}`
                : `${pctLabel(snap.pct)} planned · ${plural(snap.people.length, "person", "people")}`,
            health: loadHealth(snap.pct),
            href: "/team",
            count: snap.planned,
        },
        {
            key: "over",
            label: "Over-used",
            value: String(snap.over),
            hint: snap.over ? "people over 100%" : "nobody over",
            health: snap.over ? "red" : "green",
            href: "/team",
            count: snap.over,
        },
        {
            key: "under",
            label: "Under-used",
            value: String(snap.under),
            hint: snap.under ? `people under ${UNDER_USED_PCT}%` : "everyone has work",
            health: snap.under ? "amber" : "green",
            href: "/team",
            count: snap.under,
        },
        {
            key: "off",
            label: "Off days",
            value: String(snap.daysOff.days),
            hint: snap.daysOff.people ? `${plural(snap.daysOff.people, "person", "people")} off` : "nobody off",
            health: "green",
            href: "/team",
            count: snap.daysOff.days,
        },
        {
            key: "non-delivery",
            label: "Non-delivery hours",
            value: `${bare(snap.nonDelivery.hours)} h/wk`,
            hint: `of ${bare(snap.nonDelivery.weekly)} h/week`,
            health: "green",
            href: "/team",
            count: snap.nonDelivery.hours,
        },
        {
            key: "next",
            label: `Next month · ${monthShort(next.month)}`,
            value: pctLabel(next.pct),
            hint: next.planned ? `${bare(next.planned)} / ${bare(next.available)} h` : "nothing planned yet",
            health: next.planned ? loadHealth(next.pct) : "amber",
            href: nextHref,
            count: next.planned,
        },
    ];
}
