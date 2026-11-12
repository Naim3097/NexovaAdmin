/**
 * Capacity helpers — pure functions, no I/O.
 *
 * The model is deliberately NOT a timesheet. Each team member keeps an
 * hours-per-task-type table on their profile; every task share they hold is
 * prefilled from it and edited only when the task ran longer. Capacity is
 * then simply: hours on the tasks due in a period vs. the hours the person
 * has available in that period. Approval / waiting time is never counted.
 */
import type { LineType } from "@/lib/planners/vocab";
import type { TeamMember } from "@/lib/data/team";
import type { Work, WorkShare } from "@/lib/data/works";
import { isHoliday } from "@/lib/calendar/holidays";
import { DEFAULT_HOURS_BY_TYPE, deliveryWeeklyHours, roundHours, setAsideWeekly } from "@/lib/team/hours";

export const HOUR_STEP = 0.25;

/**
 * The working week: Monday to Thursday (0 = Sunday … 6 = Saturday). Friday,
 * Saturday and Sunday are off days. Due dates may still fall on an off day
 * (the timeline is the client's); capacity counts working days only, and hours
 * on tasks due on an off day are tracked separately as off-day work.
 */
export const WORK_DAYS: readonly number[] = [1, 2, 3, 4];
export const WORK_DAY_LABEL = "Mon–Thu";
/** Average working days in a month, for figures that have no month (≈ 17.3). */
const AVG_WORK_DAYS_PER_MONTH = (52 / 12) * WORK_DAYS.length;

function weekday(ymd: string): number {
    return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

/** True on Friday, Saturday, Sunday and Kuala Lumpur public holidays. */
export function isOffDay(ymd: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? !WORK_DAYS.includes(weekday(ymd)) || isHoliday(ymd) : false;
}

/** Working days (Mon–Thu, public holidays out) in a month "YYYY-MM". */
export function workingDaysInMonth(month: string): number {
    const [y, m] = month.split("-").map(Number);
    if (!y || !m) return Math.round(AVG_WORK_DAYS_PER_MONTH);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    let n = 0;
    for (let d = 1; d <= days; d += 1) {
        const date = new Date(Date.UTC(y, m - 1, d));
        if (WORK_DAYS.includes(date.getUTCDay()) && !isHoliday(date.toISOString().slice(0, 10))) n += 1;
    }
    return n;
}

/**
 * The nearest working day to `ymd` inside its month: earlier first, forward
 * when stepping back would leave the month. Used when generating due dates.
 */
export function nearestWorkingDay(ymd: string): string {
    if (!isOffDay(ymd)) return ymd;
    const month = ymd.slice(0, 7);
    const shift = (s: string, n: number) => {
        const d = new Date(`${s}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + n);
        return d.toISOString().slice(0, 10);
    };
    let back = ymd;
    for (let i = 0; i < 4; i += 1) {
        back = shift(back, -1);
        if (back.slice(0, 7) !== month) break;
        if (!isOffDay(back)) return back;
    }
    let fwd = ymd;
    for (let i = 0; i < 4; i += 1) {
        fwd = shift(fwd, 1);
        if (!isOffDay(fwd)) return fwd;
    }
    return ymd;
}

/**
 * Hours as a plain decimal: "1.25h", "36.5h", "173h", "1,295h". Quarter steps
 * stay exact below 10h; one decimal up to 100h; whole hours above.
 */
export function fmtHours(h: number): string {
    const n = roundHours(h);
    if (n <= 0) return "0h";
    if (n < 10) return `${Number(n.toFixed(2))}h`;
    if (n < 100) return `${Number(n.toFixed(1))}h`;
    return `${Math.round(n).toLocaleString("en-MY")}h`;
}

/** Hours this member needs for one task of `type` — their own table, else the default. */
export function hoursFor(member: Pick<TeamMember, "hoursByType"> | undefined | null, type: LineType): number {
    const own = member?.hoursByType?.[type];
    return own && own > 0 ? own : DEFAULT_HOURS_BY_TYPE[type];
}

export function findMember(team: TeamMember[], name: string): TeamMember | undefined {
    const key = name.trim().toLowerCase();
    return key ? team.find((m) => m.name.trim().toLowerCase() === key) : undefined;
}

/**
 * Fill in `hours` on every share that has none (0), from the holder's profile
 * table or the type default. Shares that already carry hours are left alone,
 * so a manual edit survives a re-split.
 */
export function withHours(split: Array<Omit<WorkShare, "hours"> & { hours?: number }>, team: TeamMember[], type: LineType): WorkShare[] {
    return split.map((s) => ({
        seat: s.seat,
        member: s.member,
        pct: s.pct,
        hours: s.hours && s.hours > 0 ? roundHours(s.hours) : hoursFor(findMember(team, s.member), type),
    }));
}

/** Hours `member` carries on one task (0 when they hold no share). */
export function shareHours(w: Pick<Work, "split">, member: string): number {
    const key = member.trim().toLowerCase();
    return w.split.filter((s) => s.member.trim().toLowerCase() === key).reduce((sum, s) => sum + (s.hours || 0), 0);
}

/** Total planned hours on a task across everyone. */
export function taskHours(w: Pick<Work, "split">): number {
    return w.split.reduce((sum, s) => sum + (s.hours || 0), 0);
}

/** Working days in `month`, or the yearly average when no month is given. */
function workDays(month?: string): number {
    return month ? workingDaysInMonth(month) : AVG_WORK_DAYS_PER_MONTH;
}

/**
 * Delivery hours available in a month: (hours/week − set aside) spread over
 * the four working days, times the working days that month actually has,
 * less the days the person is off that month.
 */
export function monthlyAvailable(member: Pick<TeamMember, "weeklyHours" | "setAside"> & { daysOff?: Record<string, number> }, month?: string): number {
    const perDay = deliveryWeeklyHours(member) / WORK_DAYS.length;
    const off = month ? (member.daysOff?.[month] ?? 0) : 0;
    return Math.round(perDay * Math.max(0, workDays(month) - off) * 4) / 4;
}

/** Hours per month the set-aside rows take (for the overhead view). */
export function monthlyReserved(member: Pick<TeamMember, "setAside">, month?: string): number {
    const weekly = setAsideWeekly(member);
    return Math.round((weekly / WORK_DAYS.length) * workDays(month) * 4) / 4;
}

/** Hours `member` carries on tasks planned for an off day in `month` (work scheduled outside Mon–Thu). */
export function offDayHours(member: Pick<TeamMember, "name">, works: Work[], month: string): number {
    return roundHours(
        works
            .filter((w) => w.month === month && isOffDay(w.plannedDate || w.dueDate))
            .reduce((sum, w) => sum + shareHours(w, member.name), 0),
    );
}

export type Load = {
    /** Hours on every task due in the period (the month's plan). */
    planned: number;
    /** Hours on tasks not yet completed. */
    remaining: number;
    /** Hours on completed tasks. */
    done: number;
    available: number;
    /** planned / available, 0–∞ (1 = exactly full). */
    ratio: number;
    overloaded: boolean;
    /** Tasks counted. */
    tasks: number;
    /** Of `planned`, the hours on tasks due on an off day (Fri–Sun): work on off days. */
    offDay: number;
    /** Working days (Mon–Thu) in the month. */
    workingDays: number;
};

/** Load for one member in one month (tasks by `month`). */
export function loadFor(member: TeamMember, works: Work[], month: string): Load {
    const mine = works.filter((w) => w.month === month && shareHours(w, member.name) > 0);
    let planned = 0;
    let done = 0;
    let offDay = 0;
    for (const w of mine) {
        const h = shareHours(w, member.name);
        planned += h;
        if (w.status === "completed") done += h;
        if (isOffDay(w.plannedDate || w.dueDate)) offDay += h;
    }
    const available = member.active ? monthlyAvailable(member, month) : 0;
    const ratio = available > 0 ? planned / available : planned > 0 ? Infinity : 0;
    return {
        planned: roundHours(planned),
        remaining: roundHours(planned - done),
        done: roundHours(done),
        available,
        ratio,
        overloaded: available > 0 ? planned > available : planned > 0,
        tasks: mine.length,
        offDay: roundHours(offDay),
        workingDays: workingDaysInMonth(month),
    };
}

/** Load for the whole team in one month, heaviest first. */
export function teamLoad(team: TeamMember[], works: Work[], month: string): Array<{ member: TeamMember; load: Load }> {
    return team
        .filter((m) => m.active)
        .map((member) => ({ member, load: loadFor(member, works, month) }))
        .sort((a, b) => b.load.ratio - a.load.ratio);
}

/** Hours by (month → member) for a set of tasks, e.g. a contract or a proposal turned into works. */
export function hoursByMonthAndMember(works: Work[]): Map<string, Map<string, number>> {
    const out = new Map<string, Map<string, number>>();
    for (const w of works) {
        const byMember = out.get(w.month) ?? new Map<string, number>();
        for (const s of w.split) {
            const key = s.member || `(${s.seat} — unassigned)`;
            byMember.set(key, roundHours((byMember.get(key) ?? 0) + (s.hours || 0)));
        }
        out.set(w.month, byMember);
    }
    return new Map([...out.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

/** Hours by task type for a set of tasks. */
export function hoursByType(works: Work[]): Partial<Record<LineType, number>> {
    const out: Partial<Record<LineType, number>> = {};
    for (const w of works) out[w.type] = roundHours((out[w.type] ?? 0) + taskHours(w));
    return out;
}

/** Internal cost of a set of tasks from members' cost rates (0 when rates are not set). */
export function costOf(works: Work[], team: TeamMember[]): number {
    let total = 0;
    for (const w of works) {
        for (const s of w.split) {
            const m = findMember(team, s.member);
            if (m?.costRateMyr) total += (s.hours || 0) * m.costRateMyr;
        }
    }
    return Math.round(total);
}
