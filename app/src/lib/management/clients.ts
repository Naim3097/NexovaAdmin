/**
 * Management metrics — CLIENTS view: who we serve now, who we used to, how
 * well each active account is being looked after (care tracker), and what
 * was contracted vs invoiced month by month.
 *
 * Care score: starts at 100 and loses points for things a client would feel
 * — a deliverable at risk, revisions sitting with us, content behind the
 * monthly promise, an overdue invoice, nothing delivered recently, revision
 * budget exhausted. Thresholds are constants below. Pure functions, no I/O.
 */
import type { Client } from "@/lib/data/clients";
import type { Contract } from "@/lib/data/contracts";
import type { Work } from "@/lib/data/works";
import type { ContentPost } from "@/lib/data/content";
import type { Invoice } from "@/lib/data/invoices";
import type { Campaign } from "@/lib/data/campaigns";
import type { Quotation } from "@/lib/data/quotations";
import { computeTotals as invoiceTotals } from "@/lib/data/invoices";
import { computeTotals as quoteTotals } from "@/lib/data/quotations";
import { isOpen, nextDue } from "@/lib/works/helpers";
import { clientContentQuota } from "@/lib/clients/quota";
import {
    daysSince,
    daysUntil,
    isOpenContent,
    summarizeContract,
    todayYmd,
    type Health,
} from "@/lib/management/metrics";
import { clientMrr, nextProjectEnd } from "@/lib/management/pipeline";

/** Nothing delivered to a client for this long counts against care. */
export const QUIET_DAYS = 14;
export const CARE_GREEN = 80;
export const CARE_AMBER = 55;

export type RosterRow = {
    id: string;
    name: string;
    status: string;
    industry: string;
    /** Monthly billing of the active projects + live campaign fees. */
    mrr: number;
    /** Who closed the deal (the client's person; projects have their own AM). */
    dealOwner: string;
    since: string;
    activeContracts: number;
    /** Projects whose stage reached "completed". */
    completedContracts: number;
    openTasks: number;
    liveCampaigns: number;
    health: Health;
    href: string;
};

export type InactiveRow = {
    id: string;
    name: string;
    status: string;
    industry: string;
    dealOwner: string;
    since: string;
    lastContract: string;
    lastContractAt: string;
    lastInvoiceAt: string;
    lifetimeBilled: number;
    href: string;
};

export type CareSignal = {
    label: string;
    tone: "good" | "warn" | "bad";
    detail: string;
};

export type CareRow = {
    id: string;
    name: string;
    dealOwner: string;
    score: number;
    health: Health;
    signals: CareSignal[];
    nextMilestone: { label: string; contract: string; due: string; href: string } | null;
    daysSinceDelivery: number | null;
    lastDelivery: string;
    awaitingClient: number;
    awaitingUs: number;
    revisionsAtLimit: number;
    revisionLimit: number;
    contentPosted: number;
    contentPlanned: number;
    /** Content a month promised by the active projects. */
    contentQuota: number;
    /** Days to the nearest active project end date; null when all are open-ended. */
    renewsInDays: number | null;
    overdueInvoices: number;
    href: string;
};

export type BillingCell = {
    month: string;
    invoicedMyr: number;
    paidMyr: number;
    outstandingMyr: number;
    overdue: boolean;
    count: number;
};

export type BillingRow = {
    id: string;
    name: string;
    status: string;
    contractMyr: number;
    cells: BillingCell[];
    totalInvoiced: number;
    totalPaid: number;
    outstanding: number;
    /** Months in the window where a contracted retainer wasn't invoiced. */
    missingMonths: string[];
    href: string;
};

export type BillingMatrix = {
    months: string[];
    rows: BillingRow[];
    monthTotals: Array<{ month: string; invoicedMyr: number; paidMyr: number }>;
    contractedPerMonth: number;
};

export type ContractRow = {
    id: string;
    clientName: string;
    number: string;
    subject: string;
    status: string;
    totalMyr: number;
    issueDate: string;
    acceptedAt: string;
    href: string;
};

export type ClientsSnapshot = {
    today: string;
    kpis: {
        activeClients: number;
        activeMrr: number;
        pausedClients: number;
        churnedClients: number;
        prospects: number;
        avgCare: number | null;
        needCare: number;
        invoicedYtd: number;
        outstanding: number;
    };
    roster: RosterRow[];
    inactive: InactiveRow[];
    care: CareRow[];
    billing: BillingMatrix;
    contracts: ContractRow[];
};

export type ClientsInput = {
    clients: Client[];
    contracts: Contract[];
    works: Work[];
    content: ContentPost[];
    invoices: Invoice[];
    campaigns: Campaign[];
    quotations: Quotation[];
};

function monthsBack(today: string, n: number): string[] {
    const [y, m] = today.slice(0, 7).split("-").map(Number);
    const out: string[] = [];
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(Date.UTC(y, m - 1 - i, 1));
        out.push(d.toISOString().slice(0, 7));
    }
    return out;
}

export function buildClientsSnapshot(
    input: ClientsInput,
    today: string = todayYmd(),
    windowMonths = 6,
): ClientsSnapshot {
    const { clients, contracts, works, content, invoices, campaigns, quotations } = input;
    const month = today.slice(0, 7);
    const year = today.slice(0, 4);
    const months = monthsBack(today, windowMonths);
    const liveContracts = contracts.filter((x) => x.status !== "cancelled");
    const summaries = liveContracts.map((x) => summarizeContract(x, works, today));
    const HEALTH_RANK = { red: 0, amber: 1, green: 2 } as const;

    const roster: RosterRow[] = [];
    const inactive: InactiveRow[] = [];
    const care: CareRow[] = [];

    for (const c of clients) {
        const href = `/settings/clients/${c.id}`;
        const mine = liveContracts.filter((x) => x.clientName === c.name);
        const sums = summaries.filter((x) => x.clientName === c.name);
        const clientWorks = works.filter((w) => w.clientName === c.name);
        const openWorks = clientWorks.filter(isOpen);
        const clientInvoices = invoices.filter((i) => i.clientName === c.name && i.status !== "void");

        if (c.status !== "active") {
            const sorted = [...mine].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
            const last = sorted.find((x) => x.stage === "completed" || x.status === "completed") ?? sorted[0];
            const lastInvoice = [...clientInvoices].sort((a, b) => b.issueDate.localeCompare(a.issueDate))[0];
            inactive.push({
                id: c.id,
                name: c.name,
                status: c.status,
                industry: c.industry,
                dealOwner: c.dealOwner,
                since: c.createdAt.slice(0, 10),
                lastContract: last?.name ?? "",
                lastContractAt: last ? last.updatedAt.slice(0, 10) : "",
                lastInvoiceAt: lastInvoice?.issueDate ?? "",
                lifetimeBilled: clientInvoices
                    .filter((i) => i.status === "paid")
                    .reduce((s, i) => s + invoiceTotals(i).total, 0),
                href,
            });
            continue;
        }

        const active = sums.filter((x) => x.isActive);
        const openContent = content.filter((x) => x.clientName === c.name && isOpenContent(x));
        const monthContent = content.filter(
            (x) => x.clientName === c.name && (x.planMonth === month || x.scheduledFor.startsWith(month)),
        );
        const contentPosted = monthContent.filter((x) => x.status === "posted").length;
        const awaitingClient = openContent.filter((x) => x.reviewStatus === "awaiting_client").length;
        const awaitingUs = openContent.filter((x) => x.reviewStatus === "changes_requested").length;
        const revisionsAtLimit =
            c.contentRevisionLimit > 0
                ? openContent.filter((x) => x.revisionsUsed >= c.contentRevisionLimit).length
                : 0;
        const overdueInvoices = clientInvoices.filter(
            (i) => i.status === "overdue" || (i.status === "sent" && i.dueDate < today),
        ).length;
        const renewsOn = nextProjectEnd(c.name, contracts);
        const renewsInDays = renewsOn ? daysUntil(renewsOn, today) : null;
        const contentQuota = clientContentQuota(c.name, contracts);
        const liveCampaigns = campaigns.filter((x) => x.clientName === c.name && x.status === "live").length;

        // Last thing the client actually received: a posted item or a
        // completed task.
        let lastDelivery = "";
        for (const x of content) {
            if (x.clientName === c.name && x.postedAt && x.postedAt.slice(0, 10) > lastDelivery) {
                lastDelivery = x.postedAt.slice(0, 10);
            }
        }
        for (const w of clientWorks) {
            if (w.status === "completed" && w.completedAt && w.completedAt.slice(0, 10) > lastDelivery) {
                lastDelivery = w.completedAt.slice(0, 10);
            }
        }
        const daysSinceDelivery = lastDelivery ? daysSince(lastDelivery, today) : null;

        // Next dated milestone across this client's open tasks.
        const milestone = nextDue(openWorks.filter((w) => w.milestone));
        const nextMilestone: CareRow["nextMilestone"] = milestone
            ? {
                  label: milestone.title,
                  contract: mine.find((x) => x.id === milestone.contractId)?.name ?? "",
                  due: milestone.dueDate,
                  href: `/works/${milestone.id}`,
              }
            : null;

        // ---- Care score
        let score = 100;
        const signals: CareSignal[] = [];
        const red = active.filter((x) => x.health === "red");
        const amber = active.filter((x) => x.health === "amber");
        if (red.length) {
            score -= 25;
            signals.push({ label: "Delivery at risk", tone: "bad", detail: red.map((x) => `${x.name}: ${x.note}`).join(" · ") });
        } else if (amber.length) {
            score -= Math.min(20, amber.length * 10);
            signals.push({ label: "Delivery to watch", tone: "warn", detail: amber.map((x) => `${x.name}: ${x.note}`).join(" · ") });
        } else if (active.length) {
            signals.push({ label: "Delivery on track", tone: "good", detail: `${active.length} project${active.length === 1 ? "" : "s"} moving · ${openWorks.length} open task${openWorks.length === 1 ? "" : "s"}` });
        }
        if (awaitingUs > 0) {
            score -= 10;
            signals.push({ label: "Revisions with us", tone: "bad", detail: `${awaitingUs} item${awaitingUs === 1 ? "" : "s"} where the client asked for changes` });
        }
        if (awaitingClient > 0) {
            signals.push({ label: "Awaiting client", tone: "warn", detail: `${awaitingClient} item${awaitingClient === 1 ? "" : "s"} waiting for approval — chase gently` });
        }
        if (contentQuota > 0) {
            const dayOfMonth = Number(today.slice(8, 10));
            const daysInMonth = new Date(Date.UTC(Number(year), Number(today.slice(5, 7)), 0)).getUTCDate();
            const expected = Math.floor((contentQuota * dayOfMonth) / daysInMonth);
            if (monthContent.length < contentQuota) {
                score -= 10;
                signals.push({ label: "Content under-planned", tone: "warn", detail: `${monthContent.length} of ${contentQuota} planned this month` });
            }
            if (contentPosted < expected) {
                score -= 10;
                signals.push({ label: "Content behind pace", tone: "bad", detail: `${contentPosted} posted, ~${expected} expected by today` });
            } else {
                signals.push({ label: "Content on pace", tone: "good", detail: `${contentPosted}/${contentQuota} posted` });
            }
        }
        if (revisionsAtLimit > 0) {
            score -= 5;
            signals.push({ label: "Revision budget used", tone: "warn", detail: `${revisionsAtLimit} item${revisionsAtLimit === 1 ? "" : "s"} at the ${c.contentRevisionLimit}-round limit` });
        }
        if (overdueInvoices > 0) {
            score -= 10;
            signals.push({ label: "Overdue invoice", tone: "bad", detail: `${overdueInvoices} unpaid past due — relationship + cash risk` });
        }
        if (daysSinceDelivery === null) {
            score -= 10;
            signals.push({ label: "Nothing delivered yet", tone: "warn", detail: "No posted content or completed task on record" });
        } else if (daysSinceDelivery > QUIET_DAYS) {
            score -= 10;
            signals.push({ label: "Quiet account", tone: "warn", detail: `Last delivery ${daysSinceDelivery}d ago (${lastDelivery})` });
        } else {
            signals.push({ label: "Recently delivered", tone: "good", detail: `${daysSinceDelivery}d ago (${lastDelivery})` });
        }
        if (openWorks.length === 0 && openContent.length === 0) {
            score -= 15;
            signals.push({
                label: "No work in progress",
                tone: "bad",
                detail: active.length ? "Active project with no open tasks — plan the next month" : "Active account with nothing being delivered",
            });
        }
        if (renewsInDays !== null && renewsInDays <= 30) {
            signals.push({
                label: renewsInDays < 0 ? "Project ended" : "Project ending",
                tone: "warn",
                detail: renewsInDays < 0 ? `${-renewsInDays}d past ${renewsOn} — renew or close it` : `ends in ${renewsInDays}d (${renewsOn}) — talk renewal`,
            });
        }
        score = Math.max(0, Math.min(100, score));
        const health: Health = score >= CARE_GREEN ? "green" : score >= CARE_AMBER ? "amber" : "red";

        care.push({
            id: c.id,
            name: c.name,
            dealOwner: c.dealOwner,
            score,
            health,
            signals,
            nextMilestone,
            daysSinceDelivery,
            lastDelivery,
            awaitingClient,
            awaitingUs,
            revisionsAtLimit,
            revisionLimit: c.contentRevisionLimit,
            contentPosted,
            contentPlanned: monthContent.length,
            contentQuota,
            renewsInDays,
            overdueInvoices,
            href,
        });

        roster.push({
            id: c.id,
            name: c.name,
            status: c.status,
            industry: c.industry,
            mrr: clientMrr(c, contracts, campaigns),
            dealOwner: c.dealOwner,
            since: c.createdAt.slice(0, 10),
            activeContracts: active.length,
            completedContracts: sums.filter((x) => x.stage === "completed" || x.status === "completed").length,
            openTasks: openWorks.length,
            liveCampaigns,
            health,
            href,
        });
    }
    care.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
    roster.sort((a, b) => HEALTH_RANK[a.health] - HEALTH_RANK[b.health] || b.mrr - a.mrr || a.name.localeCompare(b.name));
    inactive.sort((a, b) => (b.lastContractAt || b.since).localeCompare(a.lastContractAt || a.since));

    // ---- Billing matrix: client × month, contracted vs invoiced
    const billingRows: BillingRow[] = clients
        .filter((c) => c.status !== "prospect")
        .map((c) => {
            const contractMyr = c.status === "active" ? clientMrr(c, contracts, campaigns) : 0;
            const mine = invoices.filter((i) => i.clientName === c.name && i.status !== "void");
            const cells: BillingCell[] = months.map((m) => {
                const inMonth = mine.filter((i) => i.issueDate.startsWith(m));
                let invoiced = 0;
                let paid = 0;
                let overdue = false;
                for (const i of inMonth) {
                    const total = invoiceTotals(i).total;
                    invoiced += total;
                    if (i.status === "paid") paid += total;
                    if (i.status === "overdue" || (i.status === "sent" && i.dueDate < today)) overdue = true;
                }
                return { month: m, invoicedMyr: invoiced, paidMyr: paid, outstandingMyr: invoiced - paid, overdue, count: inMonth.length };
            });
            const missingMonths =
                contractMyr > 0
                    ? cells.filter((cell) => cell.count === 0 && cell.month < month).map((cell) => cell.month)
                    : [];
            const totalInvoiced = cells.reduce((s, x) => s + x.invoicedMyr, 0);
            const totalPaid = cells.reduce((s, x) => s + x.paidMyr, 0);
            return {
                id: c.id,
                name: c.name,
                status: c.status,
                contractMyr,
                cells,
                totalInvoiced,
                totalPaid,
                outstanding: mine
                    .filter((i) => i.status === "sent" || i.status === "overdue")
                    .reduce((s, i) => s + invoiceTotals(i).total, 0),
                missingMonths,
                href: `/settings/clients/${c.id}`,
            };
        })
        .filter((r) => r.status === "active" || r.totalInvoiced > 0)
        .sort(
            (a, b) =>
                Number(b.status === "active") - Number(a.status === "active") ||
                b.totalInvoiced - a.totalInvoiced ||
                a.name.localeCompare(b.name),
        );
    const monthTotals = months.map((m) => ({
        month: m,
        invoicedMyr: billingRows.reduce((s, r) => s + (r.cells.find((x) => x.month === m)?.invoicedMyr ?? 0), 0),
        paidMyr: billingRows.reduce((s, r) => s + (r.cells.find((x) => x.month === m)?.paidMyr ?? 0), 0),
    }));

    const acceptedQuotes: ContractRow[] = quotations
        .filter((q) => q.status === "accepted" || q.status === "converted")
        .map((q) => ({
            id: q.id,
            clientName: q.clientName,
            number: q.number,
            subject: q.subject,
            status: q.status,
            totalMyr: quoteTotals(q).total,
            issueDate: q.issueDate,
            acceptedAt: q.acceptedAt ? q.acceptedAt.slice(0, 10) : "",
            href: `/quotes/${q.id}`,
        }))
        .sort((a, b) => (b.acceptedAt || b.issueDate).localeCompare(a.acceptedAt || a.issueDate));

    const activeClients = clients.filter((c) => c.status === "active");
    return {
        today,
        kpis: {
            activeClients: activeClients.length,
            activeMrr: activeClients.reduce((s, c) => s + clientMrr(c, contracts, campaigns), 0),
            pausedClients: clients.filter((c) => c.status === "paused").length,
            churnedClients: clients.filter((c) => c.status === "churned").length,
            prospects: clients.filter((c) => c.status === "prospect").length,
            avgCare: care.length ? Math.round(care.reduce((s, c) => s + c.score, 0) / care.length) : null,
            needCare: care.filter((c) => c.health !== "green").length,
            invoicedYtd: invoices
                .filter((i) => i.status !== "void" && i.issueDate.startsWith(year))
                .reduce((s, i) => s + invoiceTotals(i).total, 0),
            outstanding: invoices
                .filter((i) => i.status === "sent" || i.status === "overdue")
                .reduce((s, i) => s + invoiceTotals(i).total, 0),
        },
        roster,
        inactive,
        care,
        billing: {
            months,
            rows: billingRows,
            monthTotals,
            contractedPerMonth: billingRows.reduce((s, r) => s + r.contractMyr, 0),
        },
        contracts: acceptedQuotes,
    };
}
