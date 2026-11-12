/**
 * Management OVERVIEW — the management team's landing page.
 *
 * Six numbers (pipeline, projects, tasks, review, cash, capacity), one row
 * per job group (By team), and ONE ranked Attention list that mixes
 * projects at risk, people over capacity, task shares with no owner and
 * invoices long overdue. Pure functions, no I/O.
 */
import type { TeamMember } from "@/lib/data/team";
import type { Contract } from "@/lib/data/contracts";
import type { Invoice } from "@/lib/data/invoices";
import { computeTotals } from "@/lib/data/invoices";
import type { Lead } from "@/lib/data/leads";
import type { Work } from "@/lib/data/works";
import { SEAT_CATEGORIES, SEAT_LABEL, SEAT_SHORT } from "@/lib/data/planners";
import { fmtHours, loadFor, type Load } from "@/lib/capacity/helpers";
import { fmtMyrShort } from "@/lib/format";
import { roundHours } from "@/lib/dev-store/team";
import { endsInDays, CONTRACT_ENDING_SOON_DAYS } from "@/lib/contracts/helpers";
import { isOpen, isOverdue, members } from "@/lib/works/helpers";
import {
    APPROVAL_WAIT_DAYS,
    addMonths,
    approvalAgeDays,
    daysSince,
    loadPct,
    monthPhrase,
    resolveMonth,
    shiftYmd,
    todayYmd,
    type Health,
} from "@/lib/management/metrics";

/** An invoice this many days past due is a decision, not a reminder. */
export const INVOICE_DECISION_DAYS = 14;
/** The Attention list never shows more than this. */
export const MAX_DECISIONS = 8;
/** "This week" on the By team table: due today or inside the next 7 days. */
export const WEEK_DAYS = 7;

export type DecisionKind =
    | "contract_overdue"
    | "contract_approvals"
    | "contract_unsigned"
    | "contract_ending"
    | "member_overloaded"
    | "share_unassigned"
    | "invoice_overdue";

export type Decision = {
    kind: DecisionKind;
    severity: "red" | "amber";
    /** What is at stake, e.g. the project or the person. */
    title: string;
    /** Why it is on the list. */
    reason: string;
    /** The whole item in one line of at most 12 words, for the Attention list. */
    short: string;
    /** Who should move it — the account manager, or "" when it is the manager's own call. */
    owner: string;
    /** The concrete next step. */
    nextStep: string;
    href: string;
    /** Higher = earlier in the list. */
    score: number;
};

/** The job groups on the By team table. */
export type TeamKey = "content" | "creative" | "dev" | "seo" | "ads" | "am";

/**
 * One row of the By team table. Delivery groups count the tasks their
 * people hold a share of; account managers count the tasks on the projects
 * they run, and `inReview` is the approvals waiting on them.
 */
export type TeamRow = {
    key: TeamKey;
    label: string;
    /** Active people in the group. */
    people: number;
    names: string[];
    /** Open tasks due today or within WEEK_DAYS. */
    weekDue: number;
    /** Open tasks past their due date. */
    overdue: number;
    /** Delivery: the group's tasks sitting in review. Account managers: approvals waiting on them. */
    inReview: number;
    /** Open task shares in the group's seats that nobody holds. */
    noOwner: number;
    /** Hours on the group's people in the chosen month. */
    plannedHours: number;
    availableHours: number;
    pct: number;
    /** People in the group with more hours planned than available. */
    overloaded: number;
    /** Hours planned on the group in the month after the chosen one (0 = not briefed yet). */
    nextPlannedHours: number;
    health: Health;
    /** One short imperative: "Clear 3 overdue", "Approve 2", "Brief December", "Nothing due". */
    next: string;
    href: string;
};

/** Teams by job category; account managers are whoever runs a project. */
const TEAM_GROUPS: ReadonlyArray<{ key: TeamKey; label: string; roles: readonly string[] }> = [
    { key: "content", label: "Digital marketing", roles: ["dm"] },
    { key: "creative", label: "Creative", roles: ["creative"] },
    { key: "dev", label: "Dev", roles: ["developer"] },
    { key: "am", label: "Account managers", roles: [] },
];

/** "December" for a YYYY-MM. */
function monthName(ym: string): string {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-MY", { month: "long", timeZone: "UTC" });
}

function n(count: number, one: string, many = `${one}s`): string {
    return `${count} ${count === 1 ? one : many}`;
}

/** Team hours in one month: planned on tasks vs available. */
export type MonthCapacity = {
    /** YYYY-MM. */
    month: string;
    plannedHours: number;
    availableHours: number;
    pct: number;
    /** People with more hours planned than available. */
    overloaded: number;
};

export type OverviewSnapshot = {
    today: string;
    /** YYYY-MM the delivery and capacity figures are measured in (the chosen month). */
    month: string;
    /** True when `month` is the month `today` falls in. */
    isCurrentMonth: boolean;
    pipeline: {
        /** Estimated value of every lead not yet won or lost. */
        openValueMyr: number;
        openLeads: number;
        /** Won / (won + lost) over the last 90 days; null when nothing was decided. */
        winRate90Pct: number | null;
        won90: number;
        lost90: number;
    };
    contracts: {
        active: number;
        /** Sum of `valueMyr` on active projects. */
        totalValueMyr: number;
        unsigned: number;
    };
    delivery: {
        /** Tasks due in the chosen month. */
        monthTotal: number;
        monthDone: number;
        /** Open tasks past their due date, any month. */
        overdue: number;
    };
    approvals: {
        waiting: number;
        /** Days the oldest submitted task has waited; 0 when none. */
        oldestDays: number;
        /** Waiting longer than APPROVAL_WAIT_DAYS. */
        stale: number;
    };
    cash: {
        /** Sent + overdue invoices, total. */
        arOpenMyr: number;
        arOpenCount: number;
        overdueMyr: number;
        overdueCount: number;
    };
    /** Hours are planned per month: the chosen month, plus the one after it for planning. */
    capacity: MonthCapacity & {
        activeMembers: number;
        next: MonthCapacity;
    };
    /** One row per job group, in a fixed order. */
    teams: TeamRow[];
    decisions: Decision[];
    /** How many decisions were cut by MAX_DECISIONS. */
    moreDecisions: number;
    /** Every decision, ranked the same way (`decisions` is its first MAX_DECISIONS), for a "Show all". */
    allDecisions: Decision[];
};

export type OverviewInput = {
    team: TeamMember[];
    contracts: Contract[];
    works: Work[];
    invoices: Invoice[];
    leads: Lead[];
    /** YYYY-MM to measure hours in; anything else means the month `today` falls in. */
    month?: string;
};

/** Team hours in one month, plus the people who are over in it. */
function monthCapacity(
    team: TeamMember[],
    works: Work[],
    month: string,
): { summary: MonthCapacity; over: Array<{ member: TeamMember; load: Load }> } {
    const loads = team.map((m) => ({ member: m, load: loadFor(m, works, month) }));
    const plannedHours = roundHours(loads.reduce((s, x) => s + x.load.planned, 0));
    const availableHours = roundHours(loads.reduce((s, x) => s + x.load.available, 0));
    const over = loads.filter((x) => x.load.overloaded);
    return {
        summary: { month, plannedHours, availableHours, pct: loadPct(plannedHours, availableHours), overloaded: over.length },
        over,
    };
}

/** True when another non-cancelled contract for the same client starts on or after this one ends. */
function hasRenewal(c: Contract, contracts: Contract[]): boolean {
    return contracts.some(
        (x) =>
            x.id !== c.id &&
            x.clientName === c.clientName &&
            x.status !== "cancelled" &&
            x.status !== "completed" &&
            (!c.endDate || !x.startDate || x.startDate >= c.endDate || x.createdAt > c.updatedAt),
    );
}

/**
 * The By team table: what each job group must do, from the open tasks and
 * the month's hours. Delivery groups own the tasks their people hold a share
 * of; account managers own the projects they run and the approvals waiting
 * on them. `health` is the colour of `next`.
 */
function buildTeamRows(team: TeamMember[], works: Work[], month: string, today: string): TeamRow[] {
    const openWorks = works.filter(isOpen);
    const weekEnd = shiftYmd(today, WEEK_DAYS);
    const nextMonth = addMonths(month, 1);
    const nextName = monthName(nextMonth);
    // Account managers are whoever runs a project, not a duty.
    const amNames = new Set(works.map((w) => w.accountManager).filter(Boolean));
    return TEAM_GROUPS.map((g) => {
        const isAm = g.key === "am";
        const people = team.filter((m) => (isAm ? amNames.has(m.name) : g.roles.includes(m.category)));
        const names = new Set(people.map((m) => m.name));
        const seats = isAm ? ["am" as const] : (Object.keys(SEAT_CATEGORIES) as Array<keyof typeof SEAT_CATEGORIES>).filter((s) => SEAT_CATEGORIES[s][0] === g.roles[0]);
        const mine = openWorks.filter((w) =>
            isAm ? names.has(w.accountManager) : w.split.some((s) => s.pct > 0 && names.has(s.member)),
        );
        const overdueList = mine.filter((w) => isOverdue(w, today));
        const weekDue = mine.filter((w) => w.dueDate && w.dueDate >= today && w.dueDate <= weekEnd).length;
        const review = mine.filter((w) => w.status === "pending_approval" && (!isAm || w.approver !== "none"));
        const stale = isAm ? review.filter((w) => approvalAgeDays(w, today) > APPROVAL_WAIT_DAYS).length : 0;
        const noOwner = openWorks.filter((w) => w.split.some((s) => s.pct > 0 && !s.member && seats.includes(s.seat))).length;
        const loads = people.map((m) => loadFor(m, works, month));
        const plannedHours = roundHours(loads.reduce((s, l) => s + l.planned, 0));
        const availableHours = roundHours(loads.reduce((s, l) => s + l.available, 0));
        const overloadedPeople = people.filter((_, i) => loads[i].overloaded);
        const nextPlannedHours = roundHours(people.reduce((s, m) => s + loadFor(m, works, nextMonth).planned, 0));
        const pct = loadPct(plannedHours, availableHours);
        const overdue = overdueList.length;

        let health: Health = "green";
        let next = "Nothing due";
        if (isAm) {
            if (stale > 0) [health, next] = ["red", `Approve ${review.length}`];
            else if (overdue > 0) [health, next] = ["red", `Chase ${overdue} overdue`];
            else if (review.length > 0) [health, next] = ["amber", `Approve ${review.length}`];
            else if (noOwner > 0) [health, next] = ["amber", `Assign ${noOwner}`];
            else if (weekDue > 0) [health, next] = ["green", `Deliver ${weekDue} this week`];
        } else if (people.length === 0) {
            if (mine.length + noOwner > 0) [health, next] = ["red", "Hire or reassign"];
            else [health, next] = ["amber", "Nobody in role"];
        } else if (overdue > 0) [health, next] = ["red", `Clear ${overdue} overdue`];
        else if (plannedHours > availableHours) [health, next] = ["red", `Rebalance ${fmtHours(plannedHours - availableHours)}`];
        else if (overloadedPeople.length > 0) [health, next] = ["red", `Rebalance ${overloadedPeople.map((m) => m.name).join(", ")}`];
        else if (noOwner > 0) [health, next] = ["amber", `Assign ${noOwner}`];
        else if (pct > 85) [health, next] = ["amber", "Hold new work"];
        else if (nextPlannedHours === 0) [health, next] = ["amber", `Brief ${nextName}`];
        else if (weekDue > 0) [health, next] = ["green", `Finish ${weekDue} this week`];

        const href = isAm
            ? `/works?approval=1`
            : overdue > 0
              ? `/works?overdue=1`
              : `/dashboard?tab=team&month=${month}`;

        return {
            key: g.key,
            label: g.label,
            people: people.length,
            names: people.map((m) => m.name).sort(),
            weekDue,
            overdue,
            inReview: review.length,
            noOwner,
            plannedHours,
            availableHours,
            pct,
            overloaded: overloadedPeople.length,
            nextPlannedHours,
            health,
            next,
            href,
        };
    });
}

export function buildOverviewSnapshot(input: OverviewInput, today: string = todayYmd()): OverviewSnapshot {
    const { team, contracts, works, invoices, leads } = input;
    const month = resolveMonth(input.month, today);
    const isCurrentMonth = month === today.slice(0, 7);
    const inMonth = monthPhrase(month, today);
    const ninetyAgo = shiftYmd(today, -90);

    // ---- Pipeline
    const openLeads = leads.filter((l) => l.status !== "won" && l.status !== "lost");
    const won90 = leads.filter((l) => l.status === "won" && l.updatedAt.slice(0, 10) >= ninetyAgo).length;
    const lost90 = leads.filter((l) => l.status === "lost" && l.updatedAt.slice(0, 10) >= ninetyAgo).length;

    // ---- Projects
    const active = contracts.filter((c) => c.status === "active");

    // ---- Delivery
    const openWorks = works.filter(isOpen);
    const monthWorks = works.filter((w) => w.month === month);
    const overdueWorks = openWorks.filter((w) => isOverdue(w, today));

    // ---- Approvals
    const waiting = openWorks.filter((w) => w.status === "pending_approval");
    const ages = waiting.map((w) => approvalAgeDays(w, today));
    const oldestDays = ages.length ? Math.max(...ages) : 0;

    // ---- Cash
    const ar = invoices.filter((i) => i.status === "sent" || i.status === "overdue");
    const overdueInvoices = ar.filter((i) => i.status === "overdue" || i.dueDate < today);
    const total = (i: Invoice) => computeTotals(i).total;

    // ---- Capacity: the chosen month, and the month after it for planning
    const activeTeam = team.filter((m) => m.active);
    const thisMonth = monthCapacity(activeTeam, works, month);
    const nextMonth = monthCapacity(activeTeam, works, addMonths(month, 1));
    const overloaded = thisMonth.over;

    // ---- Needs a decision
    const decisions: Decision[] = [];
    for (const c of active) {
        const mine = openWorks.filter((w) => w.contractId === c.id);
        const overdue = mine.filter((w) => isOverdue(w, today));
        const stale = mine.filter((w) => w.status === "pending_approval" && approvalAgeDays(w, today) > APPROVAL_WAIT_DAYS);
        const owner = c.accountManager;
        const where = `${c.clientName} · ${c.code}`;
        if (overdue.length > 0) {
            const worst = [...overdue].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
            const late = daysSince(worst.dueDate, today);
            decisions.push({
                kind: "contract_overdue",
                severity: "red",
                title: c.name,
                reason: `${overdue.length} task${overdue.length === 1 ? "" : "s"} overdue · ${worst.title} is ${late}d late · ${where}`,
                short: `${c.clientName}: ${n(overdue.length, "task")} overdue, worst ${late}d late`,
                owner,
                nextStep: "Re-date the tasks with the client or move a share to someone with hours",
                href: `/works?client=${encodeURIComponent(c.clientName)}&overdue=1`,
                score: 100 + Math.min(overdue.length, 20) + Math.min(late, 30) / 10,
            });
        }
        if (stale.length > 0) {
            const oldest = Math.max(...stale.map((w) => approvalAgeDays(w, today)));
            const client = stale.filter((w) => w.approver === "client").length;
            decisions.push({
                kind: "contract_approvals",
                severity: "amber",
                title: c.name,
                reason: `${stale.length} approval${stale.length === 1 ? "" : "s"} waiting ${oldest}d${client ? ` · ${client} with the client` : ""} · ${where}`,
                short: `${c.clientName}: ${stale.length} in review ${oldest}d${client ? `, ${client} with client` : ""}`,
                owner,
                nextStep: client ? "Chase the client, or approve on their behalf and note it" : "Approve or send back today",
                href: `/works?client=${encodeURIComponent(c.clientName)}&status=pending_approval`,
                score: 70 + Math.min(stale.length, 10) + Math.min(oldest, 30) / 10,
            });
        }
        if (!c.signedAt) {
            decisions.push({
                kind: "contract_unsigned",
                severity: mine.length > 0 ? "red" : "amber",
                title: c.name,
                reason: `Active and ${mine.length > 0 ? `${mine.length} task${mine.length === 1 ? "" : "s"} running` : "not started"} with no signed copy${c.valueMyr ? ` · RM ${c.valueMyr.toLocaleString("en-MY")}` : ""} · ${where}`,
                short: `${c.clientName} ${c.code}: unsigned, ${mine.length > 0 ? `${n(mine.length, "task")} running` : "not started"}`,
                owner,
                nextStep: "Get the signature, or pause the work until it lands",
                href: `/projects/${c.id}?tab=money#terms`,
                score: 60 + (mine.length > 0 ? 10 : 0),
            });
        }
        const ending = endsInDays(c, today);
        if (ending !== null && ending <= CONTRACT_ENDING_SOON_DAYS && !hasRenewal(c, contracts)) {
            decisions.push({
                kind: "contract_ending",
                severity: ending <= 14 ? "red" : "amber",
                title: c.name,
                reason: `Ends ${c.endDate} (in ${ending}d) with no renewal on file · ${where}`,
                short: `${c.clientName} ${c.code}: ends in ${ending}d, no renewal`,
                owner,
                nextStep: "Decide: renewal proposal, extension, or close it out",
                href: `/projects/${c.id}`,
                score: 40 + (CONTRACT_ENDING_SOON_DAYS - ending),
            });
        }
    }
    for (const x of overloaded) {
        const over = roundHours(x.load.planned - x.load.available);
        decisions.push({
            kind: "member_overloaded",
            severity: "red",
            title: x.member.name,
            reason: `${fmtHours(x.load.planned)} planned vs ${fmtHours(x.load.available)} available ${inMonth} · over by ${fmtHours(over)} · ${x.load.tasks} task${x.load.tasks === 1 ? "" : "s"}`,
            short: `${x.member.name}: over capacity by ${fmtHours(over)} ${inMonth}`,
            owner: "",
            nextStep: "Move a task or a share to someone with hours, or re-date it",
            href: `/team/${x.member.id}`,
            score: 80 + Math.min(over, 40) / 2,
        });
    }
    const unassigned = openWorks
        .filter((w) => w.split.some((s) => s.pct > 0 && !s.member))
        .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
    for (const w of unassigned) {
        const open = w.split.filter((s) => s.pct > 0 && !s.member);
        const seats = open.map((s) => SEAT_LABEL[s.seat].toLowerCase());
        const contract = contracts.find((c) => c.id === w.contractId);
        const nobody = members(w).length === 0;
        const late = isOverdue(w, today);
        decisions.push({
            kind: "share_unassigned",
            severity: nobody || late ? "red" : "amber",
            title: w.title,
            reason: `${nobody ? "Nobody on it" : `${seats.join(" + ")} share open`} · ${w.clientName}${contract ? ` · ${contract.code}` : ""}${w.dueDate ? ` · due ${w.dueDate}${late ? " (overdue)" : ""}` : ""}`,
            short: `${w.clientName}: ${w.title} has no ${open.map((s) => SEAT_SHORT[s.seat]).join("/")} owner${late ? ", overdue" : ""}`,
            owner: w.accountManager,
            nextStep: `Put someone in the ${seats.join(" / ")} seat`,
            href: `/works/${w.id}`,
            score: 50 + (nobody ? 10 : 0) + (late ? 20 : 0),
        });
    }
    for (const i of overdueInvoices) {
        const late = daysSince(i.dueDate, today);
        if (late < INVOICE_DECISION_DAYS) continue;
        const contract = i.contractId ? contracts.find((c) => c.id === i.contractId) : undefined;
        decisions.push({
            kind: "invoice_overdue",
            severity: "red",
            title: `${i.number} · ${i.clientName}`,
            reason: `RM ${total(i).toLocaleString("en-MY")} · ${late}d past due (${i.dueDate})${contract ? ` · ${contract.code}` : ""}`,
            short: `${i.clientName}: ${i.number} ${fmtMyrShort(total(i))}, ${late}d late`,
            owner: contract?.accountManager ?? "",
            nextStep: late >= 30 ? "Decide: pause the work, payment plan, or escalate" : "Final reminder from the account manager this week",
            href: `/invoices/${i.id}`,
            score: 90 + Math.min(late, 90) / 3,
        });
    }
    decisions.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

    return {
        today,
        month,
        isCurrentMonth,
        pipeline: {
            openValueMyr: openLeads.reduce((s, l) => s + (l.estValueMyr || 0), 0),
            openLeads: openLeads.length,
            winRate90Pct: won90 + lost90 ? Math.round((won90 / (won90 + lost90)) * 100) : null,
            won90,
            lost90,
        },
        contracts: {
            active: active.length,
            totalValueMyr: active.reduce((s, c) => s + (c.valueMyr || 0), 0),
            unsigned: active.filter((c) => !c.signedAt).length,
        },
        delivery: {
            monthTotal: monthWorks.length,
            monthDone: monthWorks.filter((w) => !isOpen(w)).length,
            overdue: overdueWorks.length,
        },
        approvals: {
            waiting: waiting.length,
            oldestDays,
            stale: ages.filter((d) => d > APPROVAL_WAIT_DAYS).length,
        },
        cash: {
            arOpenMyr: ar.reduce((s, i) => s + total(i), 0),
            arOpenCount: ar.length,
            overdueMyr: overdueInvoices.reduce((s, i) => s + total(i), 0),
            overdueCount: overdueInvoices.length,
        },
        capacity: {
            ...thisMonth.summary,
            activeMembers: activeTeam.length,
            next: nextMonth.summary,
        },
        teams: buildTeamRows(activeTeam, works, month, today),
        decisions: decisions.slice(0, MAX_DECISIONS),
        moreDecisions: Math.max(0, decisions.length - MAX_DECISIONS),
        allDecisions: decisions,
    };
}
