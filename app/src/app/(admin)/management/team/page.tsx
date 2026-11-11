import Link from "next/link";
import { redirect } from "next/navigation";
import { getActingMember, requireTeamAccess } from "@/lib/auth";
import { seesEverything } from "@/lib/scope";
import { homeFor } from "@/lib/roles";
import { listTeamMembers } from "@/lib/data/team";
import { listClients } from "@/lib/data/clients";
import { listSprintTasks } from "@/lib/data/sprint-tasks";
import { listContracts } from "@/lib/data/contracts";
import { listWorks } from "@/lib/data/works";
import { listContentPosts, listInvoices } from "@/lib/data/reads";
import { WORK_DAY_LABEL, fmtHours, workingDaysInMonth } from "@/lib/capacity/helpers";
import {
    buildManagementSnapshot,
    HORIZON_MONTHS,
    PERF_WINDOW_DAYS,
    resolveMonth,
    todayYmd,
    type Risk,
    type RoleMismatch,
} from "@/lib/management/metrics";
import { Empty, HealthDot, MonthSelect, Section, StatTile, plural, shortMonthLabel } from "../ui";
import { HorizonTable, HoursLegend, PeopleTable, TEAM_PATH } from "./tables";

export const dynamic = "force-dynamic";

/** One line per off-role share: who holds what, and the seat it belongs to. */
function OffRoleList({ items }: { items: RoleMismatch[] }) {
    if (items.length === 0) return <Empty>Every task share sits with a fitting role.</Empty>;
    return (
        <ul className="divide-y">
            {items.map((mm, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-2 text-sm">
                    <span className="font-medium">{mm.member}</span>
                    <span className="text-xs text-muted-foreground">{mm.memberRole}</span>
                    <span className="text-muted-foreground">holds</span>
                    <Link href={mm.href} className="font-medium hover:underline">
                        {mm.taskTitle}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                        {mm.seat} seat · {mm.clientName}
                        {mm.dueDate ? ` · due ${mm.dueDate}` : ""}
                    </span>
                </li>
            ))}
        </ul>
    );
}

/** One line per risk, worst first. */
function RiskList({ risks }: { risks: Risk[] }) {
    if (risks.length === 0) return <Empty>Nothing flagged.</Empty>;
    return (
        <ul className="divide-y">
            {risks.map((r, i) => (
                <li key={`${r.kind}-${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-2 text-sm">
                    <HealthDot health={r.severity} />
                    <Link href={r.href} className="font-medium hover:underline">
                        {r.title}
                    </Link>
                    <span className="min-w-0 text-xs text-muted-foreground">{r.detail}</span>
                </li>
            ))}
        </ul>
    );
}

export default async function ManagementTeamPage({
    searchParams,
}: {
    searchParams: Promise<{ month?: string | string[] }>;
}) {
    await requireTeamAccess();
    // Managers only (or nobody picked under the dev bypass).
    const me = await getActingMember();
    if (!seesEverything(me)) redirect(homeFor(me));
    const [sp, team, clients, contracts, works, sprintTasks, content, invoices] = await Promise.all([
        searchParams,
        listTeamMembers(),
        listClients(),
        listContracts(),
        listWorks(),
        listSprintTasks(),
        listContentPosts(),
        listInvoices(),
    ]);
    const today = todayYmd();
    const month = resolveMonth(sp.month, today);
    const snap = buildManagementSnapshot({ team, clients, contracts, works, sprintTasks, content, invoices, month }, today);
    const k = snap.kpis;
    const monthShort = shortMonthLabel(snap.month);

    const tiles: Array<React.ComponentProps<typeof StatTile>> = [
        {
            label: `Hours · ${monthShort}`,
            value: `${fmtHours(k.teamPlannedHours)} / ${fmtHours(k.teamAvailableHours)}`,
            hint: k.teamFreeHours < 0 ? `${fmtHours(-k.teamFreeHours)} over` : `${fmtHours(k.teamFreeHours)} free · ${k.teamPct}%`,
            health: k.teamPct > 100 ? "red" : k.teamPct > 85 ? "amber" : "green",
            href: "#people",
        },
        {
            label: "Over capacity",
            value: String(k.overloaded),
            hint: k.idle > 0 ? `${k.idle} idle` : "people over hours",
            health: k.overloaded > 0 ? "red" : k.idle > 0 ? "amber" : "green",
            href: "#people",
        },
        {
            label: "Off-day hours",
            value: fmtHours(k.teamOffDayHours),
            hint: k.teamOffDayHours > 0 ? "due Fri–Sun" : "nothing due Fri–Sun",
            health: k.teamOffDayHours > 0 ? "amber" : "green",
            href: "#people",
        },
        {
            label: "Overdue",
            value: String(k.overdueItems),
            hint: "tasks past due",
            health: k.overdueItems > 0 ? "red" : "green",
            href: "/works?overdue=1",
        },
        {
            label: "Review",
            value: String(k.awaitingApproval),
            hint: k.waitingOnClient > 0 ? `${k.waitingOnClient} with client` : "waiting on approval",
            health: k.awaitingApproval > 0 ? "amber" : "green",
            href: "/works?status=pending_approval",
        },
        {
            label: "No owner",
            value: String(k.unassignedItems),
            hint: "nobody on it",
            health: k.unassignedItems > 0 ? "amber" : "green",
            href: "/management/work#unassigned",
        },
        {
            label: "Off-role",
            value: String(k.outOfRole),
            hint: "shares held off-role",
            health: k.outOfRole > 0 ? "amber" : "green",
            href: "#off-role",
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <MonthSelect selected={snap.month} today={snap.today} basePath={TEAM_PATH} />
                <p className="text-xs text-muted-foreground">As of {snap.today}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
                {tiles.map((t) => (
                    <StatTile key={t.label} {...t} />
                ))}
            </div>

            <Section id="people" title={`People · ${monthShort}`} description={`Heaviest first. Hours are planned per month: ${workingDaysInMonth(snap.month)} working days (${WORK_DAY_LABEL}) in ${monthShort}.`}>
                {snap.members.length === 0 ? (
                    <Empty>
                        No active team members.{" "}
                        <Link href="/team" className="underline">
                            Add some
                        </Link>
                        .
                    </Empty>
                ) : (
                    <>
                        <PeopleTable members={snap.members} month={snap.month} />
                        <HoursLegend />
                    </>
                )}
            </Section>

            <Section
                id="plan"
                title={`Upcoming months · ${shortMonthLabel(snap.horizon.months[0])} – ${shortMonthLabel(snap.horizon.months[HORIZON_MONTHS - 1])}`}
                description="Planned / available per person. Click a month to switch the page; click a cell to open those tasks."
            >
                {snap.horizon.members.length === 0 ? <Empty>No active team members to plan for.</Empty> : <HorizonTable h={snap.horizon} selected={snap.month} today={snap.today} />}
            </Section>

            <Section id="off-role" title="Off-role" description="Task shares held by someone whose job does not fit the seat. Fine when deliberate.">
                <OffRoleList items={snap.mismatches} />
            </Section>

            <Section id="attention" title="Attention" description="Everything flagged across tasks, sprint tasks, content and people. Worst first.">
                <RiskList risks={snap.risks} />
            </Section>

            <p className="text-xs text-muted-foreground tabular-nums">
                Last {PERF_WINDOW_DAYS} days: <span className="font-medium text-foreground">{k.done30d}</span> done ·{" "}
                {k.onTimePct === null ? "on-time n/a" : <span className="font-medium text-foreground">{k.onTimePct}% on time</span>} ·{" "}
                <span className="font-medium text-foreground">{k.openTasks}</span> open tasks on {plural(k.activeContracts, "active contract")}.
            </p>
        </div>
    );
}
