/**
 * Dashboard tiles — per tab, one big number, a hint of about three words, a
 * colour and the page that fixes it. Pure functions over the records the
 * page loads; what a non-manager may see is narrowed before these run.
 *
 * Colour rules: nothing wrong = green (and quiet when the number is zero);
 * overdue, over capacity or unpaid past due = red; due soon or waiting on
 * someone = amber.
 */
import type { Client } from "@/lib/data/clients";
import type { Contract } from "@/lib/data/contracts";
import type { ContentPost } from "@/lib/data/content";
import type { Invoice } from "@/lib/data/invoices";
import { computeTotals } from "@/lib/data/invoices";
import type { Lead } from "@/lib/data/leads";
import type { OnboardingSubmission } from "@/lib/data/onboarding";
import type { Quotation } from "@/lib/data/quotations";
import { computeTotals as quoteTotals } from "@/lib/data/quotations";
import type { TeamMember } from "@/lib/data/team";
import type { Work } from "@/lib/data/works";
import { fmtHours, workingDaysInMonth } from "@/lib/capacity/helpers";
import { endsInDays } from "@/lib/contracts/helpers";
import { fmtMyrShort } from "@/lib/format";
import { DUE_SOON_DAYS, DRAFT_WINDOW_DAYS, hasRenewalOnFile, type FinanceSnapshot } from "@/lib/management/finance";
import {
    addMonths,
    approvalAgeDays,
    daysSince,
    isOpenContent,
    shiftYmd,
    type Health,
    type ManagementSnapshot,
} from "@/lib/management/metrics";
import type { OverviewSnapshot } from "@/lib/management/overview";
import type { DashboardTab } from "@/lib/roles";
import { isOpen, isOverdue } from "@/lib/works/helpers";

/** "Due this week" and "new this week": today plus this many days. */
export const WEEK_DAYS = 7;
/** An open deal untouched for longer than this is idle. */
export const IDLE_DEAL_DAYS = 7;
/** Contracts ending inside this window need a renewal lined up. */
export const RENEWAL_DAYS = 60;

export type Tile = {
    key: string;
    label: string;
    value: string;
    /** About three words. */
    hint: string;
    health: Health;
    href: string;
    /** The count behind the number; a green zero renders quiet. */
    count: number;
};

/** The tabs that carry tiles (Activity is a feed). */
export type TileTab = Exclude<DashboardTab, "all" | "activity">;

const norm = (s: string) => s.trim().toLowerCase();

function n(count: number, one: string, many = `${one}s`): string {
    return `${count} ${count === 1 ? one : many}`;
}

/** "December" for a YYYY-MM. */
function monthName(ym: string): string {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-MY", { month: "long", timeZone: "UTC" });
}

/** "Dec" for a YYYY-MM. */
function monthShort(ym: string): string {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-MY", { month: "short", timeZone: "UTC" });
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

export function deliveryTiles(input: {
    /** Tasks in scope (everything for managers, the member's contracts otherwise). */
    works: Work[];
    contracts: Contract[];
    content: ContentPost[];
    /** YYYY-MM the "Done" figure is measured in. */
    month: string;
    today: string;
    /** Managers get the Work detail page for unowned tasks; everyone else the task list. */
    manager: boolean;
}): Tile[] {
    const { works, contracts, content, month, today, manager } = input;
    const open = works.filter(isOpen);
    const overdue = open.filter((w) => isOverdue(w, today));
    const review = open.filter((w) => w.status === "pending_approval");
    const oldest = review.length ? Math.max(...review.map((w) => approvalAgeDays(w, today))) : 0;
    const weekEnd = shiftYmd(today, WEEK_DAYS);
    const week = open.filter((w) => w.dueDate && w.dueDate >= today && w.dueDate <= weekEnd);
    const noOwner = open.filter((w) => w.split.some((s) => s.pct > 0 && !s.member));
    const next = addMonths(month, 1);
    const running = contracts.filter((c) => c.status === "active" && (!c.endDate || c.endDate >= `${next}-01`));
    const briefed = new Set(works.filter((w) => w.month === next).map((w) => w.contractId));
    const notBriefed = running.filter((c) => !briefed.has(c.id));
    const monthWorks = works.filter((w) => w.month === month);
    const done = monthWorks.filter((w) => !isOpen(w)).length;
    const withClients = content.filter((c) => isOpenContent(c) && c.reviewStatus === "awaiting_client");
    const isCurrent = month === today.slice(0, 7);

    return [
        {
            key: "overdue",
            label: "Overdue",
            value: String(overdue.length),
            hint: overdue.length ? "tasks past due" : "nothing past due",
            health: overdue.length ? "red" : "green",
            href: "/works?overdue=1",
            count: overdue.length,
        },
        {
            key: "review",
            label: "In review",
            value: String(review.length),
            hint: review.length ? `oldest ${oldest}d` : "nothing waiting",
            health: review.length ? "amber" : "green",
            href: "/works?status=pending_approval",
            count: review.length,
        },
        {
            key: "week",
            label: "Due this week",
            value: String(week.length),
            hint: `next ${WEEK_DAYS} days`,
            health: week.length ? "amber" : "green",
            href: "/calendar",
            count: week.length,
        },
        {
            key: "no-owner",
            label: "No owner",
            value: String(noOwner.length),
            hint: noOwner.length ? "tasks, open seat" : "every task owned",
            health: noOwner.length ? "amber" : "green",
            href: manager ? "/management/work#unassigned" : "/works",
            count: noOwner.length,
        },
        {
            key: "not-briefed",
            label: "Not briefed",
            value: String(notBriefed.length),
            hint: notBriefed.length ? `no ${monthName(next)} tasks` : `${monthName(next)} planned`,
            health: notBriefed.length ? "amber" : "green",
            href: "/contracts",
            count: notBriefed.length,
        },
        {
            key: "done",
            label: "Done",
            value: `${done}/${monthWorks.length}`,
            hint: isCurrent ? "tasks this month" : `tasks · ${monthShort(month)}`,
            health: "green",
            href: `/works?month=${month}`,
            count: monthWorks.length,
        },
        {
            key: "with-clients",
            label: "With clients",
            value: String(withClients.length),
            hint: withClients.length ? "content to approve" : "no content waiting",
            health: withClients.length ? "amber" : "green",
            href: "/content",
            count: withClients.length,
        },
    ];
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

export function salesTiles(input: { leads: Lead[]; quotes: Quotation[]; contracts: Contract[]; today: string }): Tile[] {
    const { leads, quotes, contracts, today } = input;
    const open = leads.filter((l) => l.status !== "won" && l.status !== "lost");
    const openMyr = open.reduce((s, l) => s + (l.estValueMyr || 0), 0);
    const idle = open.filter((l) => daysSince(l.updatedAt, today) > IDLE_DEAL_DAYS);
    const sent = quotes.filter((q) => q.status === "sent");
    const expired = sent.filter((q) => q.validUntil < today).length;
    const sentMyr = sent.reduce((s, q) => s + quoteTotals(q).total, 0);
    const contracted = new Set(contracts.filter((c) => c.status !== "cancelled").map((c) => norm(c.clientName)));
    const wonNoContract = leads.filter((l) => l.status === "won" && !contracted.has(norm(l.company || l.name)) && !contracted.has(norm(l.name)));
    const weekAgo = shiftYmd(today, -WEEK_DAYS);
    const fresh = leads.filter((l) => l.createdAt.slice(0, 10) >= weekAgo);

    return [
        {
            key: "pipeline",
            label: "Pipeline",
            value: fmtMyrShort(openMyr),
            hint: open.length ? n(open.length, "open deal") : "no open deals",
            health: open.length ? "green" : "amber",
            href: "/pipeline",
            count: open.length,
        },
        {
            key: "idle",
            label: "Idle deals",
            value: String(idle.length),
            hint: idle.length ? `no touch ${IDLE_DEAL_DAYS}d+` : "all deals moving",
            health: idle.length ? "amber" : "green",
            href: "/pipeline",
            count: idle.length,
        },
        {
            key: "quotes",
            label: "Quotes waiting",
            value: String(sent.length),
            hint: expired ? `${expired} past validity` : sent.length ? `${fmtMyrShort(sentMyr)} sent` : "none out",
            health: sent.length ? "amber" : "green",
            href: "/quotes",
            count: sent.length,
        },
        {
            key: "won-no-contract",
            label: "Won, no contract",
            value: String(wonNoContract.length),
            hint: wonNoContract.length ? "need a contract" : "all won contracted",
            health: wonNoContract.length ? "amber" : "green",
            href: "/pipeline",
            count: wonNoContract.length,
        },
        {
            key: "new-leads",
            label: "New leads",
            value: String(fresh.length),
            hint: `last ${WEEK_DAYS} days`,
            health: "green",
            href: "/leads",
            count: fresh.length,
        },
    ];
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export function moneyTiles(input: { fin: FinanceSnapshot; invoices: Invoice[]; today: string }): Tile[] {
    const { fin, invoices, today } = input;
    const k = fin.kpis;
    const month = today.slice(0, 7);
    const paid = invoices.filter((i) => i.status === "paid" && (i.paidAt ?? "").startsWith(month));
    const paidMyr = paid.reduce((s, i) => s + computeTotals(i).total, 0);
    const toSign = fin.toPrepare;

    return [
        {
            key: "unpaid",
            label: "Unpaid",
            value: fmtMyrShort(k.arOpenMyr),
            hint: k.overdueCount ? `${k.overdueCount} of ${k.arOpenCount} past due` : k.arOpenCount ? `${n(k.arOpenCount, "invoice")} out` : "nothing out",
            health: "green",
            href: "/invoices",
            count: k.arOpenCount,
        },
        {
            key: "overdue",
            label: "Overdue",
            value: fmtMyrShort(k.overdueMyr),
            hint: k.overdueCount ? `${n(k.overdueCount, "invoice")} past due` : "nothing past due",
            health: k.overdueCount ? "red" : "green",
            href: "/invoices",
            count: k.overdueCount,
        },
        {
            key: "due-soon",
            label: `Due in ${DUE_SOON_DAYS} days`,
            value: fmtMyrShort(k.dueSoonMyr),
            hint: k.dueSoonCount ? `${n(k.dueSoonCount, "invoice")} falling due` : "nothing falling due",
            health: k.dueSoonCount ? "amber" : "green",
            href: "/invoices",
            count: k.dueSoonCount,
        },
        {
            key: "drafts",
            label: "Drafts to issue",
            value: String(k.draftsCount),
            hint: k.draftsCount ? `${fmtMyrShort(k.draftsMyr)} due in ${DRAFT_WINDOW_DAYS}d` : k.draftsAll ? `${n(k.draftsAll, "draft")} further out` : "no drafts",
            health: k.draftsCount ? "amber" : "green",
            href: "/invoices",
            count: k.draftsCount,
        },
        {
            key: "to-sign",
            label: "Contracts to sign",
            value: String(toSign.length),
            hint: toSign.length ? `${toSign.filter((c) => c.status === "active").length} already running` : "all signed",
            health: toSign.length ? "amber" : "green",
            href: "/contracts?stage=created",
            count: toSign.length,
        },
        {
            key: "paid",
            label: "Paid this month",
            value: fmtMyrShort(paidMyr),
            hint: n(paid.length, "receipt"),
            health: "green",
            href: "/invoices",
            count: paid.length,
        },
    ];
}

// ---------------------------------------------------------------------------
// Team (managers only)
// ---------------------------------------------------------------------------

export function teamTiles(input: { overview: OverviewSnapshot; mgmt: ManagementSnapshot; team: TeamMember[]; today: string }): Tile[] {
    const { overview, mgmt, team, today } = input;
    const cap = overview.capacity;
    const current = today.slice(0, 7);
    const teamHref = (m: string) => (m === current ? "/management/team" : `/management/team?month=${m}`);
    const setAside = team
        .filter((m) => m.active)
        .reduce((s, m) => s + Object.values(m.reservedHours ?? {}).reduce((a, h) => a + (h || 0), 0), 0);

    return [
        {
            key: "over",
            label: "Over capacity",
            value: String(cap.overloaded),
            hint: cap.overloaded ? "people over hours" : "nobody over",
            health: cap.overloaded ? "red" : "green",
            href: teamHref(cap.month),
            count: cap.overloaded,
        },
        {
            key: "hours",
            label: "Planned / available",
            value: `${fmtHours(cap.plannedHours)} / ${fmtHours(cap.availableHours)}`,
            hint: `${cap.pct}% · ${workingDaysInMonth(cap.month)} working days · ${n(cap.activeMembers, "person", "people")}`,
            health: cap.pct > 100 ? "red" : cap.pct > 85 ? "amber" : "green",
            href: teamHref(cap.month),
            count: cap.plannedHours,
        },
        {
            key: "off-day",
            label: "Off-day hours",
            value: fmtHours(mgmt.kpis.teamOffDayHours),
            hint: mgmt.kpis.teamOffDayHours ? "due Fri–Sun" : "nothing due Fri–Sun",
            health: mgmt.kpis.teamOffDayHours ? "amber" : "green",
            href: `${teamHref(mgmt.month)}#people`,
            count: mgmt.kpis.teamOffDayHours,
        },
        {
            key: "next-over",
            label: `Over · ${monthShort(cap.next.month)}`,
            value: String(cap.next.overloaded),
            hint: cap.next.plannedHours ? `${fmtHours(cap.next.plannedHours)} planned` : "nothing planned yet",
            health: cap.next.overloaded ? "red" : cap.next.plannedHours ? "green" : "amber",
            href: teamHref(cap.next.month),
            count: cap.next.overloaded,
        },
        {
            key: "off-role",
            label: "Off-role",
            value: String(mgmt.kpis.outOfRole),
            hint: mgmt.kpis.outOfRole ? "shares off-role" : "all in role",
            health: mgmt.kpis.outOfRole ? "amber" : "green",
            href: `${teamHref(cap.month)}#off-role`,
            count: mgmt.kpis.outOfRole,
        },
        {
            key: "set-aside",
            label: "Set aside",
            value: `${fmtHours(setAside)}/wk`,
            hint: "sales, admin hats",
            health: "green",
            href: "/team",
            count: setAside,
        },
    ];
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export function clientTiles(input: {
    clients: Client[];
    /** Contracts in scope. */
    contracts: Contract[];
    /** Every contract, so a renewal written by someone else still counts. */
    allContracts: Contract[];
    works: Work[];
    submissions: OnboardingSubmission[];
    today: string;
}): Tile[] {
    const { clients, contracts, allContracts, works, submissions, today } = input;
    const active = clients.filter((c) => c.status === "active");
    const onboarding = clients.filter((c) => c.status === "onboarding");
    const overdueContracts = new Set(works.filter((w) => isOverdue(w, today)).map((w) => w.contractId));
    const atRisk = contracts.filter((c) => c.status === "active" && overdueContracts.has(c.id));
    const renewals = contracts.filter((c) => {
        const d = endsInDays(c, today);
        return d !== null && d <= RENEWAL_DAYS && !hasRenewalOnFile(c, allContracts);
    });
    const forms = submissions.filter((s) => s.status === "draft");

    return [
        {
            key: "active",
            label: "Active",
            value: String(active.length),
            hint: "clients with us",
            health: "green",
            href: "/settings/clients",
            count: active.length,
        },
        {
            key: "onboarding",
            label: "Onboarding",
            value: String(onboarding.length),
            hint: onboarding.length ? "clients starting" : "nobody starting",
            health: onboarding.length ? "amber" : "green",
            href: "/settings/clients",
            count: onboarding.length,
        },
        {
            key: "at-risk",
            label: "At risk",
            value: String(atRisk.length),
            hint: atRisk.length ? "contracts, overdue tasks" : "no overdue tasks",
            health: atRisk.length ? "red" : "green",
            href: "/contracts",
            count: atRisk.length,
        },
        {
            key: "renewals",
            label: `Renewals in ${RENEWAL_DAYS} days`,
            value: String(renewals.length),
            hint: renewals.length ? "no renewal yet" : "nothing ending soon",
            health: renewals.length ? "amber" : "green",
            href: "/contracts",
            count: renewals.length,
        },
        {
            key: "forms",
            label: "Forms pending",
            value: String(forms.length),
            hint: forms.length ? "not submitted yet" : "all submitted",
            health: forms.length ? "amber" : "green",
            href: "/onboarding",
            count: forms.length,
        },
    ];
}

// ---------------------------------------------------------------------------
// All
// ---------------------------------------------------------------------------

/** The red and amber tiles of every tab, in tab order, for the All tab. */
export function attentionTiles(byTab: Partial<Record<TileTab, Tile[]>>, order: readonly DashboardTab[]): Array<{ tab: TileTab; tiles: Tile[] }> {
    const out: Array<{ tab: TileTab; tiles: Tile[] }> = [];
    for (const t of order) {
        if (t === "all" || t === "activity") continue;
        const live = (byTab[t] ?? []).filter((x) => x.health !== "green");
        if (live.length) out.push({ tab: t, tiles: live });
    }
    return out;
}
