/**
 * Management (team-leader / PM) metrics — TEAM view.
 *
 * Pure functions over the entities the app already stores — no I/O, nothing
 * new persisted. The pages are thin loaders; everything here is derived per
 * request from team members, clients, projects and their tasks (works),
 * sprint tasks, content posts and invoices.
 *
 * Load model — HOURS, PER MONTH (see `@/lib/capacity/helpers`). Every task
 * share carries the hours its holder plans for it, prefilled from their
 * profile table. A person's load for a month is the hours on the tasks due
 * that month (`Work.month`) against the hours they have available that month
 * ((weekly hours − reserved hours) ÷ 4 working days × the Mon–Thu working
 * days in the month). The % in the UI is planned / available; over 100% is
 * overloaded. Hours on tasks due on an off day (Fri–Sun) still count in
 * planned and are reported separately as off-day work. Sprint tasks and
 * content items carry no hours yet — they are shown as counts beside the
 * hours, never added to them. Approval / waiting time is never counted.
 *
 * The snapshot is built for ONE chosen month (`ManagementInput.month`,
 * default: the current month) so management can look ahead: for a future
 * month `planned` is the whole plan and `done` is normally 0. A 4-month
 * horizon (the chosen month and the next three) rides along for planning.
 *
 * "Working where they should": every task share names the SEAT it belongs
 * to (digital marketer, creative, developer, SEO, account manager), and each
 * seat lists the team roles that can hold it. A share held by someone in
 * another role is an out-of-role assignment. Those are surfaced, not
 * forbidden — the PM decides if the swap is deliberate.
 */
import type { TeamMember } from "@/lib/data/team";
import type { Client } from "@/lib/data/clients";
import type { Contract } from "@/lib/data/contracts";
import { CONTRACT_STAGE_LABEL } from "@/lib/data/contracts";
import type { SprintTask } from "@/lib/data/sprint-tasks";
import type { ContentPost } from "@/lib/data/content";
import type { Invoice } from "@/lib/data/invoices";
import type { Work } from "@/lib/data/works";
import { SEAT_CATEGORIES, SEAT_LABEL, canHoldSeat as categoryHoldsSeat, type Seat } from "@/lib/data/planners";
import { CATEGORY_SHORT, isTeamCategory } from "@/lib/team/categories";
import { clientContentQuota } from "@/lib/clients/quota";
import { fmtHours, loadFor, shareHours } from "@/lib/capacity/helpers";
import { roundHours } from "@/lib/dev-store/team";
import { awaitsApprovalFrom, isOpen, isOverdue, members, monthLabel, nextDue } from "@/lib/works/helpers";

/** Deadlines within this many days are "due soon". */
export const DUE_SOON_DAYS = 3;
/** Months in the planning horizon: the chosen month and the next three. */
export const HORIZON_MONTHS = 4;
/** A submitted task waiting for approval longer than this is flagged. */
export const APPROVAL_WAIT_DAYS = 3;
/** Window for throughput / on-time performance. */
export const PERF_WINDOW_DAYS = 30;
/**
 * Roles that don't carry delivery work. They still appear in the team table,
 * but an empty plate is normal for them, so they are never flagged "idle".
 */
export const NON_DELIVERY_ROLES: ReadonlySet<string> = new Set(["CEO", "Closer"]);
/**
 * Content items can be owned by either the writer or the designer without
 * being "out of role"; task shares are judged by their seat.
 */
const CONTENT_ROLES: ReadonlySet<string> = new Set(["Content", "UI/UX"]);

const MS_DAY = 24 * 60 * 60 * 1000;

export type Health = "green" | "amber" | "red";
export type LoadBand = "idle" | "light" | "balanced" | "heavy" | "overloaded";

/** Band for a load % (planned hours / available hours × 100). */
export function loadBand(pct: number): LoadBand {
    if (pct <= 0) return "idle";
    if (pct < 40) return "light";
    if (pct <= 85) return "balanced";
    if (pct <= 100) return "heavy";
    return "overloaded";
}

export const LOAD_BAND_LABEL: Record<LoadBand, string> = {
    idle: "Idle",
    light: "Light",
    balanced: "Balanced",
    heavy: "Full",
    overloaded: "Over capacity",
};

export function todayYmd(): string {
    return new Date().toISOString().slice(0, 10);
}

/**
 * Whole days from `fromIso` (ISO timestamp or YYYY-MM-DD) to `today`
 * (YYYY-MM-DD). Compares calendar dates, so "earlier today" is 0, not -1.
 */
export function daysSince(fromIso: string, today: string): number {
    const from = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
    const to = Date.parse(`${today}T00:00:00Z`);
    if (Number.isNaN(from) || Number.isNaN(to)) return 0;
    return Math.floor((to - from) / MS_DAY);
}

export function daysUntil(ymd: string, today: string): number {
    return -daysSince(ymd, today);
}

/** YYYY-MM-DD `offset` days from `today`. */
export function shiftYmd(today: string, offset: number): string {
    return new Date(Date.parse(`${today}T00:00:00Z`) + offset * MS_DAY)
        .toISOString()
        .slice(0, 10);
}

/** Load % from hours, safe when nothing is available. */
export function loadPct(planned: number, available: number): number {
    if (available > 0) return Math.round((planned / available) * 100);
    return planned > 0 ? 999 : 0;
}

// ---------------------------------------------------------------------------
// Months (YYYY-MM) — the unit capacity is planned in
// ---------------------------------------------------------------------------

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonth(s: unknown): s is string {
    return typeof s === "string" && MONTH_RE.test(s);
}

/** YYYY-MM `delta` months from `ym` (negative = earlier). */
export function addMonths(ym: string, delta: number): string {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** `n` consecutive months starting at `from`. */
export function monthsFrom(from: string, n: number): string[] {
    return Array.from({ length: Math.max(0, n) }, (_, i) => addMonths(from, i));
}

/**
 * The month a page should show: a valid `?month=YYYY-MM` param, else the
 * month `today` falls in. Arrays (repeated params) take the first value.
 */
export function resolveMonth(param: string | string[] | undefined, today: string = todayYmd()): string {
    const raw = Array.isArray(param) ? param[0] : param;
    return isMonth(raw) ? raw : today.slice(0, 7);
}

/** "this month" when `month` is the current one, otherwise "in December 2026". */
export function monthPhrase(month: string, today: string): string {
    return month === today.slice(0, 7) ? "this month" : `in ${monthLabel(month)}`;
}

/** Signed hour difference in quarter steps (roundHours clamps negatives to 0, this keeps the sign). */
function diffHours(a: number, b: number): number {
    return Math.round((a - b) * 4) / 4;
}

export type MemberLoad = {
    id: string;
    name: string;
    role: string;
    /** Hours on every task due in the chosen month (all statuses). */
    plannedHours: number;
    /** Hours on the month's tasks not yet completed (= planned for a future month). */
    remainingHours: number;
    /** Hours on the month's completed tasks (normally 0 for a future month). */
    doneHours: number;
    /** Hours available in the month: (weekly hours − reserved hours) ÷ 4 × the month's Mon–Thu working days. */
    availableHours: number;
    /** available − planned; negative when overloaded. */
    freeHours: number;
    /** Of plannedHours, the hours on tasks due on an off day (Fri–Sun). */
    offDayHours: number;
    /** Tasks due in the month that this person holds a share of. */
    monthTasks: number;
    /** Open project tasks this person holds a share of, or must approve (any month). */
    openTasks: number;
    /** Of those, the ones waiting on this person's approval. */
    awaitingApproval: number;
    openSprintTasks: number;
    openContent: number;
    /** Open project tasks past their due date. */
    overdueTasks: number;
    /** Overdue project tasks + sprint tasks + content items. */
    overdue: number;
    /** Open task shares and content items this person holds outside their role. */
    outOfRole: number;
    /** Distinct clients this person is currently working for. */
    clients: string[];
    /** Distinct projects with a task on this person. */
    contracts: number;
    /** plannedHours / availableHours × 100. */
    pct: number;
    band: LoadBand;
    overloaded: boolean;
    /** Nearest upcoming deadline (YYYY-MM-DD) or "" if none. */
    nextDue: string;
    /** Client taking the most of this person's open-task hours, and that share. */
    focusClient: string;
    focusPct: number;
    /** Tasks, sprint tasks and content completed in the last PERF_WINDOW_DAYS. */
    done30d: number;
    /** Share of dated completions that landed on or before their deadline. null = nothing to measure. */
    onTimePct: number | null;
    /** Dated completions measured for onTimePct. */
    measured30d: number;
};

/** One person's (or the team's) hours in one month of the planning horizon. */
export type MonthCell = {
    /** YYYY-MM. */
    month: string;
    planned: number;
    available: number;
    /** available − planned; negative when overloaded. */
    free: number;
    /** planned / available × 100. */
    pct: number;
    band: LoadBand;
    overloaded: boolean;
    /** Task shares counted; 0 = nothing planned yet. */
    tasks: number;
};

/** The planning view: the chosen month and the next HORIZON_MONTHS − 1, per person and for the team. */
export type Horizon = {
    /** YYYY-MM, chosen month first. */
    months: string[];
    /** Same order as `ManagementSnapshot.members` (heaviest in the chosen month first). */
    members: Array<{ id: string; name: string; role: string; cells: MonthCell[] }>;
    /** Team totals, one per month in `months`. */
    team: MonthCell[];
};

export type RoleLoad = {
    role: string;
    headcount: number;
    /** Hours planned in the chosen month across the people in the role. */
    plannedHours: number;
    /** Hours available in the chosen month across the people in the role. */
    availableHours: number;
    /** Share of the whole team's planned hours carried by this role. */
    sharePct: number;
    /** plannedHours / availableHours × 100 for the role. */
    avgPct: number;
    /** Open task shares that sit with this role (held by it, or whose seat prefers it). */
    openTasks: number;
    /** Of those, shares nobody holds yet. */
    unassignedTasks: number;
    band: LoadBand;
    /** Demand exists but nobody active holds the role. */
    uncovered: boolean;
};

export type RoleMismatch = {
    member: string;
    memberRole: string;
    taskTitle: string;
    /** Seat label, e.g. "Digital marketer". */
    seat: string;
    /** Roles that can hold the seat. */
    seatRoles: string[];
    contractId: string;
    contractName: string;
    clientName: string;
    dueDate: string;
    href: string;
};

export type NextTask = {
    id: string;
    title: string;
    phaseName: string;
    dueDate: string;
    status: Work["status"];
    href: string;
};

export type ContractProgress = {
    id: string;
    code: string;
    name: string;
    clientName: string;
    accountManager: string;
    status: Contract["status"];
    stage: Contract["stage"];
    tasksDone: number;
    tasksTotal: number;
    progressPct: number;
    /** Open tasks past their due date. */
    overdue: number;
    /** Open tasks sitting with an approver. */
    awaitingApproval: number;
    /** Open tasks nobody holds a share of. */
    unassigned: number;
    /** Phase of the earliest open task (by due date), "" when nothing is open. */
    currentPhase: string;
    /** The earliest open task. */
    next: NextTask | null;
    /** Active projects count toward load; draft / completed / cancelled do not. */
    isActive: boolean;
    health: Health;
    note: string;
    href: string;
};

export type ClientProgress = {
    name: string;
    /** False when the name only appears on projects/content, not in Clients. */
    registered: boolean;
    status: string;
    /** Who closed the deal (the client's person); each project carries its own AM. */
    dealOwner: string;
    contracts: ContractProgress[];
    /** Distinct team members with work for this client right now. */
    people: string[];
    /** Open tasks + open content. */
    openItems: number;
    contentPlanned: number;
    contentPosted: number;
    /** Content a month promised by the active projects. */
    contentQuota: number;
    awaitingClient: number;
    overdueInvoices: number;
    hasActiveWork: boolean;
    health: Health;
    note: string;
};

export type RiskKind =
    | "task_overdue"
    | "task_unassigned"
    | "task_due_soon"
    | "approval_stale"
    | "contract_done"
    | "sprint_overdue"
    | "sprint_unassigned"
    | "content_overdue"
    | "content_unassigned"
    | "member_overloaded"
    | "member_idle"
    | "role_mismatch"
    | "role_uncovered"
    | "client_idle"
    | "unknown_assignee";

export type Risk = {
    severity: "red" | "amber";
    kind: RiskKind;
    title: string;
    detail: string;
    href: string;
};

export type ManagementSnapshot = {
    today: string;
    /** YYYY-MM the hours are measured in (the chosen month). */
    month: string;
    /** True when `month` is the month `today` falls in. */
    isCurrentMonth: boolean;
    kpis: {
        activeContracts: number;
        clientsWithWork: number;
        openTasks: number;
        overdueItems: number;
        unassignedItems: number;
        /** Submitted tasks sitting with an approver (account manager or client). */
        awaitingApproval: number;
        /** Items waiting on the client: tasks they must approve + content awaiting them. */
        waitingOnClient: number;
        /** Team hours in the chosen month: planned on tasks vs available. */
        teamPlannedHours: number;
        teamAvailableHours: number;
        teamRemainingHours: number;
        /** Team available − planned; negative when the team as a whole is over. */
        teamFreeHours: number;
        /** Of teamPlannedHours, the hours on tasks due on an off day (Fri–Sun). */
        teamOffDayHours: number;
        teamPct: number;
        overloaded: number;
        idle: number;
        outOfRole: number;
        done30d: number;
        onTimePct: number | null;
    };
    members: MemberLoad[];
    /** Planning view: the chosen month and the next three. */
    horizon: Horizon;
    roles: RoleLoad[];
    mismatches: RoleMismatch[];
    clients: ClientProgress[];
    risks: Risk[];
};

export type ManagementInput = {
    team: TeamMember[];
    clients: Client[];
    contracts: Contract[];
    works: Work[];
    sprintTasks: SprintTask[];
    content: ContentPost[];
    invoices: Invoice[];
    /** YYYY-MM to measure hours in; anything else means the month `today` falls in. */
    month?: string;
};

/** One member's hours in one month, for the horizon. */
export function monthCell(member: TeamMember, works: Work[], month: string): MonthCell {
    const load = loadFor(member, works, month);
    const pct = loadPct(load.planned, load.available);
    return {
        month,
        planned: load.planned,
        available: load.available,
        free: diffHours(load.available, load.planned),
        pct,
        band: loadBand(pct),
        overloaded: load.overloaded,
        tasks: load.tasks,
    };
}

/** Team total of a set of cells for the same month. */
export function sumCells(month: string, cells: MonthCell[]): MonthCell {
    const planned = roundHours(cells.reduce((s, c) => s + c.planned, 0));
    const available = roundHours(cells.reduce((s, c) => s + c.available, 0));
    const pct = loadPct(planned, available);
    return {
        month,
        planned,
        available,
        free: diffHours(available, planned),
        pct,
        band: loadBand(pct),
        overloaded: available > 0 ? planned > available : planned > 0,
        tasks: cells.reduce((s, c) => s + c.tasks, 0),
    };
}

export const HEALTH_RANK: Record<Health, number> = { red: 0, amber: 1, green: 2 };

export function worstHealth(list: Health[]): Health {
    return list.reduce<Health>(
        (acc, h) => (HEALTH_RANK[h] < HEALTH_RANK[acc] ? h : acc),
        "green",
    );
}

export function isOpenContent(c: ContentPost): boolean {
    return c.status !== "posted" && c.status !== "archived";
}

/**
 * Everyone with a stake in an open task: the people holding a share, plus
 * the account manager while it waits for approval. The same set of names
 * `involves(w, name)` says yes to.
 */
export function holdersOf(w: Work): string[] {
    const out = new Set(members(w));
    if (w.status === "pending_approval" && w.approver !== "none" && w.accountManager) out.add(w.accountManager);
    return [...out];
}

function canHoldSeat(category: string, seat: Seat): boolean {
    return isTeamCategory(category) && categoryHoldsSeat(category, seat);
}

/** Days a submitted task has sat with its approver. */
export function approvalAgeDays(w: Work, today: string): number {
    if (w.status !== "pending_approval") return 0;
    return daysSince(w.submittedAt ?? w.updatedAt, today);
}

function toNextTask(w: Work): NextTask {
    return { id: w.id, title: w.title, phaseName: w.phaseName, dueDate: w.dueDate, status: w.status, href: `/works/${w.id}` };
}

/** Progress and health of one project, from its tasks. */
export function summarizeContract(c: Contract, works: Work[], today: string): ContractProgress {
    const mine = works.filter((w) => w.contractId === c.id);
    const open = mine.filter(isOpen);
    const tasksTotal = mine.length;
    const tasksDone = tasksTotal - open.length;
    const overdueList = open.filter((w) => isOverdue(w, today));
    const unassignedList = open.filter((w) => members(w).length === 0);
    const approvals = open.filter((w) => w.status === "pending_approval");
    const staleApproval = approvals
        .filter((w) => approvalAgeDays(w, today) > APPROVAL_WAIT_DAYS)
        .sort((a, b) => approvalAgeDays(b, today) - approvalAgeDays(a, today))[0];
    const nextOpen =
        nextDue(open) ?? [...open].sort((a, b) => a.month.localeCompare(b.month) || a.title.localeCompare(b.title))[0];
    const isActive = c.status === "active";

    let health: Health = "green";
    let note = "";
    if (c.status === "completed") {
        note = "Completed";
    } else if (c.status === "cancelled") {
        health = "amber";
        note = "Cancelled";
    } else if (c.status === "draft") {
        health = "amber";
        note = "Draft — not started";
    } else if (tasksTotal === 0) {
        health = "amber";
        note = `No tasks yet · ${CONTRACT_STAGE_LABEL[c.stage]}`;
    } else if (open.length === 0) {
        health = "amber";
        note = "All tasks done — close it out";
    } else if (overdueList.length > 0) {
        health = "red";
        const first = [...overdueList].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
        note = `${first.title} overdue by ${daysSince(first.dueDate, today)}d${overdueList.length > 1 ? ` (+${overdueList.length - 1} more)` : ""}`;
    } else if (unassignedList.length > 0) {
        health = "red";
        note = `${unassignedList[0].title} has nobody on it${unassignedList.length > 1 ? ` (+${unassignedList.length - 1} more)` : ""}`;
    } else if (staleApproval) {
        health = "amber";
        note = `${staleApproval.title} awaiting ${staleApproval.approver === "client" ? "client" : "approval"} for ${approvalAgeDays(staleApproval, today)}d`;
    } else if (nextOpen?.dueDate && daysUntil(nextOpen.dueDate, today) <= DUE_SOON_DAYS) {
        health = "amber";
        const n = daysUntil(nextOpen.dueDate, today);
        note = `${nextOpen.title} due ${n === 0 ? "today" : `in ${n}d`}`;
    } else {
        note = `On track · ${nextOpen?.phaseName || nextOpen?.title || CONTRACT_STAGE_LABEL[c.stage]}`;
    }

    return {
        id: c.id,
        code: c.code,
        name: c.name,
        clientName: c.clientName,
        accountManager: c.accountManager,
        status: c.status,
        stage: c.stage,
        tasksDone,
        tasksTotal,
        progressPct: tasksTotal ? Math.round((tasksDone / tasksTotal) * 100) : 0,
        overdue: overdueList.length,
        awaitingApproval: approvals.length,
        unassigned: unassignedList.length,
        currentPhase: nextOpen?.phaseName ?? "",
        next: nextOpen ? toNextTask(nextOpen) : null,
        isActive,
        health,
        note,
        href: `/projects/${c.id}`,
    };
}

type Acc = {
    workTasks: number;
    approvals: number;
    sprintTasks: number;
    content: number;
    overdueTasks: number;
    overdue: number;
    outOfRole: number;
    clients: Set<string>;
    contracts: Set<string>;
    dues: string[];
    /** Open-task hours per client, for the focus metric. */
    hoursByClient: Map<string, number>;
    done30d: number;
    onTime: number;
    measured: number;
};

function emptyAcc(): Acc {
    return {
        workTasks: 0,
        approvals: 0,
        sprintTasks: 0,
        content: 0,
        overdueTasks: 0,
        overdue: 0,
        outOfRole: 0,
        clients: new Set(),
        contracts: new Set(),
        dues: [],
        hoursByClient: new Map(),
        done30d: 0,
        onTime: 0,
        measured: 0,
    };
}

export function buildManagementSnapshot(
    input: ManagementInput,
    today: string = todayYmd(),
): ManagementSnapshot {
    const { team, clients, contracts, works, sprintTasks, content, invoices } = input;
    const month = resolveMonth(input.month, today);
    const isCurrentMonth = month === today.slice(0, 7);
    const inMonth = monthPhrase(month, today);
    const windowStart = shiftYmd(today, -PERF_WINDOW_DAYS);

    const activeTeam = team.filter((m) => m.active);
    const activeNames = new Set(activeTeam.map((m) => m.name));
    // Seats are held by job category; the label people read is the category's short name.
    const roleByName = new Map(activeTeam.map((m) => [m.name, m.category as string]));
    const contractById = new Map(contracts.map((c) => [c.id, c]));
    const activeContracts = contracts.filter((c) => c.status === "active");
    const openWorks = works.filter(isOpen);
    const openContent = content.filter(isOpenContent);
    const openSprint = sprintTasks.filter((t) => t.status === "open");

    // ---- Per-person accumulation (matched by name, as the rest of the app does)
    const acc = new Map<string, Acc>();
    const touch = (name: string): Acc => {
        let a = acc.get(name);
        if (!a) {
            a = emptyAcc();
            acc.set(name, a);
        }
        return a;
    };

    // ---- Project tasks: everyone holding a share carries their hours on
    //      it; the account manager carries anything waiting for their
    //      approval (the client approves through them) — as a count, not hours.
    let overdueTasks = 0;
    let unassignedTasks = 0;
    let awaitingApproval = 0;
    let waitingOnClient = 0;
    const mismatches: RoleMismatch[] = [];

    for (const w of openWorks) {
        const overdue = isOverdue(w, today);
        if (overdue) overdueTasks++;
        if (w.status === "pending_approval") {
            awaitingApproval++;
            if (w.approver === "client") waitingOnClient++;
        }
        if (members(w).length === 0) unassignedTasks++;
        const contract = contractById.get(w.contractId);
        for (const holder of holdersOf(w)) {
            const a = touch(holder);
            a.workTasks++;
            a.clients.add(w.clientName);
            a.contracts.add(w.contractId);
            if (awaitsApprovalFrom(w, holder)) a.approvals++;
            const h = shareHours(w, holder);
            if (h > 0) a.hoursByClient.set(w.clientName, roundHours((a.hoursByClient.get(w.clientName) ?? 0) + h));
            if (w.dueDate) {
                a.dues.push(w.dueDate);
                if (overdue) {
                    a.overdue++;
                    a.overdueTasks++;
                }
            }
            const memberRole = roleByName.get(holder);
            if (!memberRole) continue;
            for (const s of w.split) {
                if (s.member !== holder || s.pct <= 0 || canHoldSeat(memberRole, s.seat)) continue;
                a.outOfRole++;
                mismatches.push({
                    member: holder,
                    memberRole,
                    taskTitle: w.title,
                    seat: SEAT_LABEL[s.seat],
                    seatRoles: SEAT_CATEGORIES[s.seat].map((c) => CATEGORY_SHORT[c]),
                    contractId: w.contractId,
                    contractName: contract?.name ?? w.clientName,
                    clientName: w.clientName,
                    dueDate: w.dueDate,
                    href: `/works/${w.id}`,
                });
            }
        }
    }

    let overdueSprint = 0;
    let unassignedSprint = 0;
    for (const t of openSprint) {
        if (t.deadline < today) overdueSprint++;
        if (!t.pic) {
            unassignedSprint++;
            continue;
        }
        const a = touch(t.pic);
        a.sprintTasks++;
        a.dues.push(t.deadline);
        if (t.deadline < today) a.overdue++;
    }

    let overdueContent = 0;
    let unassignedContent = 0;
    for (const c of openContent) {
        if (c.scheduledFor && c.scheduledFor < today) overdueContent++;
        if (c.reviewStatus === "awaiting_client") waitingOnClient++;
        if (!c.assignee) {
            unassignedContent++;
            continue;
        }
        const a = touch(c.assignee);
        a.content++;
        a.clients.add(c.clientName);
        if (c.scheduledFor) {
            a.dues.push(c.scheduledFor);
            if (c.scheduledFor < today) a.overdue++;
        }
        const memberRole = roleByName.get(c.assignee);
        if (memberRole && !CONTENT_ROLES.has(memberRole) && !NON_DELIVERY_ROLES.has(memberRole)) {
            a.outOfRole++;
        }
    }

    // ---- Performance window: what got finished recently, and was it on time?
    for (const w of works) {
        if (w.status !== "completed" || !w.completedAt) continue;
        const doneYmd = w.completedAt.slice(0, 10);
        if (doneYmd < windowStart) continue;
        for (const holder of members(w)) {
            const a = touch(holder);
            a.done30d++;
            if (w.dueDate) {
                a.measured++;
                if (doneYmd <= w.dueDate) a.onTime++;
            }
        }
    }
    for (const t of sprintTasks) {
        if (t.status !== "done" || !t.completedAt || !t.pic) continue;
        const doneYmd = t.completedAt.slice(0, 10);
        if (doneYmd < windowStart) continue;
        const a = touch(t.pic);
        a.done30d++;
        a.measured++;
        if (doneYmd <= t.deadline) a.onTime++;
    }
    for (const c of content) {
        if (c.status !== "posted" || !c.postedAt || !c.assignee) continue;
        const doneYmd = c.postedAt.slice(0, 10);
        if (doneYmd < windowStart) continue;
        touch(c.assignee).done30d++;
    }

    const members_: MemberLoad[] = activeTeam
        .map((m) => {
            const a = acc.get(m.name) ?? emptyAcc();
            const load = loadFor(m, works, month);
            const pct = loadPct(load.planned, load.available);
            const next = a.dues.filter((d) => d >= today).sort()[0] ?? "";
            let focusClient = "";
            let focusHours = 0;
            let totalHours = 0;
            for (const [client, h] of a.hoursByClient) {
                totalHours += h;
                if (h > focusHours) {
                    focusHours = h;
                    focusClient = client;
                }
            }
            return {
                id: m.id,
                name: m.name,
                role: m.role,
                plannedHours: load.planned,
                remainingHours: load.remaining,
                doneHours: load.done,
                availableHours: load.available,
                freeHours: diffHours(load.available, load.planned),
                offDayHours: load.offDay,
                monthTasks: load.tasks,
                openTasks: a.workTasks,
                awaitingApproval: a.approvals,
                openSprintTasks: a.sprintTasks,
                openContent: a.content,
                overdueTasks: a.overdueTasks,
                overdue: a.overdue,
                outOfRole: a.outOfRole,
                clients: [...a.clients].sort(),
                contracts: a.contracts.size,
                pct,
                band: loadBand(pct),
                overloaded: load.overloaded,
                nextDue: next,
                focusClient,
                focusPct: totalHours ? Math.round((focusHours / totalHours) * 100) : 0,
                done30d: a.done30d,
                onTimePct: a.measured ? Math.round((a.onTime / a.measured) * 100) : null,
                measured30d: a.measured,
            };
        })
        .sort((x, y) => y.pct - x.pct || y.plannedHours - x.plannedHours || x.name.localeCompare(y.name));

    const teamPlanned = roundHours(members_.reduce((s, m) => s + m.plannedHours, 0));
    const teamAvailable = roundHours(members_.reduce((s, m) => s + m.availableHours, 0));
    const teamRemaining = roundHours(members_.reduce((s, m) => s + m.remainingHours, 0));
    const teamOffDay = roundHours(members_.reduce((s, m) => s + m.offDayHours, 0));

    // ---- Horizon: the chosen month and the next three, per person and in
    //      total, in the same order as the member list.
    const teamById = new Map(activeTeam.map((m) => [m.id, m]));
    const horizonMonths = monthsFrom(month, HORIZON_MONTHS);
    const horizonMembers = members_.map((m) => {
        const member = teamById.get(m.id)!;
        return {
            id: m.id,
            name: m.name,
            role: m.role,
            cells: horizonMonths.map((ym) => monthCell(member, works, ym)),
        };
    });
    const horizon: Horizon = {
        months: horizonMonths,
        members: horizonMembers,
        team: horizonMonths.map((ym, i) => sumCells(ym, horizonMembers.map((hm) => hm.cells[i]))),
    };

    // ---- Roles: supply (headcount, hours) vs demand (open task shares).
    //      A share sits with the role of the person holding it; an unheld
    //      share sits with the seat's preferred role.
    const demand = new Map<string, { open: number; unassigned: number }>();
    const bump = (role: string, unassigned: boolean) => {
        const d = demand.get(role) ?? { open: 0, unassigned: 0 };
        d.open++;
        if (unassigned) d.unassigned++;
        demand.set(role, d);
    };
    for (const w of openWorks) {
        for (const s of w.split) {
            if (s.pct <= 0) continue;
            const held = s.member ? roleByName.get(s.member) : undefined;
            bump(held ?? SEAT_CATEGORIES[s.seat][0], !s.member);
        }
    }
    const roleNames = new Set<string>([...activeTeam.map((m) => m.category as string), ...demand.keys()]);
    const roles: RoleLoad[] = [...roleNames]
        .map((role) => {
            const inRole = members_.filter((m) => m.role === role);
            const planned = roundHours(inRole.reduce((s, m) => s + m.plannedHours, 0));
            const available = roundHours(inRole.reduce((s, m) => s + m.availableHours, 0));
            const d = demand.get(role) ?? { open: 0, unassigned: 0 };
            const avgPct = loadPct(planned, available);
            return {
                role,
                headcount: inRole.length,
                plannedHours: planned,
                availableHours: available,
                sharePct: teamPlanned ? Math.round((planned / teamPlanned) * 100) : 0,
                avgPct,
                openTasks: d.open,
                unassignedTasks: d.unassigned,
                band: loadBand(avgPct),
                uncovered: inRole.length === 0 && d.open > 0,
            };
        })
        .sort(
            (a, b) =>
                Number(b.uncovered) - Number(a.uncovered) ||
                b.avgPct - a.avgPct ||
                b.plannedHours - a.plannedHours ||
                b.openTasks - a.openTasks ||
                a.role.localeCompare(b.role),
        );

    // ---- Clients: project progress rolled up per account
    const contractSummaries = contracts
        .filter((c) => c.status !== "cancelled")
        .map((c) => summarizeContract(c, works, today));
    const clientMeta = new Map(clients.map((c) => [c.name, c]));
    const clientNames = new Set<string>([
        ...clients.map((c) => c.name),
        ...contractSummaries.map((c) => c.clientName),
        ...openWorks.map((w) => w.clientName),
        ...openContent.map((c) => c.clientName),
    ]);

    const clientRows: ClientProgress[] = [];
    for (const name of clientNames) {
        const meta = clientMeta.get(name);
        const mine = contractSummaries
            .filter((c) => c.clientName === name)
            .sort(
                (a, b) =>
                    Number(b.isActive) - Number(a.isActive) ||
                    HEALTH_RANK[a.health] - HEALTH_RANK[b.health] ||
                    a.name.localeCompare(b.name),
            );
        const people = new Set<string>();
        const clientOpenWorks = openWorks.filter((w) => w.clientName === name);
        for (const w of clientOpenWorks) for (const h of holdersOf(w)) people.add(h);
        const clientOpenContent = openContent.filter((c) => c.clientName === name);
        for (const c of clientOpenContent) if (c.assignee) people.add(c.assignee);
        const openItems = clientOpenWorks.length + clientOpenContent.length;
        const monthContent = content.filter(
            (c) =>
                c.clientName === name &&
                (c.planMonth === month || c.scheduledFor.startsWith(month)),
        );
        const contentPosted = monthContent.filter((c) => c.status === "posted").length;
        const awaitingClient = clientOpenContent.filter(
            (c) => c.reviewStatus === "awaiting_client",
        ).length;
        const overdueInvoices = invoices.filter(
            (i) =>
                i.clientName === name &&
                (i.status === "overdue" ||
                    (i.status === "sent" && i.dueDate < today)),
        ).length;
        const activeMine = mine.filter((c) => c.isActive);
        const hasActiveWork = openItems > 0;
        const status = meta?.status ?? "unregistered";

        // Churned / paused accounts with nothing going on don't need a row.
        if (
            !hasActiveWork &&
            mine.length === 0 &&
            status !== "active" &&
            status !== "prospect"
        ) {
            continue;
        }

        let health: Health = worstHealth(activeMine.map((c) => c.health));
        let note = "";
        if (status === "active" && !hasActiveWork) {
            health = "amber";
            note = activeMine.length ? `Active account with no open tasks · ${activeMine[0].note}` : "Active account with no work in progress";
        } else if (!hasActiveWork && mine.length > 0) {
            health = worstHealth(mine.map((c) => c.health));
            note = mine[0].note;
        } else {
            const worst = activeMine.find((c) => c.health === health);
            note = worst ? `${worst.name}: ${worst.note}` : "";
            if (health === "green" && awaitingClient > 0) {
                note = `${awaitingClient} content item${awaitingClient === 1 ? "" : "s"} awaiting client approval`;
            }
        }

        clientRows.push({
            name,
            registered: Boolean(meta),
            status,
            dealOwner: meta?.dealOwner ?? "",
            contracts: mine,
            people: [...people].sort(),
            openItems,
            contentPlanned: monthContent.length,
            contentPosted,
            contentQuota: clientContentQuota(name, contracts),
            awaitingClient,
            overdueInvoices,
            hasActiveWork,
            health,
            note,
        });
    }
    clientRows.sort(
        (a, b) =>
            HEALTH_RANK[a.health] - HEALTH_RANK[b.health] ||
            b.openItems - a.openItems ||
            a.name.localeCompare(b.name),
    );

    // ---- Risks: one flat, ranked "needs attention" list
    const risks: Risk[] = [];
    const who = (w: Work) => {
        const names = holdersOf(w);
        return names.length ? names.join(", ") : "nobody assigned";
    };
    for (const w of openWorks) {
        const contract = contractById.get(w.contractId);
        const where = `${w.clientName}${contract ? ` · ${contract.name}` : ""}`;
        const href = `/works/${w.id}`;
        if (isOverdue(w, today)) {
            risks.push({
                severity: "red",
                kind: "task_overdue",
                title: `${w.title} · overdue by ${daysSince(w.dueDate, today)}d`,
                detail: `${where} · ${who(w)} · due ${w.dueDate}`,
                href,
            });
        } else if (members(w).length === 0 && w.status !== "pending_approval") {
            risks.push({
                severity: "red",
                kind: "task_unassigned",
                title: `${w.title} has nobody on it`,
                detail: `${where} · needs ${w.split.map((s) => SEAT_LABEL[s.seat].toLowerCase()).join(" + ") || "an owner"}${w.dueDate ? ` · due ${w.dueDate}` : ""}`,
                href,
            });
        } else if (w.status === "pending_approval" && approvalAgeDays(w, today) > APPROVAL_WAIT_DAYS) {
            const n = approvalAgeDays(w, today);
            risks.push({
                severity: "amber",
                kind: "approval_stale",
                title: `${w.title} · awaiting ${w.approver === "client" ? "client" : "approval"} for ${n}d`,
                detail: `${where} · ${w.approver === "client" ? "chase the client via" : "approve or send back —"} ${w.accountManager || "account manager"}`,
                href,
            });
        } else if (w.dueDate && daysUntil(w.dueDate, today) <= DUE_SOON_DAYS) {
            const n = daysUntil(w.dueDate, today);
            risks.push({
                severity: "amber",
                kind: "task_due_soon",
                title: `${w.title} · due ${n === 0 ? "today" : `in ${n}d`}`,
                detail: `${where} · ${who(w)}`,
                href,
            });
        }
    }
    for (const c of contractSummaries) {
        if (c.isActive && c.tasksTotal > 0 && c.tasksDone === c.tasksTotal) {
            risks.push({
                severity: "amber",
                kind: "contract_done",
                title: `${c.name} · every task is done`,
                detail: `${c.clientName} · ${CONTRACT_STAGE_LABEL[c.stage]} · plan the next month or complete the account`,
                href: c.href,
            });
        }
    }
    for (const mm of mismatches) {
        risks.push({
            severity: "amber",
            kind: "role_mismatch",
            title: `${mm.member} (${mm.memberRole}) holds the ${mm.seat.toLowerCase()} share of ${mm.taskTitle}`,
            detail: `${mm.contractName} · ${mm.clientName} · a ${mm.seatRoles.join(" / ")} seat · confirm the swap is deliberate or reassign`,
            href: mm.href,
        });
    }
    for (const t of openSprint) {
        if (t.deadline < today) {
            risks.push({
                severity: "red",
                kind: "sprint_overdue",
                title: `Sprint task overdue · ${t.title}`,
                detail: `${t.pic || "Unassigned"} · due ${t.deadline} (${daysSince(t.deadline, today)}d ago)`,
                href: "/tasks",
            });
        } else if (!t.pic) {
            risks.push({
                severity: "amber",
                kind: "sprint_unassigned",
                title: `Sprint task has no PIC · ${t.title}`,
                detail: `due ${t.deadline}`,
                href: "/tasks",
            });
        }
    }
    for (const c of openContent) {
        if (c.scheduledFor && c.scheduledFor < today) {
            risks.push({
                severity: "amber",
                kind: "content_overdue",
                title: `Content past date · ${c.title}`,
                detail: `${c.clientName} · ${c.platform} · was ${c.scheduledFor} · ${c.assignee || "unassigned"}`,
                href: `/content/${c.id}`,
            });
        } else if (!c.assignee) {
            risks.push({
                severity: "amber",
                kind: "content_unassigned",
                title: `Content has no owner · ${c.title}`,
                detail: `${c.clientName} · ${c.platform} · ${c.scheduledFor}`,
                href: `/content/${c.id}`,
            });
        }
    }
    for (const r of roles) {
        if (r.uncovered) {
            risks.push({
                severity: "red",
                kind: "role_uncovered",
                title: `No active ${r.role} on the team`,
                detail: `${r.openTasks} open task share${r.openTasks === 1 ? "" : "s"} sit with this role (${r.unassignedTasks} unassigned)`,
                href: "/team",
            });
        }
    }
    for (const m of members_) {
        if (m.overloaded) {
            risks.push({
                severity: "red",
                kind: "member_overloaded",
                title: `${m.name} is overloaded · ${fmtHours(m.plannedHours)} planned vs ${fmtHours(m.availableHours)} available ${inMonth}`,
                detail: `Over by ${fmtHours(m.plannedHours - m.availableHours)} · ${m.monthTasks} task${m.monthTasks === 1 ? "" : "s"} ${inMonth} · ${m.openSprintTasks} sprint task${m.openSprintTasks === 1 ? "" : "s"} · ${m.openContent} content across ${m.clients.length} client${m.clients.length === 1 ? "" : "s"} · move a task or a share`,
                href: `/works?member=${encodeURIComponent(m.name)}&month=${month}`,
            });
        } else if (m.band === "idle" && m.openTasks === 0 && !NON_DELIVERY_ROLES.has(m.role)) {
            risks.push({
                severity: "amber",
                kind: "member_idle",
                title: `${m.name} (${m.role}) has no hours planned ${inMonth}`,
                detail: `${fmtHours(m.availableHours)} available — ${isCurrentMonth ? "pull work forward or rebalance" : "plan the month or rebalance"}`,
                href: `/works?member=${encodeURIComponent(m.name)}&month=${month}`,
            });
        }
    }
    for (const c of clientRows) {
        if (c.status === "active" && !c.hasActiveWork) {
            risks.push({
                severity: "amber",
                kind: "client_idle",
                title: `${c.name} has no work in progress`,
                detail: c.contracts.some((x) => x.isActive)
                    ? "Active account with no open tasks · plan the next month"
                    : "Active client with no account · set one up or confirm the next deliverable",
                href: "/settings/clients",
            });
        }
    }
    for (const [name, a] of acc) {
        if (activeNames.has(name)) continue;
        const n = a.workTasks + a.sprintTasks + a.content;
        if (n === 0) continue; // only historical completions — nothing live to reassign
        risks.push({
            severity: "amber",
            kind: "unknown_assignee",
            title: `${n} item${n === 1 ? "" : "s"} assigned to "${name}", who is not an active member`,
            detail: "Reassign so the work has a live owner",
            href: "/team",
        });
    }
    const SEVERITY_RANK = { red: 0, amber: 1 } as const;
    risks.sort(
        (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
    );

    const clientsWithWork = clientRows.filter((c) => c.hasActiveWork).length;
    const measuredTotal = members_.reduce((s, m) => s + m.measured30d, 0);
    const onTimeTotal = members_.reduce(
        (s, m) => s + (m.onTimePct === null ? 0 : Math.round((m.onTimePct / 100) * m.measured30d)),
        0,
    );

    return {
        today,
        month,
        isCurrentMonth,
        kpis: {
            activeContracts: activeContracts.length,
            clientsWithWork,
            openTasks: openWorks.length,
            overdueItems: overdueTasks + overdueSprint + overdueContent,
            unassignedItems: unassignedTasks + unassignedSprint + unassignedContent,
            awaitingApproval,
            waitingOnClient,
            teamPlannedHours: teamPlanned,
            teamAvailableHours: teamAvailable,
            teamRemainingHours: teamRemaining,
            teamFreeHours: diffHours(teamAvailable, teamPlanned),
            teamOffDayHours: teamOffDay,
            teamPct: loadPct(teamPlanned, teamAvailable),
            overloaded: members_.filter((m) => m.overloaded).length,
            idle: members_.filter(
                (m) => m.band === "idle" && m.openTasks === 0 && !NON_DELIVERY_ROLES.has(m.role),
            ).length,
            outOfRole: mismatches.length,
            done30d: members_.reduce((s, m) => s + m.done30d, 0),
            onTimePct: measuredTotal ? Math.round((onTimeTotal / measuredTotal) * 100) : null,
        },
        members: members_,
        horizon,
        roles,
        mismatches,
        clients: clientRows,
        risks,
    };
}
