/**
 * Management metrics — PIPELINE view: contracts we can close, and keeping
 * the clients we already have.
 *
 * New business comes from leads (proposal / qualified) and quotations out
 * for decision. Retention comes from active clients: projects coming to their
 * end date, delivery health, items waiting on us, under-delivered content,
 * overdue invoices. Money and content promised come from the client's
 * projects (`@/lib/clients/revenue`, `@/lib/clients/quota`). Pure functions,
 * no I/O.
 */
import type { Lead } from "@/lib/data/leads";
import type { Quotation } from "@/lib/data/quotations";
import { computeTotals as quoteTotals } from "@/lib/data/quotations";
import type { Client } from "@/lib/data/clients";
import type { Contract } from "@/lib/data/contracts";
import type { Work } from "@/lib/data/works";
import type { ContentPost } from "@/lib/data/content";
import type { Invoice } from "@/lib/data/invoices";
import type { Campaign } from "@/lib/data/campaigns";
import { computeTotals as invoiceTotals } from "@/lib/data/invoices";
import { isOpen } from "@/lib/works/helpers";
import { activeContractsFor, clientMonthlyMyr } from "@/lib/clients/revenue";
import { clientContentQuota } from "@/lib/clients/quota";
import {
    daysSince,
    daysUntil,
    isOpenContent,
    shiftYmd,
    summarizeContract,
    todayYmd,
    worstHealth,
    type Health,
} from "@/lib/management/metrics";

/** A lead not touched for this many days is going cold. */
export const STALE_LEAD_DAYS = 7;
/** Quotes expiring within this many days need a nudge. */
export const QUOTE_EXPIRY_SOON_DAYS = 7;
/** Renewals inside this window are the retention pipeline. */
export const RENEWAL_WINDOW_DAYS = 60;
/** Renewals this close need a conversation now. */
export const RENEWAL_URGENT_DAYS = 30;

export type CloseableRow = {
    kind: "lead" | "quote";
    id: string;
    title: string;
    clientName: string;
    stage: string;
    valueMyr: number;
    owner: string;
    /** Days since the lead was last touched / the quote was issued. */
    ageDays: number;
    /** Quote: days until it expires. null for leads. */
    expiresInDays: number | null;
    score: number | null;
    flag: "stale" | "expiring" | "";
    href: string;
};

export type EarlyLeadRow = {
    id: string;
    name: string;
    company: string;
    status: string;
    valueMyr: number;
    owner: string;
    ageDays: number;
    score: number;
    href: string;
};

export type RetentionRow = {
    id: string;
    name: string;
    mrr: number;
    /** Who closed the deal (the client's person; projects have their own AM). */
    dealOwner: string;
    /** Names of the client's active projects. */
    projects: string[];
    /** Nearest end date among the active projects (YYYY-MM-DD); "" when all are open-ended. */
    renewsOn: string;
    renewsInDays: number | null;
    activeContracts: number;
    openTasks: number;
    awaitingUs: number;
    awaitingClient: number;
    contentPosted: number;
    contentPlanned: number;
    contentQuota: number;
    overdueInvoices: number;
    health: Health;
    reasons: string[];
    href: string;
};

export type WinBackRow = {
    id: string;
    name: string;
    status: string;
    dealOwner: string;
    lastContract: string;
    lastContractAt: string;
    lastInvoiceAt: string;
    lifetimeBilled: number;
    href: string;
};

export type PipelineSnapshot = {
    today: string;
    kpis: {
        closeableMyr: number;
        closeableCount: number;
        openPipelineMyr: number;
        openLeads: number;
        wonMtdCount: number;
        wonMtdMyr: number;
        renewalsCount: number;
        renewalsMrr: number;
        atRiskCount: number;
        atRiskMrr: number;
        activeMrr: number;
        winBackCount: number;
        conversion90Pct: number | null;
    };
    closeable: CloseableRow[];
    early: EarlyLeadRow[];
    retention: RetentionRow[];
    winBack: WinBackRow[];
    recentlyWon: EarlyLeadRow[];
    recentlyLost: EarlyLeadRow[];
};

export type PipelineInput = {
    leads: Lead[];
    quotations: Quotation[];
    clients: Client[];
    contracts: Contract[];
    works: Work[];
    content: ContentPost[];
    invoices: Invoice[];
    campaigns: Campaign[];
};

/**
 * Monthly recurring revenue for a client: the monthly billing of their active
 * projects + live campaign flat fees.
 */
export function clientMrr(client: Client, contracts: Contract[], campaigns: Campaign[]): number {
    const fees = campaigns
        .filter((c) => c.clientName === client.name && c.status === "live")
        .reduce(
            (s, c) =>
                s + (c.feeModel === "flat" || c.feeModel === "flat_plus_percent" ? c.flatFeeMyr : 0),
            0,
        );
    return clientMonthlyMyr(client.name, contracts) + fees;
}

/**
 * When the client's engagement next comes up for renewal: the nearest end
 * date among their active projects (a passed date = overdue), "" when every
 * active project is open-ended.
 */
export function nextProjectEnd(clientName: string, contracts: Contract[]): string {
    return (
        activeContractsFor(clientName, contracts)
            .map((c) => c.endDate)
            .filter(Boolean)
            .sort()[0] ?? ""
    );
}

export function buildPipelineSnapshot(
    input: PipelineInput,
    today: string = todayYmd(),
): PipelineSnapshot {
    const { leads, quotations, clients, contracts, works, content, invoices, campaigns } = input;
    const month = today.slice(0, 7);
    const ninetyAgo = shiftYmd(today, -90);

    const leadHref = (l: Lead) => `/leads/${l.id}`;
    const leadTitle = (l: Lead) => (l.company ? `${l.company} · ${l.name}` : l.name);

    // ---- Closeable: proposal + qualified leads, plus quotes awaiting decision
    const closeable: CloseableRow[] = [];
    for (const l of leads) {
        if (l.status !== "proposal" && l.status !== "qualified") continue;
        const age = daysSince(l.updatedAt, today);
        closeable.push({
            kind: "lead",
            id: l.id,
            title: leadTitle(l),
            clientName: l.company || l.name,
            stage: l.status,
            valueMyr: l.estValueMyr || 0,
            owner: l.assignedTo,
            ageDays: age,
            expiresInDays: null,
            score: l.score,
            flag: age > STALE_LEAD_DAYS ? "stale" : "",
            href: leadHref(l),
        });
    }
    for (const q of quotations) {
        if (q.status !== "sent") continue;
        const left = daysUntil(q.validUntil, today);
        closeable.push({
            kind: "quote",
            id: q.id,
            title: `${q.number}${q.subject ? ` · ${q.subject}` : ""}`,
            clientName: q.clientName,
            stage: left < 0 ? "quote expired" : "quote sent",
            valueMyr: quoteTotals(q).total,
            owner: "",
            ageDays: daysSince(q.issueDate, today),
            expiresInDays: left,
            score: null,
            flag: left <= QUOTE_EXPIRY_SOON_DAYS ? "expiring" : "",
            href: `/quotes/${q.id}`,
        });
    }
    closeable.sort((a, b) => b.valueMyr - a.valueMyr || a.ageDays - b.ageDays);

    const early: EarlyLeadRow[] = leads
        .filter((l) => l.status === "new" || l.status === "contacted")
        .map((l) => ({
            id: l.id,
            name: l.name,
            company: l.company,
            status: l.status,
            valueMyr: l.estValueMyr || 0,
            owner: l.assignedTo,
            ageDays: daysSince(l.updatedAt, today),
            score: l.score,
            href: leadHref(l),
        }))
        .sort((a, b) => b.score - a.score || b.valueMyr - a.valueMyr);

    const toRow = (l: Lead): EarlyLeadRow => ({
        id: l.id,
        name: l.name,
        company: l.company,
        status: l.status,
        valueMyr: l.estValueMyr || 0,
        owner: l.assignedTo,
        ageDays: daysSince(l.updatedAt, today),
        score: l.score,
        href: leadHref(l),
    });
    const recentlyWon = leads
        .filter((l) => l.status === "won" && l.updatedAt.slice(0, 10) >= ninetyAgo)
        .map(toRow)
        .sort((a, b) => a.ageDays - b.ageDays);
    const recentlyLost = leads
        .filter((l) => l.status === "lost" && l.updatedAt.slice(0, 10) >= ninetyAgo)
        .map(toRow)
        .sort((a, b) => a.ageDays - b.ageDays);
    const decided90 = recentlyWon.length + recentlyLost.length;

    const openLeads = leads.filter((l) => l.status !== "won" && l.status !== "lost");
    const wonMtd = leads.filter(
        (l) => l.status === "won" && l.updatedAt.startsWith(month),
    );

    // ---- Retention: every active client, with the reasons it might wobble
    const liveContracts = contracts.filter((x) => x.status !== "cancelled");
    const summaries = liveContracts.map((x) => summarizeContract(x, works, today));
    const retention: RetentionRow[] = [];
    const winBack: WinBackRow[] = [];
    for (const c of clients) {
        const href = `/settings/clients/${c.id}`;
        const clientContracts = liveContracts.filter((x) => x.clientName === c.name);
        const clientInvoices = invoices.filter((i) => i.clientName === c.name && i.status !== "void");

        if (c.status !== "active") {
            if (c.status === "prospect") continue; // lives in leads, not retention
            const sorted = [...clientContracts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
            const last = sorted.find((x) => x.stage === "completed" || x.status === "completed") ?? sorted[0];
            const lastInvoice = clientInvoices.sort((a, b) => b.issueDate.localeCompare(a.issueDate))[0];
            winBack.push({
                id: c.id,
                name: c.name,
                status: c.status,
                dealOwner: c.dealOwner,
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

        const active = summaries.filter((x) => x.clientName === c.name && x.isActive);
        const openWorks = works.filter((w) => w.clientName === c.name && isOpen(w));
        const openContent = content.filter((x) => x.clientName === c.name && isOpenContent(x));
        const monthContent = content.filter(
            (x) => x.clientName === c.name && (x.planMonth === month || x.scheduledFor.startsWith(month)),
        );
        const contentPosted = monthContent.filter((x) => x.status === "posted").length;
        const awaitingUs = openContent.filter((x) => x.reviewStatus === "changes_requested").length;
        const awaitingClient = openContent.filter((x) => x.reviewStatus === "awaiting_client").length;
        const overdueInvoices = clientInvoices.filter(
            (i) => i.status === "overdue" || (i.status === "sent" && i.dueDate < today),
        ).length;
        const renewsOn = nextProjectEnd(c.name, contracts);
        const renewsInDays = renewsOn ? daysUntil(renewsOn, today) : null;
        const contentQuota = clientContentQuota(c.name, contracts);
        const hasWork = openWorks.length > 0 || openContent.length > 0;

        const reasons: string[] = [];
        let health: Health = worstHealth(active.map((x) => x.health));
        if (renewsInDays !== null && renewsInDays <= RENEWAL_URGENT_DAYS) {
            reasons.push(
                renewsInDays < 0
                    ? `Project ended ${-renewsInDays}d ago — renew or close`
                    : `Project ends in ${renewsInDays}d`,
            );
        } else if (renewsInDays !== null && renewsInDays <= RENEWAL_WINDOW_DAYS) {
            reasons.push(`Project ends in ${renewsInDays}d`);
        }
        const red = active.filter((x) => x.health === "red");
        if (red.length) reasons.push(`${red.length} project${red.length === 1 ? "" : "s"} at risk`);
        if (awaitingUs > 0) reasons.push(`${awaitingUs} revision${awaitingUs === 1 ? "" : "s"} waiting on us`);
        if (contentQuota > 0 && monthContent.length < contentQuota) {
            reasons.push(`${contentQuota - monthContent.length} of ${contentQuota} content not planned`);
        }
        if (overdueInvoices > 0) reasons.push(`${overdueInvoices} overdue invoice${overdueInvoices === 1 ? "" : "s"}`);
        if (!hasWork) {
            reasons.push("No work in progress");
            if (health === "green") health = "amber";
        }
        if (health === "green" && reasons.length >= 2) health = "amber";
        if (health !== "red" && renewsInDays !== null && renewsInDays <= RENEWAL_URGENT_DAYS && reasons.length >= 2) {
            health = "red";
        }
        // Health inherited from a project that is merely "to watch" (task
        // due soon, approval waiting) — say why, so an amber row never reads
        // as "healthy".
        if (health !== "green" && reasons.length === 0) {
            const worst = active.find((x) => x.health === health) ?? active.find((x) => x.health !== "green");
            if (worst) reasons.push(`${worst.name}: ${worst.note}`);
        }

        retention.push({
            id: c.id,
            name: c.name,
            mrr: clientMrr(c, contracts, campaigns),
            dealOwner: c.dealOwner,
            projects: active.map((x) => x.name),
            renewsOn,
            renewsInDays,
            activeContracts: active.length,
            openTasks: openWorks.length,
            awaitingUs,
            awaitingClient,
            contentPosted,
            contentPlanned: monthContent.length,
            contentQuota,
            overdueInvoices,
            health,
            reasons,
            href,
        });
    }
    const HEALTH_RANK = { red: 0, amber: 1, green: 2 } as const;
    retention.sort(
        (a, b) =>
            HEALTH_RANK[a.health] - HEALTH_RANK[b.health] ||
            (a.renewsInDays ?? 9999) - (b.renewsInDays ?? 9999) ||
            b.mrr - a.mrr,
    );
    winBack.sort((a, b) => b.lifetimeBilled - a.lifetimeBilled || a.name.localeCompare(b.name));

    const renewals = retention.filter(
        (r) => r.renewsInDays !== null && r.renewsInDays <= RENEWAL_WINDOW_DAYS,
    );
    const atRisk = retention.filter((r) => r.health !== "green");

    return {
        today,
        kpis: {
            closeableMyr: closeable.reduce((s, r) => s + r.valueMyr, 0),
            closeableCount: closeable.length,
            openPipelineMyr: openLeads.reduce((s, l) => s + (l.estValueMyr || 0), 0),
            openLeads: openLeads.length,
            wonMtdCount: wonMtd.length,
            wonMtdMyr: wonMtd.reduce((s, l) => s + (l.estValueMyr || 0), 0),
            renewalsCount: renewals.length,
            renewalsMrr: renewals.reduce((s, r) => s + r.mrr, 0),
            atRiskCount: atRisk.length,
            atRiskMrr: atRisk.reduce((s, r) => s + r.mrr, 0),
            activeMrr: retention.reduce((s, r) => s + r.mrr, 0),
            winBackCount: winBack.length,
            conversion90Pct: decided90 ? Math.round((recentlyWon.length / decided90) * 100) : null,
        },
        closeable,
        early,
        retention,
        winBack,
        recentlyWon,
        recentlyLost,
    };
}
