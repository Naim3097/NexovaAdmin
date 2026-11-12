/**
 * Website: every website task, client → project → task, by month or phase.
 * Lists, filters and links to each task; nothing is created here: a website
 * item starts as a task on a project.
 */
import Link from "next/link";
import { getAccessLevel, getActingMember, getCurrentTeamMember, requireTeamAccess } from "@/lib/auth";
import { listWorks, type Work } from "@/lib/data/works";
import { listContracts, type Contract } from "@/lib/data/contracts";
import { listTeamMembers } from "@/lib/data/team";
import { visibleContracts, visibleWorks } from "@/lib/scope";
import { NO_PHASE, groupByPhase, isAdjusted, isOverdue, monthLabel, monthsOf, pendingFrom, todayKey } from "@/lib/works/helpers";
import { applyFilter, filterQuery, isFiltered, parseFilter, withDefaultMember } from "@/lib/works/filter";
import { SelectNav } from "@/components/select-nav";
import { cn } from "@/lib/utils";
import { FilterRow } from "@/app/(admin)/works/filter-bar";
import { ActingAs, DueLabel, SplitLabel, TaskStatusBadge } from "@/app/(admin)/works/ui";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(sp: SearchParams, key: string): string {
    const v = sp[key];
    return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
}

function byDue(list: Work[]): Work[] {
    return [...list].sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || a.title.localeCompare(b.title));
}

type ContractGroup = { key: string; contract: Contract | null; works: Work[] };
type ClientGroup = { client: string; contracts: ContractGroup[] };

/** Client → project → tasks by due date. */
function groupByClient(list: Work[], contracts: Contract[]): ClientGroup[] {
    const byId = new Map(contracts.map((c) => [c.id, c]));
    const clients = new Map<string, Map<string, ContractGroup>>();
    for (const w of list) {
        const client = w.clientName || "No client";
        const groups = clients.get(client) ?? new Map<string, ContractGroup>();
        const key = w.contractId || "none";
        const g = groups.get(key) ?? { key, contract: byId.get(w.contractId) ?? null, works: [] };
        g.works.push(w);
        groups.set(key, g);
        clients.set(client, groups);
    }
    return [...clients.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([client, groups]) => ({
            client,
            contracts: [...groups.values()]
                .sort((a, b) => (a.contract?.code ?? "~").localeCompare(b.contract?.code ?? "~"))
                .map((g) => ({ ...g, works: byDue(g.works) })),
        }));
}

/** Phase names of the projects these tasks belong to, in project order, de-duplicated. */
function phaseOrderOf(list: Work[], contracts: Contract[]): string[] {
    const ids = new Set(list.map((w) => w.contractId));
    return [...new Set(contracts.filter((c) => ids.has(c.id)).flatMap((c) => c.phases.map((p) => p.name)))];
}

/** The client → project → task table the list renders. */
function ClientGroups({ groups, today, asQ, showPhase = true }: { groups: ClientGroup[]; today: string; asQ: string; showPhase?: boolean }) {
    return (
        <ul className="divide-y">
            {groups.map((g) => (
                <li key={g.client} className="p-4">
                    <h2 className="font-medium">{g.client}</h2>
                    <div className="mt-2 space-y-4">
                        {g.contracts.map((cg) => (
                            <div key={cg.key}>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                                    {cg.contract ? (
                                        <>
                                            <Link href={`/projects/${cg.contract.id}#works`} className="font-medium hover:underline">
                                                {cg.contract.code} · {cg.contract.name}
                                            </Link>
                                            <span className="text-xs text-muted-foreground">AM {cg.contract.accountManager || "—"}</span>
                                        </>
                                    ) : (
                                        <span className="font-medium text-muted-foreground">No account</span>
                                    )}
                                    <span className="text-xs text-muted-foreground">
                                        · {cg.works.length} task{cg.works.length === 1 ? "" : "s"}
                                    </span>
                                </div>
                                <div className="mt-2 overflow-x-auto">
                                    <table className="w-full min-w-[760px] text-sm">
                                        <thead>
                                            <tr className="text-left text-xs text-muted-foreground">
                                                <th className="py-1 pr-3 font-medium">Task</th>
                                                {showPhase ? <th className="py-1 pr-3 font-medium">Phase</th> : null}
                                                <th className="py-1 pr-3 font-medium">Month</th>
                                                <th className="py-1 pr-3 font-medium">Owners</th>
                                                <th className="py-1 pr-3 font-medium">Due</th>
                                                <th className="py-1 pr-3 font-medium">Status</th>
                                                <th className="py-1 font-medium">Waiting on</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {cg.works.map((w) => (
                                                <tr key={w.id} className="border-t align-top">
                                                    <td className="py-2 pr-3">
                                                        <Link href={`/works/${w.id}${asQ}`} className="font-medium hover:underline">
                                                            {w.title}
                                                        </Link>
                                                        {w.milestone ? (
                                                            <span title="Milestone" className="ml-1 text-amber-500">
                                                                ◆
                                                            </span>
                                                        ) : null}
                                                        {w.channel && w.channel !== "Website" ? (
                                                            <span className="ml-1 text-xs text-muted-foreground">· {w.channel}</span>
                                                        ) : null}
                                                    </td>
                                                    {showPhase ? <td className="py-2 pr-3 text-xs text-muted-foreground">{w.phaseName || "—"}</td> : null}
                                                    <td className="whitespace-nowrap py-2 pr-3 text-xs text-muted-foreground">{monthLabel(w.month)}</td>
                                                    <td className="py-2 pr-3">
                                                        <SplitLabel split={w.split} short />
                                                    </td>
                                                    <td className="whitespace-nowrap py-2 pr-3">
                                                        <DueLabel
                                                            due={w.dueDate}
                                                            status={w.status}
                                                            today={today}
                                                            adjusted={isAdjusted(w)}
                                                            defaultDue={w.defaultDueDate}
                                                        />
                                                    </td>
                                                    <td className="py-2 pr-3">
                                                        <TaskStatusBadge status={w.status} />
                                                    </td>
                                                    <td className="py-2 text-xs text-muted-foreground">{pendingFrom(w) || "—"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                </li>
            ))}
        </ul>
    );
}

export default async function WebsitePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
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
    const contracts = visibleContracts(member, allContracts, allWorks);
    const today = todayKey();
    // The acting member: the linked login wins; otherwise the `?as=` pick (DEV_AUTH_BYPASS), else the acting-as cookie.
    const as = linked ? "" : one(sp, "as");
    const me = member?.name ?? as;
    const asQ = as ? `?as=${encodeURIComponent(as)}` : "";
    const activeTeam = team.filter((m) => m.active);
    const names = activeTeam.map((m) => m.name);

    const works = visibleWorks(member, allWorks).filter((w) => w.type === "website");
    const group = one(sp, "group") === "phase" ? "phase" : "month";
    const filter = withDefaultMember(parseFilter(sp), sp, me, accessLevel === "standard");
    const filtered = applyFilter(works, filter, today);
    const keep: Record<string, string | undefined> = { group: group === "phase" ? "phase" : undefined, as: as || undefined };
    const href = (f: typeof filter, extra: Record<string, string | undefined> = {}) => `/website${filterQuery(f, { ...keep, ...extra })}`;
    const phaseOrder = phaseOrderOf(filtered, contracts);

    // Phases in the projects' own order (then any stray names), for the Phase dropdown.
    const phases = [...new Set([...phaseOrderOf(works, contracts), ...works.map((w) => w.phaseName)])].filter(Boolean);
    const clients = [...new Set(works.map((w) => w.clientName).filter(Boolean))].sort();
    const ams = [...new Set(contracts.map((c) => c.accountManager).filter(Boolean))].sort();

    const open = filtered.filter((w) => w.status !== "completed").length;
    const overdue = filtered.filter((w) => isOverdue(w, today)).length;
    const groups = groupByClient(filtered, contracts);

    const groupOptions = [
        { value: "month", label: "Month", href: href(filter, { group: undefined }) },
        { value: "phase", label: "Phase", href: href(filter, { group: "phase" }) },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">Website</h1>
                    <p className="text-sm text-muted-foreground">Pages, sections, integrations and launches, one task each under an account.</p>
                    <p className="text-xs text-muted-foreground">
                        New items start as a task on an{" "}
                        <Link href={`/projects${asQ}`} className="underline">
                            account
                        </Link>
                        .
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <Link href={`/works${filterQuery({ type: "website" }, { as: as || undefined })}`} className="text-sm font-medium underline">
                        All tasks
                    </Link>
                </div>
            </div>

            <ActingAs
                members={activeTeam}
                current={me}
                linkedMember={linked?.name ?? null}
                makeHref={(n) => `/website${filterQuery({ ...filter, member: filter.member && filter.member === me ? n : filter.member }, { ...keep, as: n })}`}
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
                <FilterRow
                    basePath="/website"
                    filter={filter}
                    me={me}
                    members={names}
                    months={monthsOf(works)}
                    phases={phases}
                    clients={clients}
                    ams={ams}
                    types={["website"]}
                    keep={keep}
                />
                <SelectNav label="Group" value={group} options={groupOptions} />
            </div>

            {filtered.length === 0 ? (
                <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
                    {isFiltered(filter) ? (
                        <>
                            Nothing matches —{" "}
                            <Link href={`/website${filterQuery({}, keep)}`} className="underline">
                                clear the filter
                            </Link>
                            .
                        </>
                    ) : (
                        <>
                            No website tasks yet. New items start as a task on an{" "}
                            <Link href={`/projects${asQ}`} className="underline">
                                account
                            </Link>
                            .
                        </>
                    )}
                </div>
            ) : (
                <>
                    <p className="text-xs text-muted-foreground tabular-nums">
                        <span className="font-medium text-foreground">
                            {filtered.length} website task{filtered.length === 1 ? "" : "s"}
                        </span>
                        {works.length !== filtered.length ? ` of ${works.length}` : ""} · {open} open ·{" "}
                        <span className={cn(overdue > 0 && "font-medium text-red-600 dark:text-red-400")}>{overdue} overdue</span>
                    </p>
                    <div className="rounded-lg border bg-card">
                        {group === "phase" ? (
                            <div className="divide-y">
                                {[...groupByPhase(filtered, phaseOrder).entries()].map(([phase, list]) => {
                                    const pg = groupByClient(list, contracts);
                                    return (
                                        <section key={phase}>
                                            <div className="flex flex-wrap items-baseline gap-x-2 border-b bg-muted/30 px-4 py-2">
                                                <h2 className={cn("text-sm font-medium", phase === NO_PHASE && "text-muted-foreground")}>{phase}</h2>
                                                <span className="text-xs text-muted-foreground">
                                                    {list.length} task{list.length === 1 ? "" : "s"} · {pg.length} client{pg.length === 1 ? "" : "s"}
                                                </span>
                                            </div>
                                            <ClientGroups groups={pg} today={today} asQ={asQ} showPhase={false} />
                                        </section>
                                    );
                                })}
                            </div>
                        ) : (
                            <ClientGroups groups={groups} today={today} asQ={asQ} />
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
