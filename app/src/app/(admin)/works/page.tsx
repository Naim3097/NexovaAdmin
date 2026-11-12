/**
 * Tasks — every task under every project, with the shared filter row, List /
 * Board / Calendar views and Month / Phase grouping. Nothing is scoped to the
 * viewer here (My tasks is the personal page); the Owner filter narrows, and
 * in the calendar it also puts the day's load against that person's hours.
 * The list, board, toolbar and header live in ./task-list, ./task-board and
 * ./toolbar so My tasks renders the very same markup.
 *
 * Nothing is created here: new tasks start on a project page ("New task", or
 * the deliverables). This page lists, filters and edits.
 * Two narrowing params ride beside the shared filter row: `?waiting=` (blocked
 * on the client or on us) and `?unassigned=1` (open tasks with an open seat).
 */
import Link from "next/link";
import { getActingMember, getCurrentTeamMember, requireTeamAccess } from "@/lib/auth";
import { listWorks, type Work } from "@/lib/data/works";
import { listContracts } from "@/lib/data/contracts";
import { deliveryWeeklyHours, listTeamMembers } from "@/lib/data/team";
import { WORK_DAYS, findMember, fmtHours } from "@/lib/capacity/helpers";
import { actorOf } from "@/lib/works/actor";
import { parseMonth, taskItems, ymOf } from "@/lib/works/calendar";
import { isOpen, monthsOf, todayKey } from "@/lib/works/helpers";
import { applyFilter, filterQuery, hasOpenSeat, isFiltered, parseFilter } from "@/lib/works/filter";
import { WAITING_ON_LABEL, normalizeWaitingOn } from "@/lib/works/waiting";
import { CalendarGrid } from "@/app/(admin)/calendar/grid";
import { TaskBoard } from "./task-board";
import { TaskEmpty, TaskList, TaskSummary, phaseOrderOf, phaseSections } from "./task-list";
import { CalendarNav, TaskHeader, TaskToolbar, parseView, type GroupOption } from "./toolbar";
import { ActingAs } from "./ui";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(sp: SearchParams, key: string): string {
    const v = sp[key];
    return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
}

/** Month first: the default, so it travels without a `group` param. */
const GROUPS: GroupOption[] = [
    { value: "month", label: "Month" },
    { value: "phase", label: "Phase" },
];

export default async function WorksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    await requireTeamAccess();
    const sp = await searchParams;
    const [works, contracts, team, linked, member] = await Promise.all([
        listWorks(),
        listContracts(),
        listTeamMembers(),
        getCurrentTeamMember(),
        getActingMember(one(sp, "as") || undefined),
    ]);
    const today = todayKey();
    const thisMonth = today.slice(0, 7);
    const view = parseView(one(sp, "view"));
    const group = one(sp, "group") === "phase" ? "phase" : "month";
    // The calendar's month, `?cm=YYYY-MM`; this month when absent.
    const { year: calYear, month: calMonth } = parseMonth(one(sp, "cm") || undefined);
    const calYm = ymOf(calYear, calMonth);
    // The acting member: the linked login wins; otherwise the `?as=` pick (DEV_AUTH_BYPASS), else the acting-as cookie.
    const as = linked ? "" : one(sp, "as");
    const me = member?.name ?? as;
    const asQ = as ? `?as=${encodeURIComponent(as)}` : "";
    const activeTeam = team.filter((m) => m.active);
    const names = activeTeam.map((m) => m.name);

    const filter = parseFilter(sp);
    // `?waiting=client|internal` narrows to open tasks marked as blocked on them (the Dashboard links here); it rides beside the shared filter row.
    const waiting = normalizeWaitingOn(one(sp, "waiting"));
    // `?unassigned=1` narrows to open tasks with a seat nobody holds (the Dashboard's "no owner" count links here).
    const unassigned = one(sp, "unassigned") === "1";
    const filtered = applyFilter(works, filter, today)
        .filter((w) => !waiting || (isOpen(w) && w.waitingOn === waiting))
        .filter((w) => !unassigned || hasOpenSeat(w));
    const keep: Record<string, string | undefined> = {
        view: view === "list" ? undefined : view,
        cm: view === "calendar" ? calYm : undefined,
        group: group === "phase" ? "phase" : undefined,
        waiting: waiting || undefined,
        unassigned: unassigned ? "1" : undefined,
        as: as || undefined,
    };
    const href = (extra: Record<string, string | undefined> = {}) => `/works${filterQuery(filter, { ...keep, ...extra })}`;

    // Phases in the projects' own order (then any stray names), for the Phase dropdown and the phase grouping.
    const phases = [...new Set([...phaseOrderOf(works, contracts), ...works.map((w) => w.phaseName)])].filter(Boolean);
    const clients = [...new Set(works.map((w) => w.clientName).filter(Boolean))].sort();
    const ams = [...new Set(contracts.map((c) => c.accountManager).filter(Boolean))].sort();

    // ---- The calendar view: the filtered tasks on their planned day. With the Owner
    // filter on one person, their tasks only and each working day against their hours.
    const actor = actorOf(member);
    const calItems = taskItems(filtered, today, filter.member || "");
    const calTasks: Record<string, Work> = Object.fromEntries(filtered.map((w) => [w.id, w]));
    const scopeMember = filter.member ? findMember(team, filter.member) : undefined;
    const perDay = scopeMember ? deliveryWeeklyHours(scopeMember) / WORK_DAYS.length : undefined;

    return (
        <div className="space-y-6">
            <TaskHeader
                title="Tasks"
                subtitle={
                    <>
                        {view === "board" ? "Every task under every account, with who owns it." : "Every task under every account, by month, with who owns it."}
                        <span className="mt-0.5 block text-xs">
                            New items start as a task on an{" "}
                            <Link href={`/projects${asQ}`} className="underline">
                                account
                            </Link>
                            .
                        </span>
                    </>
                }
            />

            <ActingAs
                members={activeTeam}
                current={me}
                linkedMember={linked?.name ?? null}
                makeHref={(n) => `/works${filterQuery({ ...filter, member: filter.member && filter.member === me ? n : filter.member }, { ...keep, as: n })}`}
            />

            <TaskToolbar
                basePath="/works"
                filter={filter}
                me={me}
                members={names}
                months={monthsOf(works)}
                phases={phases}
                clients={clients}
                ams={ams}
                keep={keep}
                view={view}
                group={group}
                groups={GROUPS}
                href={href}
                unassigned={unassigned}
            />

            {waiting ? (
                <p className="text-xs text-muted-foreground">
                    Only tasks marked <span className="font-medium text-foreground">{WAITING_ON_LABEL[waiting].toLowerCase()}</span>.{" "}
                    <Link href={href({ waiting: undefined })} className="underline">
                        Show all
                    </Link>
                </p>
            ) : null}
            {unassigned ? (
                <p className="text-xs text-muted-foreground">
                    Only tasks with an open seat.{" "}
                    <Link href={href({ unassigned: undefined })} className="underline">
                        Show all
                    </Link>
                </p>
            ) : null}

            {view === "calendar" ? (
                <div className="space-y-2">
                    <CalendarNav
                        year={calYear}
                        month={calMonth}
                        thisMonth={thisMonth}
                        href={href}
                        note={
                            perDay !== undefined
                                ? `${filter.member}'s tasks on their planned day (deadline shown when it differs); each working day shows the hours planned against ${fmtHours(perDay)} available. Drag a task to replan it.`
                                : "Tasks on their planned day (deadline shown when it differs). Pick an Owner to see one person's days against their hours. Drag a task to replan it."
                        }
                    />
                    <CalendarGrid year={calYear} month={calMonth} items={calItems} today={today} actor={actor} asParam={as || undefined} tasks={calTasks} perDay={perDay} />
                </div>
            ) : filtered.length === 0 ? (
                <TaskEmpty
                    filtered={isFiltered(filter) || Boolean(waiting) || unassigned}
                    clearHref={`/works${filterQuery({}, { ...keep, waiting: undefined, unassigned: undefined })}`}
                >
                    No tasks yet. They appear when an account is signed. New items start as a task on an{" "}
                    <Link href={`/projects${asQ}`} className="underline">
                        account
                    </Link>
                    .
                </TaskEmpty>
            ) : view === "board" ? (
                <>
                    <TaskSummary works={filtered} today={today} />
                    <TaskBoard works={filtered} today={today} asQ={asQ} actor={actor} asParam={as || undefined} />
                </>
            ) : (
                <>
                    <TaskSummary works={filtered} today={today} />
                    <TaskList
                        works={filtered}
                        contracts={contracts}
                        today={today}
                        asQ={asQ}
                        sections={group === "phase" ? phaseSections(filtered, contracts) : undefined}
                        showPhase={group !== "phase"}
                    />
                </>
            )}
        </div>
    );
}
