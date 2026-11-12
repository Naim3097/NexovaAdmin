/**
 * Day facts the calendars and the capacity notes share: whether a day falls
 * outside the working week (Friday to Sunday), the Kuala Lumpur public holiday
 * on it, and the "16 working days (Mon–Thu, 1 public holiday off)" wording on
 * the profile and team pages. Pure module, safe in client components.
 */
import { WORK_DAYS, WORK_DAY_LABEL, workingDaysInMonth } from "@/lib/capacity/helpers";
import { holidayName, holidaysIn, type Holiday } from "@/lib/calendar/holidays";

/** The one-line legend under every calendar grid. */
export const OFF_DAY_LEGEND = "Grey: Friday to Sunday and Kuala Lumpur public holidays. You can still plan work on them.";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type DayKind = {
    /** Outside the working week (Friday, Saturday or Sunday). */
    weekend: boolean;
    /** The public holiday's name, or "" on an ordinary day. */
    holiday: string;
    /** Weekend or holiday: the calendars grey these out. */
    off: boolean;
};

/** 0 = Sunday … 6 = Saturday, read in UTC so server and browser agree. */
function weekday(ymd: string): number {
    return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

/** What kind of day a YYYY-MM-DD is; anything that is not a date counts as an ordinary day. */
export function dayKind(ymd: string): DayKind {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return { weekend: false, holiday: "", off: false };
    const weekend = !WORK_DAYS.includes(weekday(ymd));
    const holiday = holidayName(ymd);
    return { weekend, holiday, off: weekend || Boolean(holiday) };
}

/** The holidays in a YYYY-MM that fall on a working day, so they take a day out of capacity. */
export function workdayHolidaysIn(month: string): Holiday[] {
    return holidaysIn(month).filter((h) => WORK_DAYS.includes(weekday(h.date)));
}

/**
 * "16 working days (Mon–Thu, 1 public holiday off)" for a YYYY-MM; without
 * the holiday part when none falls Monday to Thursday that month.
 */
export function workingDaysNote(month: string, days: number = workingDaysInMonth(month)): string {
    const off = workdayHolidaysIn(month).length;
    const holidays = off > 0 ? `, ${off} public holiday${off === 1 ? "" : "s"} off` : "";
    return `${days} working day${days === 1 ? "" : "s"} (${WORK_DAY_LABEL}${holidays})`;
}

/** The names of the working-day holidays in a month, for a tooltip ("Deepavali (8 Nov) · …"). */
export function workdayHolidayTitle(month: string): string {
    return workdayHolidaysIn(month)
        .map((h) => `${h.name} (${Number(h.date.slice(8))} ${MONTH_SHORT[Number(h.date.slice(5, 7)) - 1]})`)
        .join(" · ");
}
