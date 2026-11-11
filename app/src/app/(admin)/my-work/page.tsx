/**
 * My tasks — the Tasks page scoped to one person: every task I hold a share
 * of or must sign off, in the same layout (filter row, List / Board, Month /
 * Phase grouping) minus the Owner filter, plus an "Urgency" grouping (the
 * buckets Home shows too) that is the default here, and Start / Submit /
 * Approve / Changes on every row.
 */
import Link from "next/link";
import { getActingMember, getCurrentTeamMember, requireTeamAccess } from "@/lib/auth";
import { listWorks, type Work } from "@/lib/data/works";
import { listContracts } from "@/lib/data/contracts";
import { listInvoices } from "@/lib/data/invoices";
import { listTeamMembers } from "@/lib/data/team";
import { fmtHours, loadFor, shareHours } from "@/lib/capacity/helpers";
import { buildOverviewSnapshot } from "@/lib/management/overview";
import { canSee, isManager } from "@/lib/roles";
import { isAccountManagerOf, pendingTransfersFor } from "@/lib/scope";
import { cn } from "@/lib/utils";
import { awaitsApprovalFrom, monthLabel, monthsOf, nextMonth, todayKey } from "@/lib/works/helpers";
import { applyFilter, filterQuery, isFiltered, parseFilter } from "@/lib/works/filter";
import { TaskBoard } from "@/app/(admin)/works/task-board";
import { TaskEmpty, TaskList, TaskSummary, byDue, countLabel, phaseOrderOf, phaseSections, type TaskSection } from "@/app/(admin)/works/task-list";
import { TaskHeader, TaskToolbar, parseView, type GroupOption } from "@/app/(admin)/works/toolbar";
import { ActingAs } from "@/app/(admin)/works/ui";
import { BUCKETS, BUCKET_LABEL, bucketAll, holdsShare, type Bucket } from "./buckets";
import { RowActions } from "./task-rows";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(sp: SearchParams, key: string): string {
    const v = sp[key];
    return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
}

/** Urgency first: the default here, so it travels without a `group` param. */
const GROUPS: GroupOption[] = [
    { value: "urgency", label: "Urgency" },
    { value: "month", label: "Month" },
    { value: "phase", label: "Phase" },
];

const BUCKET_TONE: Partial<Record<Bucket, string>> = {
    overdue: "text-red-600 dark:text-red-400",
    today: "text-amber-700 dark:text-amber-400",
    approval: "text-amber-700 dark:text-amber-400",
};

/**
 * The list split into the urgency buckets (overdue, today, next 7 days, my
 * sign-off …), each headed by its count and my hours. Tasks the buckets leave
 * out — done in an earlier month — close the list so nothing the summary
 * counts goes missing.
 */
function urgencySections(list: Work[], me: string, today: string): TaskSection[] {
    const buckets = bucketAll(list, me, today);
    const placed = new Set(BUCKETS.flatMap((b) => buckets[b]).map((w) => w.id));
    const earlier = byDue(list.filter((w) => !placed.has(w.id)));
    const section = (key: string, title: string, works: Work[], tone?: string, suffix = ""): TaskSection => {
        const h = works.reduce((sum, w) => sum + shareHours(w, me), 0);
        return { key, title, works, titleClassName: tone, meta: `${countLabel(works.length, "task")}${h > 0 ? ` · ${fmtHours(h)}` : ""}${suffix}` };
    };
    const thisMonth = today.slice(0, 7);
    return [
        ...BUCKETS.filter((b) => buckets[b].length > 0).map((b) =>
            section(b, BUCKET_LABEL[b], buckets[b], BUCKET_TONE[b], b === "next" ? ` · ${monthLabel(nextMonth(thisMonth))}` : ""),
        ),
        ...(earlier.length > 0 ? [section("earlier", "Done earlier", earlier, "text-muted-foreground")] : []),
    ];
}

type Nudge = { key: string; label: string; href: string; tone?: "amber" };

/**
 * The thin row under the header: what waits on me beyond my own tasks — a
 * colleague's account-manager transfer to answer, approvals on the contracts
 * I run, and for managers the Dashboard's Attention list. Only chips with a
 * count render; the row disappears when there are none.
 */
function Nudges({ items }: { items: Nudge[] }) {
    if (items.length === 0) return null;
    return (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {items.map((n) => (
                <Link
                    key={n.key}
                    href={n.href}
                    className={cn(
                        "rounded-full border px-2.5 py-0.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        n.tone === "amber"
                            ? "border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400"
                            : "border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                >
                    {n.label}
                </Link>
            ))}
        </div>
    );
}

export default async function MyWorkPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    await requireTeamAccess();
    const sp = await searchParams;
    const [allWorks, allContracts, team, linked, me] = await Promise.all([
        listWorks(),
        listContracts(),
        listTeamMembers(),
        getCurrentTeamMember(),
        getActingMember(one(sp, "as")),
    ]);
    const activeTeam = team.filter((m) => m.active);
    const today = todayKey();
    const thisMonth = today.slice(0, 7);
    const view = parseView(one(sp, "view"));
    const groupParam = one(sp, "group");
    const group = groupParam === "month" || groupParam === "phase" ? groupParam : "urgency";
    // Scoping to me is built in: no Owner dropdown, no Me toggle, and a stray `?member=` is ignored.
    const filter = { ...parseFilter(sp), member: "" };

    if (!me) {
        return (
            <div className="space-y-6">
                <TaskHeader title="My tasks" subtitle="What is on your plate: your tasks and the sign-offs you owe." asQ="" calendarHref="/calendar" />
                <ActingAs members={activeTeam} current="" linkedMember={null} makeHref={(n) => `/my-work?as=${encodeURIComponent(n)}`} />
                <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
                    Pick who you are above to see your tasks. With a real login this page knows you already.
                </div>
            </div>
        );
    }

    const name = me.name;
    // Links keep the acting member when there is no real login behind this page.
    const as = linked ? "" : name;
    const asQ = as ? `?as=${encodeURIComponent(as)}` : "";

    // My plate: every task I hold a share of or must sign off — the same stake test the urgency buckets use.
    const works = allWorks.filter((w) => holdsShare(w, name) || awaitsApprovalFrom(w, name));
    const contractIds = new Set(works.map((w) => w.contractId));
    const contracts = allContracts.filter((c) => contractIds.has(c.id));
    const filtered = applyFilter(works, filter, today);
    const keep: Record<string, string | undefined> = {
        view: view === "board" ? "board" : undefined,
        group: group === "urgency" ? undefined : group,
        as: as || undefined,
    };
    const href = (extra: Record<string, string | undefined> = {}) => `/my-work${filterQuery(filter, { ...keep, ...extra })}`;

    const phases = [...new Set([...phaseOrderOf(works, contracts), ...works.map((w) => w.phaseName)])].filter(Boolean);
    const clients = [...new Set(works.map((w) => w.clientName).filter(Boolean))].sort();
    const ams = [...new Set(contracts.map((c) => c.accountManager).filter(Boolean))].sort();

    const load = loadFor(me, works, thisMonth);
    const actions = (w: Work) => <RowActions w={w} me={name} />;
    const sections = group === "urgency" ? urgencySections(filtered, name, today) : group === "phase" ? phaseSections(filtered, contracts) : undefined;

    // ---- What waits on me beyond my own tasks (the chips under the header).
    // Transfers come from every contract: the colleague asked to take one over need not hold a task on it yet.
    const transfers = pendingTransfersFor(me, allContracts);
    // Approvals on the contracts I run — the same set My accounts queues (live contracts, any approver).
    const runIds = new Set(allContracts.filter((c) => isAccountManagerOf(me, c) && (c.status === "active" || c.status === "draft")).map((c) => c.id));
    const approvals = canSee(me, "/my-clients") ? allWorks.filter((w) => w.status === "pending_approval" && runIds.has(w.contractId)).length : 0;
    // Managers: the Dashboard's Attention list. Invoices are its one input this page does not load; leads only feed the pipeline tile.
    let attention = 0;
    if (isManager(me)) {
        const invoices = await listInvoices().catch(() => []);
        const snap = buildOverviewSnapshot({ team, contracts: allContracts, works: allWorks, invoices, leads: [] }, today);
        attention = snap.decisions.length + snap.moreDecisions;
    }
    const asAnd = as ? `&as=${encodeURIComponent(as)}` : "";
    const nudges: Nudge[] = [
        ...(transfers.length > 0
            ? [{
                key: "transfers",
                tone: "amber" as const,
                label: `${countLabel(transfers.length, "transfer")} to answer`,
                href: transfers.length === 1 ? `/contracts/${transfers[0].id}?tab=setup${asAnd}#account-manager` : `/my-clients${asQ}`,
            }]
            : []),
        ...(approvals > 0 ? [{ key: "approvals", label: `${countLabel(approvals, "approval")} in My accounts`, href: `/my-clients${asQ}#approvals` }] : []),
        ...(attention > 0 ? [{ key: "attention", label: `${attention} need${attention === 1 ? "s" : ""} attention`, href: `/dashboard${asQ}` }] : []),
    ];

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <TaskHeader
                    title={`My tasks · ${name}`}
                    subtitle={
                        <>
                            <span className="font-medium text-foreground tabular-nums">{fmtHours(load.planned)}</span>
                            {load.available > 0 ? <> planned of {fmtHours(load.available)}</> : " planned · no hours set on your profile"} · {monthLabel(thisMonth)}
                            {load.overloaded ? (
                                <span className="font-medium text-red-600 dark:text-red-400"> · over by {fmtHours(load.planned - load.available)}</span>
                            ) : null}
                            {load.offDay > 0 ? (
                                <span className="text-amber-700 dark:text-amber-400" title="Hours on tasks due on a Friday, Saturday or Sunday — counted in planned, outside the Mon–Thu working week">
                                    {" "}· {fmtHours(load.offDay)} on off days
                                </span>
                            ) : null}
                        </>
                    }
                    asQ={asQ}
                    calendarHref={`/calendar${filterQuery({ ...filter, member: name }, { as: as || undefined })}`}
                />
                <Nudges items={nudges} />
            </div>

            <ActingAs members={activeTeam} current={name} linkedMember={linked?.name ?? null} makeHref={(n) => href({ as: n })} />

            <TaskToolbar
                basePath="/my-work"
                filter={filter}
                me=""
                members={[]}
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
                <TaskEmpty filtered={isFiltered(filter)} clearHref={`/my-work${filterQuery({}, keep)}`}>
                    Nothing on your plate yet. Tasks appear here when you are an owner on them or when one waits for your sign-off —{" "}
                    <Link href={`/works${asQ}`} className="underline">
                        see every task
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
                            sections={sections}
                            flat={group === "urgency"}
                            showPhase={group !== "phase"}
                            actions={actions}
                        />
                    )}
                </>
            )}
        </div>
    );
}
