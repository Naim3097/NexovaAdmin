/**
 * Team tab detail: the By team table (one row per job group), the People
 * table and the Upcoming months plan. Server components — no state.
 */
import Link from "next/link";
import { fmtHours } from "@/lib/capacity/helpers";
import { HORIZON_MONTHS, type ManagementSnapshot } from "@/lib/management/metrics";
import type { OverviewSnapshot, TeamRow } from "@/lib/management/overview";
import { cn } from "@/lib/utils";
import { Empty, HEALTH_TEXT, HealthDot, Section, shortMonthLabel } from "@/app/(admin)/management/ui";
import { HorizonTable, HoursLegend, PeopleTable } from "@/app/(admin)/management/team/tables";

const TH = "py-2 pr-3 font-medium";
const NUM = "py-2 pr-3 text-right tabular-nums";

function Count({ n, tone }: { n: number; tone?: "bad" | "warn" }) {
    if (n === 0) return <span className="text-muted-foreground/60">—</span>;
    return <span className={cn("font-medium", tone === "bad" ? HEALTH_TEXT.red : tone === "warn" ? HEALTH_TEXT.amber : "")}>{n}</span>;
}

/** One row per job group: who, what is due, what is late, what sits in review, hours, and the one thing to do. */
export function TeamTable({ rows }: { rows: TeamRow[] }) {
    return (
        <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[46rem] text-sm">
                <thead>
                    <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        <th scope="col" className={TH}>
                            Team
                        </th>
                        <th scope="col" className={cn(TH, "text-right")}>
                            People
                        </th>
                        <th scope="col" className={cn(TH, "text-right")} title="Open tasks due today or in the next 7 days">
                            This week
                        </th>
                        <th scope="col" className={cn(TH, "text-right")}>
                            Overdue
                        </th>
                        <th scope="col" className={cn(TH, "text-right")} title="Delivery teams: their tasks in review. Account managers: approvals waiting on them">
                            In review
                        </th>
                        <th scope="col" className={cn(TH, "text-right")} title="Hours on tasks due in the month / hours the people have">
                            Planned / available
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
                    {rows.map((r) => (
                        <tr key={r.key}>
                            <td className="py-2 pr-3 align-middle">
                                <span className="font-medium">{r.label}</span>
                                {r.names.length > 0 ? <span className="ml-1.5 text-xs text-muted-foreground">{r.names.join(", ")}</span> : null}
                            </td>
                            <td className={NUM}>
                                <Count n={r.people} />
                            </td>
                            <td className={NUM}>
                                <Count n={r.weekDue} />
                            </td>
                            <td className={NUM}>
                                <Count n={r.overdue} tone="bad" />
                            </td>
                            <td className={NUM}>
                                <Count n={r.inReview} tone={r.key === "am" ? "warn" : undefined} />
                            </td>
                            <td className={cn(NUM, "whitespace-nowrap")}>
                                <span className={cn("font-medium", r.plannedHours > r.availableHours && HEALTH_TEXT.red)}>{fmtHours(r.plannedHours)}</span>
                                <span className="text-muted-foreground"> / {fmtHours(r.availableHours)}</span>
                            </td>
                            <td className="py-2 pr-3 align-middle">
                                <HealthDot health={r.health} />
                            </td>
                            <td className="py-2 align-middle">
                                <Link href={r.href} className={cn("whitespace-nowrap hover:underline", r.health === "green" ? "text-muted-foreground" : "font-medium")}>
                                    {r.next}
                                </Link>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function TeamDetail({
    overview,
    mgmt,
    hrefForMonth,
}: {
    overview: OverviewSnapshot;
    mgmt: ManagementSnapshot;
    /** Dashboard link for a month, so the Upcoming months headers stay on this page. */
    hrefForMonth: (month: string) => string;
}) {
    const monthShort = shortMonthLabel(overview.month);
    return (
        <>
            <Section
                id="teams"
                title={`By team · ${monthShort}`}
                description="Tasks each team holds. Account managers: the tasks on their contracts and the approvals waiting on them."
                action={
                    <Link href="/management/team" className="text-xs underline">
                        Detail
                    </Link>
                }
            >
                <TeamTable rows={overview.teams} />
            </Section>

            <Section id="people" title={`People · ${monthShort}`} description="Heaviest first. Hours are planned per month.">
                {mgmt.members.length === 0 ? (
                    <Empty>
                        No active team members.{" "}
                        <Link href="/team" className="underline">
                            Add some
                        </Link>
                        .
                    </Empty>
                ) : (
                    <>
                        <PeopleTable members={mgmt.members} month={mgmt.month} />
                        <HoursLegend />
                    </>
                )}
            </Section>

            <Section
                id="plan"
                title={`Upcoming months · ${shortMonthLabel(mgmt.horizon.months[0])} – ${shortMonthLabel(mgmt.horizon.months[HORIZON_MONTHS - 1])}`}
                description="Planned / available per person. Click a month to switch the page; click a cell to open those tasks."
            >
                {mgmt.horizon.members.length === 0 ? (
                    <Empty>No active team members to plan for.</Empty>
                ) : (
                    <HorizonTable h={mgmt.horizon} selected={mgmt.month} today={mgmt.today} hrefForMonth={hrefForMonth} />
                )}
            </Section>
        </>
    );
}
