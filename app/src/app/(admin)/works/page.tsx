/**
 * Tasks — every task under every contract the acting member may see, with the
 * shared filter row, List / Board views and Month / Phase grouping. The list,
 * board, toolbar and header live in ./task-list, ./task-board and ./toolbar so
 * My tasks renders the very same markup.
 */
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getAccessLevel, getActingMember, getCurrentTeamMember, requireTeamAccess } from "@/lib/auth";
import { listWorks } from "@/lib/data/works";
import { listContracts } from "@/lib/data/contracts";
import { listTeamMembers } from "@/lib/data/team";
import { visibleContracts, visibleWorks } from "@/lib/scope";
import { monthsOf, todayKey } from "@/lib/works/helpers";
import { applyFilter, filterQuery, isFiltered, parseFilter, withDefaultMember } from "@/lib/works/filter";
import { TaskBoard } from "./task-board";
import { TaskEmpty, TaskList, TaskSummary, phaseOrderOf, phaseSections } from "./task-list";
import { TaskHeader, TaskToolbar, parseView, type GroupOption } from "./toolbar";
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
    const [allWorks, allContracts, team, linked, accessLevel, member] = await Promise.all([
        listWorks(),
        listContracts(),
        listTeamMembers(),
        getCurrentTeamMember(),
        getAccessLevel(),
        getActingMember(one(sp, "as") || undefined),
    ]);
    // A user sees only the tasks they own a part of or must sign off; managers (or nobody picked) see all.
    const works = visibleWorks(member, allWorks);
    const contracts = visibleContracts(member, allContracts, allWorks);
    const today = todayKey();
    const view = parseView(one(sp, "view"));
    const group = one(sp, "group") === "phase" ? "phase" : "month";
    // The acting member: the linked login wins; otherwise the `?as=` pick (DEV_AUTH_BYPASS), else the acting-as cookie.
    const as = linked ? "" : one(sp, "as");
    const me = member?.name ?? as;
    const asQ = as ? `?as=${encodeURIComponent(as)}` : "";
    const activeTeam = team.filter((m) => m.active);
    const names = activeTeam.map((m) => m.name);

    const filter = withDefaultMember(parseFilter(sp), sp, me, accessLevel === "standard");
    const filtered = applyFilter(works, filter, today);
    const keep: Record<string, string | undefined> = {
        view: view === "board" ? "board" : undefined,
        group: group === "phase" ? "phase" : undefined,
        as: as || undefined,
    };
    const href = (extra: Record<string, string | undefined> = {}) => `/works${filterQuery(filter, { ...keep, ...extra })}`;

    // Phases in the contracts' own order (then any stray names), for the Phase dropdown and the phase grouping.
    const phases = [...new Set([...phaseOrderOf(works, contracts), ...works.map((w) => w.phaseName)])].filter(Boolean);
    const clients = [...new Set(works.map((w) => w.clientName).filter(Boolean))].sort();
    const ams = [...new Set(contracts.map((c) => c.accountManager).filter(Boolean))].sort();

    return (
        <div className="space-y-6">
            <TaskHeader
                title="Tasks"
                subtitle="Every task under every contract, by month, with who owns it."
                asQ={asQ}
                calendarHref={`/calendar${filterQuery(filter, { as: as || undefined })}`}
                action={
                    <Button nativeButton={false} render={<Link href={`/contracts${asQ}`} title="Tasks are added on the contract" />}>
                        + New task
                    </Button>
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
            />

            {filtered.length === 0 ? (
                <TaskEmpty filtered={isFiltered(filter)} clearHref={`/works${filterQuery({}, keep)}`}>
                    No tasks yet. They appear when an accepted proposal becomes a contract, or add one from the{" "}
                    <Link href="/contracts" className="underline">
                        contract page
                    </Link>
                    .
                </TaskEmpty>
            ) : (
                <>
                    <TaskSummary works={filtered} today={today} />
                    {view === "board" ? (
                        <TaskBoard works={filtered} today={today} asQ={asQ} />
                    ) : (
                        <TaskList
                            works={filtered}
                            contracts={contracts}
                            today={today}
                            asQ={asQ}
                            sections={group === "phase" ? phaseSections(filtered, contracts) : undefined}
                            showPhase={group !== "phase"}
                        />
                    )}
                </>
            )}
        </div>
    );
}
