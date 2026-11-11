import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { redirect } from "next/navigation";
import { getActingMember, requireTeamAccess } from "@/lib/auth";
import { seesEverything } from "@/lib/scope";
import { listTeamMembers } from "@/lib/data/team";
import { listClients } from "@/lib/data/clients";
import { listSprintTasks } from "@/lib/data/sprint-tasks";
import { listContracts } from "@/lib/data/contracts";
import { listWorks } from "@/lib/data/works";
import { listCampaigns, listContentPosts, listQuotations } from "@/lib/data/reads";
import { fmtHours } from "@/lib/capacity/helpers";
import {
    buildWorkSnapshot,
    type ClientContract,
    type MemberWork,
    type WorkItem,
    type WorkKind,
} from "@/lib/management/work";
import { fmtMyrShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AsOf, Chip, Empty, KpiTile, ProgressBar, Section, fmtMyr, plural } from "../ui";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<WorkKind, string> = {
    task: "Task",
    sprint: "Sprint task",
    content: "Content",
};
const KIND_VARIANT: Record<WorkKind, "default" | "secondary" | "outline"> = {
    task: "default",
    sprint: "outline",
    content: "secondary",
};

function WorkList({ items }: { items: WorkItem[] }) {
    if (items.length === 0) return <Empty>Nothing assigned.</Empty>;
    return (
        <ul className="divide-y">
            {items.map((it, i) => (
                <li key={i} className="grid gap-1 py-2 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)] md:items-center">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Badge variant={KIND_VARIANT[it.kind]}>{KIND_LABEL[it.kind]}</Badge>
                            <Link href={it.href} className="text-sm font-medium hover:underline">
                                {it.title}
                            </Link>
                            {it.outOfRole ? (
                                <Chip tone="warn" title={`Owned by ${it.ownerRole}`}>
                                    off-role · {it.ownerRole}
                                </Chip>
                            ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {[it.clientName, it.contractName, it.meta].filter(Boolean).join(" · ") || "internal"}
                        </p>
                    </div>
                    <p
                        className={cn(
                            "text-xs tabular-nums md:text-right",
                            it.overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground",
                        )}
                    >
                        {it.due ? (it.overdue ? `overdue · was ${it.due}` : `due ${it.due}`) : "no date"}
                    </p>
                </li>
            ))}
        </ul>
    );
}

function MemberCard({ m }: { m: MemberWork }) {
    return (
        <div id={`member-${encodeURIComponent(m.name)}`} className="rounded-lg border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link href={`/works?member=${encodeURIComponent(m.name)}`} className="font-medium hover:underline">
                        {m.name}
                    </Link>
                    <Badge variant="outline">{m.role}</Badge>
                    {m.clients.map((c) => (
                        <Chip key={c}>{c}</Chip>
                    ))}
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                    {plural(m.items.length, "item")} · {fmtHours(m.hours)} on tasks
                    {m.overdue > 0 ? (
                        <>
                            {" · "}
                            <span className="font-medium text-red-600 dark:text-red-400">{m.overdue} overdue</span>
                        </>
                    ) : null}
                    {m.outOfRole > 0 ? (
                        <>
                            {" · "}
                            <span className="font-medium text-amber-700 dark:text-amber-400">{m.outOfRole} off-role</span>
                        </>
                    ) : null}
                </p>
            </div>
            <div className="px-3">
                <WorkList items={m.items} />
            </div>
        </div>
    );
}

function ContractCard({ c }: { c: ClientContract }) {
    const promise: string[] = [];
    if (c.packageName) promise.push(`${c.packageName} package`);
    if (c.retainerMyr > 0) promise.push(`${fmtMyr(c.retainerMyr)}/mo retainer`);
    if (c.contentQuota > 0) promise.push(`${c.contentQuota} content items/mo`);
    if (c.revisionLimit > 0) promise.push(`${c.revisionLimit} revision rounds per item`);
    return (
        <div className="rounded-lg border bg-card">
            <div className="border-b p-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link href={c.href} className="font-medium hover:underline">
                        {c.name}
                    </Link>
                    <Badge variant="outline">{c.status}</Badge>
                    <span className="text-xs text-muted-foreground">AM {c.accountManager || "—"}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                    {promise.length ? promise.join(" · ") : "No package terms recorded"}
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <div>
                        <p className="text-[11px] text-muted-foreground">Tasks delivered</p>
                        <ProgressBar pct={c.promisedTasks ? (c.deliveredTasks / c.promisedTasks) * 100 : 0} />
                        <p className="mt-0.5 text-xs tabular-nums">
                            {c.deliveredTasks}/{c.promisedTasks} on active contracts
                        </p>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground">Milestones hit</p>
                        <ProgressBar pct={c.milestonesTotal ? (c.milestonesDone / c.milestonesTotal) * 100 : 0} />
                        <p className="mt-0.5 text-xs tabular-nums">
                            {c.milestonesDone}/{c.milestonesTotal} milestone tasks done
                        </p>
                    </div>
                    <div>
                        <p className="text-[11px] text-muted-foreground">Content this month</p>
                        <ProgressBar
                            pct={c.contentQuota ? (c.contentPosted / c.contentQuota) * 100 : c.contentPlanned ? (c.contentPosted / c.contentPlanned) * 100 : 0}
                            health={c.contentQuota > 0 && c.contentPlanned < c.contentQuota ? "amber" : "green"}
                        />
                        <p className="mt-0.5 text-xs tabular-nums">
                            {c.contentPosted} posted · {c.contentApproved} approved · {c.contentPlanned} planned
                            {c.contentQuota ? ` · quota ${c.contentQuota}` : ""}
                        </p>
                    </div>
                </div>
            </div>
            <div className="space-y-3 p-3">
                {c.contracts.length > 0 ? (
                    <ul className="divide-y">
                        {c.contracts.map((x) => (
                            <li key={x.id} className="flex flex-col gap-1 py-2 md:flex-row md:items-center md:justify-between">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <Link href={x.href} className="text-sm font-medium hover:underline">
                                        {x.name}
                                    </Link>
                                    <span className="text-xs text-muted-foreground">{x.code}</span>
                                    <Badge variant={x.status === "active" ? "default" : "outline"}>{x.status}</Badge>
                                    {!x.signed && x.status === "active" ? <Chip tone="bad">unsigned</Chip> : null}
                                    {x.amountMyr ? (
                                        <span className="text-xs text-muted-foreground">
                                            {fmtMyr(x.amountMyr)}/{x.cadence === "monthly" ? "mo" : x.cadence.replace(/_/g, " ")}
                                        </span>
                                    ) : null}
                                </div>
                                <p className="text-xs text-muted-foreground tabular-nums">
                                    <Link href={`${x.href}#works`} className="hover:underline">
                                        {x.tasksDone}/{x.tasks} tasks done
                                    </Link>
                                    {x.overdue ? (
                                        <span className="font-medium text-red-600 dark:text-red-400"> · {x.overdue} overdue</span>
                                    ) : null}
                                    {" · "}
                                    {x.content} content · {x.campaigns} camp
                                </p>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <Chip tone="bad">no contract on file</Chip>
                )}
                {c.campaigns.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                        {c.campaigns.map((x) => (
                            <Link key={x.id} href={x.href}>
                                <Chip tone={x.status === "live" ? "good" : "neutral"}>
                                    {x.platform} · {x.name} · {x.status} · {fmtMyr(x.monthlyBudgetMyr)}/mo · {x.feeLabel}
                                </Chip>
                            </Link>
                        ))}
                    </div>
                ) : null}
                {c.quotes.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                        Accepted quotes:{" "}
                        {c.quotes.map((q, i) => (
                            <span key={q.id}>
                                {i > 0 ? " · " : ""}
                                <Link href={q.href} className="underline">
                                    {q.number}
                                </Link>{" "}
                                {q.subject ? `${q.subject} · ` : ""}
                                {fmtMyr(q.totalMyr)}
                                {q.acceptedAt ? ` (accepted ${q.acceptedAt})` : ""}
                            </span>
                        ))}
                    </p>
                ) : null}
            </div>
        </div>
    );
}

export default async function ManagementWorkPage() {
    await requireTeamAccess();
    // Managers only (or nobody picked under the dev bypass).
    if (!seesEverything(await getActingMember())) redirect("/home");
    const [team, clients, contracts, works, sprintTasks, content, campaigns, quotations] = await Promise.all([
        listTeamMembers(),
        listClients(),
        listContracts(),
        listWorks(),
        listSprintTasks(),
        listContentPosts(),
        listCampaigns(),
        listQuotations(),
    ]);
    const snap = buildWorkSnapshot({ team, clients, contracts, works, sprintTasks, content, campaigns, quotations });
    const k = snap.kpis;

    const kpis: Array<React.ComponentProps<typeof KpiTile>> = [
        {
            label: "Tasks promised → delivered",
            value: `${k.deliveredTasks} / ${k.promisedTasks}`,
            hint: "across active contracts",
            href: "#promised",
        },
        {
            label: "Content promised this month",
            value: String(k.contentQuota),
            hint: `${k.contentPlanned} planned · ${k.contentPosted} posted`,
            href: "#promised",
            tone: k.contentPlanned < k.contentQuota ? "warn" : "good",
        },
        { label: "Live campaigns", value: String(k.liveCampaigns), href: "/campaigns" },
        {
            label: "Signed contracts",
            value: fmtMyrShort(k.acceptedContractsMyr),
            hint: "accepted / converted quotes",
            href: "/management/clients#contracts",
        },
        {
            label: "Open work items",
            value: String(k.openItems),
            hint: "tasks, sprint tasks, content on plates",
            href: "#by-member",
        },
        {
            label: "No owner",
            value: String(k.unassignedItems),
            hint: "promised but nobody owns it",
            href: "#unassigned",
            tone: k.unassignedItems > 0 ? "warn" : "good",
        },
    ];

    return (
        <div className="space-y-6">
            <AsOf today={snap.today}>
                What we promised each client, and the exact list every team member should be working through.
            </AsOf>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {kpis.map((t) => (
                    <KpiTile key={t.label} {...t} />
                ))}
            </div>

            <Section
                id="by-member"
                title="Work list by team member"
                description="Everything on each person's plate, overdue first then by due date. Task = a contract task they hold a share of (with the hours they plan for it), or must approve. Heaviest in hours first."
            >
                {snap.members.length === 0 ? (
                    <Empty>No active team members.</Empty>
                ) : (
                    <div className="grid gap-3 lg:grid-cols-2">
                        {snap.members.map((m) => (
                            <MemberCard key={m.id} m={m} />
                        ))}
                    </div>
                )}
            </Section>

            <Section
                id="unassigned"
                title="No owner"
                description="Promised to a client but not on anyone's plate. Put someone on it."
            >
                {snap.unassigned.length === 0 ? <Empty>Everything has an owner.</Empty> : <WorkList items={snap.unassigned} />}
            </Section>

            <Section
                id="promised"
                title="What we promised each client"
                description="The contracts each client is on and how their tasks are moving, package terms, live campaigns, and accepted quotes. Open the contract for the month-by-month task board."
            >
                {snap.clients.length === 0 ? (
                    <Empty>No clients with work on the books.</Empty>
                ) : (
                    <div className="space-y-3">
                        {snap.clients.map((c) => (
                            <ContractCard key={c.id} c={c} />
                        ))}
                    </div>
                )}
            </Section>
        </div>
    );
}
