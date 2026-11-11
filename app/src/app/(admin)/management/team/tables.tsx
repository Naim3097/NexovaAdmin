/**
 * The People and Upcoming months tables, shared by the Team detail page and
 * the Dashboard's Team tab. Server components — no state.
 */
import Link from "next/link";
import { WORK_DAY_LABEL, fmtHours, workingDaysInMonth } from "@/lib/capacity/helpers";
import { NON_DELIVERY_ROLES, type Health, type Horizon, type MemberLoad, type MonthCell } from "@/lib/management/metrics";
import { monthLabel } from "@/lib/works/helpers";
import { cn } from "@/lib/utils";
import { HEALTH_TEXT, HealthDot, LoadDot, monthHref, plural, shortMonthLabel } from "../ui";

export const TEAM_PATH = "/management/team";

/** "−12h" for negative hours, "12h" otherwise (fmtHours alone clamps negatives to 0h). */
export function fmtSigned(h: number): string {
    return h < 0 ? `−${fmtHours(-h)}` : fmtHours(h);
}

/** "December" for a YYYY-MM. */
export function monthName(ym: string): string {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-MY", { month: "long", timeZone: "UTC" });
}

/** The one thing to do for a person, worst first, and the colour that goes with it. */
export function personNext(m: MemberLoad, month: string): { health: Health; next: string; href: string } {
    const worksHref = `/works?member=${encodeURIComponent(m.name)}`;
    if (m.overdue > 0) {
        return {
            health: "red",
            next: `Clear ${m.overdue} overdue`,
            href: m.overdueTasks > 0 ? `${worksHref}&overdue=1` : `/management/work#member-${encodeURIComponent(m.name)}`,
        };
    }
    if (m.overloaded) return { health: "red", next: `Rebalance ${fmtHours(-m.freeHours)}`, href: `${worksHref}&month=${month}` };
    if (m.awaitingApproval > 0) return { health: "amber", next: `Approve ${m.awaitingApproval}`, href: `${worksHref}&approval=1` };
    if (m.outOfRole > 0) return { health: "amber", next: `Check ${m.outOfRole} off-role`, href: `${TEAM_PATH}#off-role` };
    if (m.band === "idle" && m.openTasks === 0 && !NON_DELIVERY_ROLES.has(m.role)) {
        return { health: "amber", next: `Plan ${monthName(month)}`, href: `${worksHref}&month=${month}` };
    }
    if (m.band === "heavy") return { health: "amber", next: "Hold new work", href: `${worksHref}&month=${month}` };
    if (m.nextDue) return { health: "green", next: `Next due ${m.nextDue}`, href: `${worksHref}&month=${month}` };
    return { health: "green", next: "Nothing due", href: `${worksHref}&month=${month}` };
}

const TH = "py-2 pr-3 font-medium";
const NUM = "py-2 pr-3 text-right tabular-nums whitespace-nowrap";

/** Name · Job · Planned / Available · Free · Off-day · dot · Next. Heaviest first. */
export function PeopleTable({ members, month }: { members: MemberLoad[]; month: string }) {
    return (
        <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[44rem] text-sm">
                <thead>
                    <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        <th scope="col" className={TH}>
                            Person
                        </th>
                        <th scope="col" className={TH}>
                            Job
                        </th>
                        <th scope="col" className={cn(TH, "text-right")} title="Hours on tasks due in the month / hours available">
                            Planned / available
                        </th>
                        <th scope="col" className={cn(TH, "text-right")} title="Available − planned">
                            Free
                        </th>
                        <th scope="col" className={cn(TH, "text-right")} title="Of planned, the hours on tasks due on a Friday, Saturday or Sunday">
                            Off-day
                        </th>
                        <th scope="col" className="py-2 pr-3">
                            <span className="sr-only">Status</span>
                        </th>
                        <th scope="col" className="py-2 font-medium">
                            Next
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {members.map((m) => {
                        const n = personNext(m, month);
                        return (
                            <tr key={m.id}>
                                <td className="py-2 pr-3 align-middle">
                                    <Link href={`/works?member=${encodeURIComponent(m.name)}&month=${month}`} className="font-medium hover:underline">
                                        {m.name}
                                    </Link>
                                </td>
                                <td className="py-2 pr-3 align-middle text-muted-foreground">{m.role}</td>
                                <td className={NUM}>
                                    <span className={cn("font-medium", m.overloaded && HEALTH_TEXT.red)}>{fmtHours(m.plannedHours)}</span>
                                    <span className="text-muted-foreground"> / {fmtHours(m.availableHours)}</span>
                                    <span className="ml-1.5 text-xs text-muted-foreground">{m.pct > 999 ? "∞" : `${m.pct}%`}</span>
                                </td>
                                <td className={cn(NUM, m.freeHours < 0 ? cn("font-medium", HEALTH_TEXT.red) : m.freeHours === 0 ? HEALTH_TEXT.amber : "")}>
                                    {fmtSigned(m.freeHours)}
                                </td>
                                <td className={cn(NUM, m.offDayHours > 0 ? cn("font-medium", HEALTH_TEXT.amber) : "text-muted-foreground/60")} title={m.offDayHours > 0 ? "Hours on tasks due Fri–Sun; counted in planned" : "No tasks due on an off day"}>
                                    {m.offDayHours > 0 ? fmtHours(m.offDayHours) : "—"}
                                </td>
                                <td className="py-2 pr-3 align-middle">
                                    <HealthDot health={n.health} />
                                </td>
                                <td className="py-2 align-middle">
                                    <Link href={n.href} className={cn("whitespace-nowrap hover:underline", n.health === "green" ? "text-muted-foreground" : "font-medium")}>
                                        {n.next}
                                    </Link>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

/** One "planned / available" cell of the upcoming-months table. */
function HorizonCell({ c, href, active }: { c: MonthCell; href: string; active: boolean }) {
    const title = `${shortMonthLabel(c.month)} · ${fmtHours(c.planned)} planned of ${fmtHours(c.available)} available · ${plural(c.tasks, "task")}${c.available > 0 ? ` · ${c.pct > 999 ? "∞" : `${c.pct}%`}` : ""}`;
    return (
        <td className={cn("whitespace-nowrap py-2 pr-3 align-middle tabular-nums", active && "bg-primary/5")}>
            <Link href={href} title={title} className="inline-flex items-center gap-1.5 hover:underline">
                <LoadDot pct={c.pct} tasks={c.tasks} />
                <span className={cn("font-medium", c.overloaded ? HEALTH_TEXT.red : c.tasks === 0 ? "text-muted-foreground" : "text-foreground")}>
                    {fmtHours(c.planned)}
                </span>
                <span className="text-muted-foreground">/ {fmtHours(c.available)}</span>
            </Link>
        </td>
    );
}

/**
 * Planning view: planned / available per person for the chosen month and
 * the next three. The column headers switch the page to that month;
 * `hrefForMonth` builds that link (default: the Team detail page).
 */
export function HorizonTable({
    h,
    selected,
    today,
    hrefForMonth,
}: {
    h: Horizon;
    selected: string;
    today: string;
    hrefForMonth?: (month: string) => string;
}) {
    const current = today.slice(0, 7);
    const monthLink = hrefForMonth ?? ((m: string) => monthHref(TEAM_PATH, m, current));
    return (
        <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[44rem] text-sm">
                <thead>
                    <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        <th scope="col" className="py-2 pr-3 font-medium">
                            Person
                        </th>
                        {h.months.map((m) => {
                            const active = m === selected;
                            return (
                                <th key={m} scope="col" className="py-1 pr-3 font-medium">
                                    <Link
                                        href={monthLink(m)}
                                        scroll={false}
                                        aria-current={active ? "true" : undefined}
                                        title={active ? `Showing ${monthLabel(m)}` : `Switch the page to ${monthLabel(m)}`}
                                        className={cn(
                                            "inline-flex items-center gap-1 rounded-md px-1.5 py-1 normal-case tracking-normal transition-colors hover:bg-accent hover:text-foreground",
                                            active ? "bg-primary/10 font-semibold text-foreground" : "",
                                        )}
                                    >
                                        {shortMonthLabel(m)}
                                        {m === current ? <span className="rounded-sm bg-muted px-1 text-[10px] uppercase leading-4 text-foreground">now</span> : null}
                                    </Link>
                                    <span className="block px-1.5 pb-1 text-[10px] font-normal normal-case tracking-normal text-muted-foreground tabular-nums" title={`${WORK_DAY_LABEL} days in ${monthLabel(m)}`}>
                                        {workingDaysInMonth(m)} working days
                                    </span>
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {h.members.map((row) => (
                        <tr key={row.id}>
                            <td className="py-2 pr-3 align-middle">
                                <span className="font-medium">{row.name}</span> <span className="text-xs text-muted-foreground">{row.role}</span>
                            </td>
                            {row.cells.map((c) => (
                                <HorizonCell key={c.month} c={c} active={c.month === selected} href={`/works?member=${encodeURIComponent(row.name)}&month=${c.month}`} />
                            ))}
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr className="border-t">
                        <td className="py-2 pr-3 align-middle font-semibold">Team</td>
                        {h.team.map((c) => (
                            <HorizonCell key={c.month} c={c} active={c.month === selected} href={`/works?month=${c.month}`} />
                        ))}
                    </tr>
                </tfoot>
            </table>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                    <LoadDot pct={50} tasks={1} /> under 85%
                </span>
                <span className="inline-flex items-center gap-1">
                    <LoadDot pct={90} tasks={1} /> 85–100%
                </span>
                <span className="inline-flex items-center gap-1">
                    <LoadDot pct={120} tasks={1} /> over
                </span>
                <span className="inline-flex items-center gap-1">
                    <LoadDot pct={0} tasks={0} /> nothing planned
                </span>
            </p>
        </div>
    );
}

/** Legend line under the People table: the capacity formula and what the off-day column means. */
export function HoursLegend() {
    return (
        <p className="mt-2 text-[11px] text-muted-foreground">
            Available = (hours/week − set aside) ÷ 4 working days × working days in the month ({WORK_DAY_LABEL}) · Planned = hours on the tasks due in the
            month · Free = available − planned. Tasks due Fri–Sun still count and are shown as off-day work.
        </p>
    );
}
