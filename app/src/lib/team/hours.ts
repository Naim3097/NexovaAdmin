/**
 * The hours maths: default hours per task type, the working week, quarter-
 * hour rounding and the delivery hours left after what a person sets aside
 * for other work (management, onboarding, sales…). Pure, no I/O, so client
 * components can import it. The dev store re-exports it.
 */
import type { LineType } from "@/lib/planners/vocab";
import type { TeamMember } from "@/lib/dev-store/team";

/** Default working hours per task type, used when a member has not set their own. */
export const DEFAULT_HOURS_BY_TYPE: Record<LineType, number> = {
    campaign: 6,
    static: 2,
    video: 5,
    seo: 4,
    website: 8,
    custom: 2,
};
export const DEFAULT_WEEKLY_HOURS = 32;

/** Round to the quarter hour; never negative. */
export function roundHours(h: number): number {
    const n = Number(h);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 4) / 4;
}

/** Hours a week a person sets aside for work that leaves no task behind, all rows added up. */
export function setAsideWeekly(m: Pick<TeamMember, "setAside">): number {
    return roundHours((m.setAside ?? []).reduce((s, row) => s + (row.hours || 0), 0));
}

/** Hours per week left for delivery tasks after what is set aside. Never below 0. */
export function deliveryWeeklyHours(m: Pick<TeamMember, "weeklyHours" | "setAside">): number {
    return Math.max(0, roundHours((m.weeklyHours || DEFAULT_WEEKLY_HOURS) - setAsideWeekly(m)));
}
