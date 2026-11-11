/**
 * Management metrics — WORK view: what we promised each client, and the
 * concrete list of things each team member has on their plate.
 *
 * "Promised" = the contracts a client is on (and the tasks planned under
 * them), package terms (retainer, content quota), live campaigns, and
 * accepted quotations. "Work list" = open contract tasks (by share, plus
 * approvals waiting on the account manager), open sprint tasks and open
 * content items, per person, sorted by due date. Pure functions, no I/O.
 */
import type { TeamMember } from "@/lib/data/team";
import type { Client } from "@/lib/data/clients";
import type { SprintTask } from "@/lib/data/sprint-tasks";
import type { ContentPost } from "@/lib/data/content";
import type { Campaign } from "@/lib/data/campaigns";
import type { Quotation } from "@/lib/data/quotations";
import { computeTotals as quoteTotals } from "@/lib/data/quotations";
import type { Contract } from "@/lib/data/contracts";
import type { Work } from "@/lib/data/works";
import { SEAT_LABEL, SEAT_ROLES } from "@/lib/data/planners";
import { awaitsApprovalFrom, isOpen, isOverdue, monthLabel } from "@/lib/works/helpers";
import { shareHours, taskHours } from "@/lib/capacity/helpers";
import { roundHours } from "@/lib/dev-store/team";
import {
    NON_DELIVERY_ROLES,
    holdersOf,
    isOpenContent,
    todayYmd,
} from "@/lib/management/metrics";

const CONTENT_ROLES: ReadonlySet<string> = new Set(["Content", "UI/UX"]);

export type WorkKind = "task" | "sprint" | "content";

export type WorkItem = {
    kind: WorkKind;
    title: string;
    clientName: string;
    /** Contract (or phase / month) the item belongs to; "" for internal work. */
    contractName: string;
    /** YYYY-MM-DD or "" when undated. */
    due: string;
    overdue: boolean;
    /** Seat(s) this person holds on the task, or "Content"; "" when not role-bound. */
    ownerRole: string;
    outOfRole: boolean;
    /** Extra context: share, task status, content status, etc. */
    meta: string;
    /** Hours this item puts on the plate (this person's share of a task; 0 for sprint tasks and content, which carry no hours yet). */
    hours: number;
    href: string;
};

export type MemberWork = {
    id: string;
    name: string;
    role: string;
    items: WorkItem[];
    overdue: number;
    outOfRole: number;
    /** Hours on the open tasks this person holds (any month). */
    hours: number;
    clients: string[];
};

export type CampaignScope = {
    id: string;
    name: string;
    platform: string;
    status: string;
    monthlyBudgetMyr: number;
    feeLabel: string;
    href: string;
};

export type QuoteScope = {
    id: string;
    number: string;
    subject: string;
    status: string;
    totalMyr: number;
    acceptedAt: string;
    href: string;
};

export type ContractScope = {
    id: string;
    code: string;
    name: string;
    status: string;
    stage: string;
    accountManager: string;
    cadence: string;
    amountMyr: number;
    signed: boolean;
    tasks: number;
    tasksDone: number;
    overdue: number;
    content: number;
    campaigns: number;
    href: string;
};

export type ClientContract = {
    id: string;
    name: string;
    status: string;
    accountManager: string;
    contracts: ContractScope[];
    packageName: string;
    retainerMyr: number;
    contentQuota: number;
    revisionLimit: number;
    contentPlanned: number;
    contentPosted: number;
    contentApproved: number;
    campaigns: CampaignScope[];
    quotes: QuoteScope[];
    /** Tasks planned under the client's active contracts, and how many are done. */
    promisedTasks: number;
    deliveredTasks: number;
    /** Milestone tasks under active contracts, and how many are done. */
    milestonesTotal: number;
    milestonesDone: number;
    /** Open tasks + open content. */
    openItems: number;
    href: string;
};

export type WorkSnapshot = {
    today: string;
    kpis: {
        promisedTasks: number;
        deliveredTasks: number;
        contentQuota: number;
        contentPlanned: number;
        contentPosted: number;
        liveCampaigns: number;
        openItems: number;
        unassignedItems: number;
        acceptedContractsMyr: number;
    };
    clients: ClientContract[];
    members: MemberWork[];
    unassigned: WorkItem[];
};

export type WorkInput = {
    team: TeamMember[];
    clients: Client[];
    contracts: Contract[];
    works: Work[];
    sprintTasks: SprintTask[];
    content: ContentPost[];
    campaigns: Campaign[];
    quotations: Quotation[];
};

function feeLabel(c: Campaign): string {
    switch (c.feeModel) {
        case "flat":
            return `RM ${c.flatFeeMyr.toLocaleString()}/mo fee`;
        case "percent":
            return `${c.percentFee}% of spend`;
        case "flat_plus_percent":
            return `RM ${c.flatFeeMyr.toLocaleString()}/mo + ${c.percentFee}%`;
        default:
            return "in-house";
    }
}

function statusLabel(w: Work): string {
    return w.status.replace(/_/g, " ");
}

export function buildWorkSnapshot(
    input: WorkInput,
    today: string = todayYmd(),
): WorkSnapshot {
    const { team, clients, contracts: allContracts, works, sprintTasks, content, campaigns, quotations } = input;
    const month = today.slice(0, 7);
    const activeTeam = team.filter((m) => m.active);
    const roleByName = new Map(activeTeam.map((m) => [m.name, m.role as string]));
    const contractById = new Map(allContracts.map((c) => [c.id, c]));
    const openWorks = works.filter(isOpen);
    const openContent = content.filter(isOpenContent);
    const openSprint = sprintTasks.filter((t) => t.status === "open");

    // ---- Work items, bucketed by person (unassigned kept aside)
    const byPerson = new Map<string, WorkItem[]>();
    const unassigned: WorkItem[] = [];
    const push = (who: string, item: WorkItem) => {
        if (!who) {
            unassigned.push(item);
            return;
        }
        const arr = byPerson.get(who) ?? [];
        arr.push(item);
        byPerson.set(who, arr);
    };

    // Contract tasks: everyone with a share holds their share; the account
    // manager holds approvals. A task nobody is on goes to the unassigned list.
    for (const w of openWorks) {
        const contract = contractById.get(w.contractId);
        const contractName = contract?.name ?? `${w.phaseName || monthLabel(w.month)}`;
        const overdue = isOverdue(w, today);
        const href = `/works/${w.id}`;
        const holders = holdersOf(w);
        if (holders.length === 0) {
            push("", {
                kind: "task",
                title: w.title,
                clientName: w.clientName,
                contractName,
                due: w.dueDate,
                overdue,
                ownerRole: w.split.map((s) => SEAT_LABEL[s.seat]).join(" / "),
                outOfRole: false,
                meta: `${monthLabel(w.month)} · ${statusLabel(w)}`,
                hours: taskHours(w),
                href,
            });
            continue;
        }
        for (const holder of holders) {
            const approving = awaitsApprovalFrom(w, holder);
            const shares = w.split.filter((s) => s.member === holder && s.pct > 0);
            const memberRole = roleByName.get(holder);
            const outOfRole = Boolean(memberRole) && shares.some((s) => !(SEAT_ROLES[s.seat] as readonly string[]).includes(memberRole!));
            const seatLabels = shares.map((s) => SEAT_LABEL[s.seat]);
            const pct = shares.reduce((s, x) => s + x.pct, 0);
            const hours = shareHours(w, holder);
            push(holder, {
                kind: "task",
                title: w.title,
                clientName: w.clientName,
                contractName,
                due: w.dueDate,
                overdue,
                ownerRole: approving && seatLabels.length === 0 ? "Account manager" : seatLabels.join(" / "),
                outOfRole,
                meta: [
                    monthLabel(w.month),
                    statusLabel(w),
                    approving ? (w.approver === "client" ? "client approval via you" : "awaiting your approval") : pct ? `${pct}% share` : "",
                    hours > 0 ? `${hours}h` : "",
                ]
                    .filter(Boolean)
                    .join(" · "),
                hours,
                href,
            });
        }
    }
    for (const t of openSprint) {
        push(t.pic, {
            kind: "sprint",
            title: t.title,
            clientName: "",
            contractName: "",
            due: t.deadline,
            overdue: t.deadline < today,
            ownerRole: "",
            outOfRole: false,
            meta: t.details,
            hours: 0,
            href: "/tasks",
        });
    }
    for (const c of openContent) {
        const memberRole = roleByName.get(c.assignee);
        const review =
            c.reviewStatus === "awaiting_client"
                ? "awaiting client"
                : c.reviewStatus === "changes_requested"
                  ? "changes requested"
                  : c.reviewStatus === "approved"
                    ? "approved"
                    : "";
        push(c.assignee, {
            kind: "content",
            title: c.title,
            clientName: c.clientName,
            contractName: "",
            due: c.scheduledFor,
            overdue: Boolean(c.scheduledFor) && c.scheduledFor < today,
            ownerRole: "Content",
            outOfRole: Boolean(memberRole) && !CONTENT_ROLES.has(memberRole!) && !NON_DELIVERY_ROLES.has(memberRole!),
            meta: [c.platform, c.status, review].filter(Boolean).join(" · "),
            hours: 0,
            href: `/content/${c.id}`,
        });
    }

    const sortItems = (items: WorkItem[]) =>
        items.sort((a, b) => {
            if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
            if (a.due && b.due) return a.due.localeCompare(b.due);
            if (a.due) return -1;
            if (b.due) return 1;
            return a.clientName.localeCompare(b.clientName);
        });

    const members_: MemberWork[] = activeTeam
        .map((m) => {
            const items = sortItems(byPerson.get(m.name) ?? []);
            return {
                id: m.id,
                name: m.name,
                role: m.role,
                items,
                overdue: items.filter((i) => i.overdue).length,
                outOfRole: items.filter((i) => i.outOfRole).length,
                hours: roundHours(items.reduce((s, i) => s + i.hours, 0)),
                clients: [...new Set(items.map((i) => i.clientName).filter(Boolean))].sort(),
            };
        })
        .sort((a, b) => b.hours - a.hours || b.items.length - a.items.length || a.name.localeCompare(b.name));
    sortItems(unassigned);

    // ---- Contract scope per client
    const rows: ClientContract[] = clients
        .filter((c) => c.status !== "prospect")
        .map((c) => {
            const camps = campaigns
                .filter((x) => x.clientName === c.name && x.status !== "ended")
                .map<CampaignScope>((x) => ({
                    id: x.id,
                    name: x.name,
                    platform: x.platform,
                    status: x.status,
                    monthlyBudgetMyr: x.monthlyBudgetMyr,
                    feeLabel: feeLabel(x),
                    href: `/campaigns/${x.id}`,
                }));
            const quotes = quotations
                .filter((q) => q.clientName === c.name && (q.status === "accepted" || q.status === "converted"))
                .map<QuoteScope>((q) => ({
                    id: q.id,
                    number: q.number,
                    subject: q.subject,
                    status: q.status,
                    totalMyr: quoteTotals(q).total,
                    acceptedAt: q.acceptedAt ? q.acceptedAt.slice(0, 10) : "",
                    href: `/quotes/${q.id}`,
                }));
            const monthContent = content.filter(
                (x) => x.clientName === c.name && (x.planMonth === month || x.scheduledFor.startsWith(month)),
            );
            const contractScopes = allContracts
                .filter((x) => x.clientName === c.name && x.status !== "cancelled")
                .sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || a.name.localeCompare(b.name))
                .map<ContractScope>((x) => {
                    const mine = works.filter((w) => w.contractId === x.id);
                    const open = mine.filter(isOpen);
                    return {
                        id: x.id,
                        code: x.code,
                        name: x.name,
                        status: x.status,
                        stage: x.stage,
                        accountManager: x.accountManager,
                        cadence: x.billing.cadence,
                        amountMyr: x.billing.amountMyr,
                        signed: Boolean(x.signedAt),
                        tasks: mine.length,
                        tasksDone: mine.length - open.length,
                        overdue: open.filter((w) => isOverdue(w, today)).length,
                        content: content.filter((p) => p.contractId === x.id).length,
                        campaigns: campaigns.filter((p) => p.contractId === x.id).length,
                        href: `/contracts/${x.id}`,
                    };
                });
            const activeIds = new Set(contractScopes.filter((x) => x.status === "active").map((x) => x.id));
            const promised = works.filter((w) => activeIds.has(w.contractId));
            const milestones = promised.filter((w) => w.milestone);
            const openItems =
                openWorks.filter((w) => w.clientName === c.name).length +
                openContent.filter((x) => x.clientName === c.name).length;
            return {
                id: c.id,
                name: c.name,
                status: c.status,
                accountManager: c.accountManager,
                contracts: contractScopes,
                packageName: c.packageName,
                retainerMyr: c.monthlyRetainerMyr || 0,
                contentQuota: c.monthlyContentQuota || 0,
                revisionLimit: c.contentRevisionLimit || 0,
                contentPlanned: monthContent.length,
                contentPosted: monthContent.filter((x) => x.status === "posted").length,
                contentApproved: monthContent.filter((x) => x.reviewStatus === "approved").length,
                campaigns: camps,
                quotes,
                promisedTasks: promised.length,
                deliveredTasks: promised.filter((w) => !isOpen(w)).length,
                milestonesTotal: milestones.length,
                milestonesDone: milestones.filter((w) => !isOpen(w)).length,
                openItems,
                href: `/settings/clients/${c.id}`,
            };
        })
        .filter(
            (c) =>
                c.status === "active" ||
                c.openItems > 0 ||
                c.campaigns.length > 0 ||
                c.contracts.some((x) => x.status === "active"),
        )
        .sort(
            (a, b) =>
                Number(a.status === "active") * -1 - Number(b.status === "active") * -1 ||
                b.openItems - a.openItems ||
                a.name.localeCompare(b.name),
        );

    return {
        today,
        kpis: {
            promisedTasks: rows.reduce((s, c) => s + c.promisedTasks, 0),
            deliveredTasks: rows.reduce((s, c) => s + c.deliveredTasks, 0),
            contentQuota: rows.reduce((s, c) => s + (c.status === "active" ? c.contentQuota : 0), 0),
            contentPlanned: rows.reduce((s, c) => s + c.contentPlanned, 0),
            contentPosted: rows.reduce((s, c) => s + c.contentPosted, 0),
            liveCampaigns: campaigns.filter((c) => c.status === "live").length,
            openItems: members_.reduce((s, m) => s + m.items.length, 0) + unassigned.length,
            unassignedItems: unassigned.length,
            acceptedContractsMyr: rows.reduce(
                (s, c) => s + c.quotes.reduce((t, q) => t + q.totalMyr, 0),
                0,
            ),
        },
        clients: rows,
        members: members_,
        unassigned,
    };
}
