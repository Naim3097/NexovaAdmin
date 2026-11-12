/**
 * Team tab: the head of operations' view. Numbers first — planned against
 * available, who is over or under, days off, non-delivery hours, next month —
 * then load per person, hours by task type, the outlook (a line chart of
 * planned against available) and the people table. Hours are planned per task
 * share, never a timesheet. The Month dropdown moves every figure here; All
 * time sums the whole planning horizon, first task month to last.
 */
import Link from "next/link";
import { BarList, Legend, type BarRow, type Series, type Tone } from "@/components/bars";
import { LineChart } from "@/components/line-chart";
import { fmtHours } from "@/lib/capacity/helpers";
import { axisLabel, monthShort, type DashboardData } from "@/lib/dashboard/data";
import { buildTeamSnapshot, pctLabel, spanLabel, teamTiles, type TeamPerson } from "@/lib/dashboard/team";
import { Empty, Section, plural, shortMonthLabel } from "@/app/(admin)/management/ui";
import { TeamPeopleTable } from "@/app/(admin)/dashboard/team-detail";
import { TileGrid } from "./tile-grid";

const OUTLOOK_SERIES: Series[] = [
    { key: "planned", label: "Planned", tone: "primary" },
    { key: "available", label: "Available", tone: "muted" },
];

/** Red over 100 %, amber when full, grey when under-used, green in between. */
function loadTone(p: TeamPerson): Tone {
    if (p.over) return "red";
    if (p.band === "heavy") return "amber";
    if (p.under) return "muted";
    return "green";
}

export function TeamView({ data }: { data: DashboardData }) {
    const { team, works, month, current, today, allTime } = data;
    const snap = buildTeamSnapshot({ team, works, month, current, today });
    const tiles = teamTiles(snap, data.href({ tab: "team", month: snap.next.month }));
    const label = allTime ? "all time" : shortMonthLabel(month);
    const span = spanLabel(snap.span);
    const outlook = snap.outlook;
    const outlookMonths = outlook.map((m) => m.month);
    // /works links carry the month, except under All time where no month means every month.
    const monthQ = allTime ? "" : `&month=${month}`;

    const loadRows: BarRow[] = snap.people.map((p) => ({
        key: p.id,
        label: p.name,
        sub: `${p.role}${p.daysOff > 0 ? ` · −${plural(p.daysOff, "day")} off` : ""}`,
        value: p.pct,
        valueLabel: `${fmtHours(p.planned)} / ${fmtHours(p.available)} · ${pctLabel(p.pct)}`,
        tone: loadTone(p),
        href: p.href,
    }));

    const typeRows: BarRow[] = snap.byType.map((t) => ({
        key: t.type,
        label: t.label,
        value: t.hours,
        valueLabel: `${fmtHours(t.hours)} · ${plural(t.tasks, "task")}`,
        tone: "primary",
        href: `/works?type=${t.type}${monthQ}`,
    }));

    return (
        <>
            <TileGrid tiles={tiles} />

            <Section
                id="load"
                title={`Load per person · ${label}`}
                description={
                    allTime
                        ? `Planned hours against the hours each person has over ${span}, days off taken out. Heaviest first; click a name for their page.`
                        : "Planned hours against the hours each person has, days off taken out. Heaviest first; click a name for their page."
                }
            >
                {snap.people.length === 0 ? (
                    <Empty>
                        No active delivery people yet.{" "}
                        <Link href="/team" className="underline">
                            Add some
                        </Link>
                        .
                    </Empty>
                ) : (
                    <>
                        <BarList rows={loadRows} max={100} />
                        {snap.unheld > 0 ? (
                            <p className="mt-3 text-xs text-muted-foreground">
                                Another {fmtHours(snap.unheld)} sit on open seats or with people not counted here.{" "}
                                <Link href="/works?unassigned=1" className="underline">
                                    Assign them
                                </Link>
                                .
                            </p>
                        ) : null}
                    </>
                )}
            </Section>

            <Section
                id="types"
                title={`Hours by task type · ${label}`}
                description={`Every share on ${allTime ? "every task" : "the month's tasks"}, open seats included. Click a bar to open those tasks.`}
            >
                {typeRows.length === 0 ? <Empty>Nothing planned {allTime ? "yet" : `for ${label} yet`}.</Empty> : <BarList rows={typeRows} />}
            </Section>

            <Section
                id="outlook"
                title={allTime ? `Outlook · ${span}` : `Outlook · ${monthShort(outlook[0].month)} – ${monthShort(outlook[outlook.length - 1].month)}`}
                description="Planned hours against the hours the team has, month by month. Months after this one are dashed; click one to read the page on it."
            >
                {snap.people.length === 0 ? (
                    <Empty>No active delivery people to plan for.</Empty>
                ) : (
                    <>
                        <LineChart
                            points={outlook.map((m, i) => ({
                                key: m.month,
                                label: axisLabel(outlookMonths, i),
                                values: { planned: m.planned, available: m.available },
                                future: m.future,
                                href: data.href({ tab: "team", month: m.month }),
                            }))}
                            series={OUTLOOK_SERIES}
                            format={fmtHours}
                            label="Planned against available hours per month"
                        />
                        <Legend series={OUTLOOK_SERIES} className="mt-3" />
                    </>
                )}
            </Section>

            <Section
                id="people"
                title={`People · ${label}`}
                description={`Heaviest first. Hours are planned per month${allTime ? ` and summed over ${span}` : ""}; overdue counts open tasks past due in any month.`}
            >
                {snap.people.length === 0 ? <Empty>No active delivery people yet.</Empty> : <TeamPeopleTable people={snap.people} month={month} allTime={allTime} />}
            </Section>
        </>
    );
}
