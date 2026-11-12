/**
 * Reporting aggregator. Reads from the dev file stores, computes monthly
 * roll-ups, and emits CSV strings. Works for any year — gaps are zero-filled.
 *
 * When Supabase lands, swap the list* calls for SQL aggregates; the CSV
 * builders below stay unchanged.
 */
import { listLeads, type Lead } from "@/lib/data/leads";
import {
    computeTotals,
    listInvoices,
    type Invoice,
} from "@/lib/data/invoices";
import {
    computeTotals as quoteTotals,
    listQuotations,
    type Quotation,
} from "@/lib/data/quotations";
import {
    CONTRACT_STAGE_LABEL,
    listContracts,
    type Contract,
} from "@/lib/data/contracts";
import { listWorks, type Work } from "@/lib/data/works";
import { SEAT_LABEL } from "@/lib/data/planners";
import {
    isOpen,
    isOverdue,
    nextDue,
    progress,
    todayKey,
} from "@/lib/works/helpers";
import {
    computeManagementFee,
    listCampaigns,
    totalsFor,
    type Campaign,
} from "@/lib/data/campaigns";
import { listContentPosts, type ContentPost } from "@/lib/data/content";
import { activeProjectNames, clientMonthlyMyr } from "@/lib/clients/revenue";
import { clientContentQuota } from "@/lib/clients/quota";
import {
    listSeoArticles,
    type SeoArticle,
} from "@/lib/data/seo-articles";

// ---------------------------------------------------------------------------
// CSV primitive

/** RFC-4180-ish escaping. Always quote — safe for clients (Excel, Sheets). */
function csvCell(v: unknown): string {
    if (v === null || v === undefined) return '""';
    const s = String(v);
    return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
    if (rows.length === 0) return "";
    const headers = Object.keys(rows[0]);
    const lines = [headers.map(csvCell).join(",")];
    for (const r of rows) {
        lines.push(headers.map((h) => csvCell(r[h])).join(","));
    }
    // CRLF for Excel friendliness
    return lines.join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// Monthly summary

export type MonthlySummaryRow = {
    month: string; // YYYY-MM
    leadsCreated: number;
    leadsWon: number;
    contractsStarted: number; // contracts whose start date falls in month
    tasksCompleted: number; // contract tasks completed in month
    quotesSent: number; // quotes issued (status past draft) in month
    quotesAccepted: number; // quotes accepted/converted in month
    quotedMyr: number; // total MYR on quotes issued in month
    invoicesIssued: number;
    invoicesPaid: number;
    billedMyr: number; // total MYR on invoices issued in month
    paidMyr: number; // total MYR on invoices paid in month
    adSpendMyr: number; // sum of campaign metric spend in month
};

function monthsOfYear(year: number): string[] {
    return Array.from({ length: 12 }, (_, i) =>
        `${year}-${String(i + 1).padStart(2, "0")}`,
    );
}

function emptyRow(month: string): MonthlySummaryRow {
    return {
        month,
        leadsCreated: 0,
        leadsWon: 0,
        contractsStarted: 0,
        tasksCompleted: 0,
        quotesSent: 0,
        quotesAccepted: 0,
        quotedMyr: 0,
        invoicesIssued: 0,
        invoicesPaid: 0,
        billedMyr: 0,
        paidMyr: 0,
        adSpendMyr: 0,
    };
}

function monthOf(iso: string | null | undefined): string {
    return (iso ?? "").slice(0, 7);
}

export async function buildMonthlySummary(
    year: number,
): Promise<MonthlySummaryRow[]> {
    const [leads, contracts, works, invoices, quotes, campaigns] =
        await Promise.all([
            listLeads(),
            listContracts(),
            listWorks(),
            listInvoices(),
            listQuotations(),
            listCampaigns(),
        ]);
    const yearPrefix = String(year);
    const rows = new Map<string, MonthlySummaryRow>();
    for (const m of monthsOfYear(year)) rows.set(m, emptyRow(m));

    const bump = (m: string, mut: (r: MonthlySummaryRow) => void) => {
        if (!m.startsWith(yearPrefix)) return;
        const r = rows.get(m);
        if (r) mut(r);
    };

    for (const l of leads) {
        bump(monthOf(l.createdAt), (r) => r.leadsCreated++);
        if (l.status === "won") {
            bump(monthOf(l.updatedAt), (r) => r.leadsWon++);
        }
    }
    for (const c of contracts) {
        if (c.status === "cancelled") continue;
        bump(monthOf(c.startDate), (r) => r.contractsStarted++);
    }
    for (const w of works) {
        if (w.status === "completed" && w.completedAt) {
            bump(monthOf(w.completedAt), (r) => r.tasksCompleted++);
        }
    }
    for (const inv of invoices) {
        const totals = computeTotals(inv);
        if (inv.status !== "draft" && inv.status !== "void") {
            bump(monthOf(inv.issueDate), (r) => {
                r.invoicesIssued++;
                r.billedMyr += totals.total;
            });
        }
        if (inv.status === "paid" && inv.paidAt) {
            bump(monthOf(inv.paidAt), (r) => {
                r.invoicesPaid++;
                r.paidMyr += totals.total;
            });
        }
    }
    for (const q of quotes) {
        const totals = quoteTotals(q);
        if (q.status !== "draft") {
            bump(monthOf(q.issueDate), (r) => {
                r.quotesSent++;
                r.quotedMyr += totals.total;
            });
        }
        if ((q.status === "accepted" || q.status === "converted") && q.acceptedAt) {
            bump(monthOf(q.acceptedAt), (r) => r.quotesAccepted++);
        }
    }
    for (const c of campaigns) {
        for (const m of c.metrics) {
            bump(monthOf(m.date), (r) => {
                r.adSpendMyr += m.spendMyr;
            });
        }
    }

    // Round currency to 2dp for stable CSV output
    return [...rows.values()].map((r) => ({
        ...r,
        quotedMyr: +r.quotedMyr.toFixed(2),
        billedMyr: +r.billedMyr.toFixed(2),
        paidMyr: +r.paidMyr.toFixed(2),
        adSpendMyr: +r.adSpendMyr.toFixed(2),
    }));
}

// ---------------------------------------------------------------------------
// Per-entity CSV row builders (one row per record)

export function invoicesToRows(
    invoices: Invoice[],
): Array<Record<string, unknown>> {
    return invoices.map((i) => {
        const t = computeTotals(i);
        return {
            number: i.number,
            client: i.clientName,
            status: i.status,
            issueDate: i.issueDate,
            dueDate: i.dueDate,
            paidAt: i.paidAt ?? "",
            itemCount: i.items.length,
            subtotalMyr: t.subtotal,
            taxRatePct: i.taxRatePct,
            taxMyr: t.tax,
            totalMyr: t.total,
            createdAt: i.createdAt,
        };
    });
}

export function quotationsToRows(
    quotes: Quotation[],
): Array<Record<string, unknown>> {
    return quotes.map((q) => {
        const t = quoteTotals(q);
        return {
            number: q.number,
            client: q.clientName,
            status: q.status,
            issueDate: q.issueDate,
            validUntil: q.validUntil,
            acceptedAt: q.acceptedAt ?? "",
            convertedInvoiceId: q.convertedInvoiceId ?? "",
            itemCount: q.items.length,
            subtotalMyr: t.subtotal,
            taxRatePct: q.taxRatePct,
            taxMyr: t.tax,
            totalMyr: t.total,
            createdAt: q.createdAt,
        };
    });
}

export function leadsToRows(leads: Lead[]): Array<Record<string, unknown>> {
    return leads.map((l) => ({
        name: l.name,
        company: l.company,
        email: l.email,
        phone: l.phone,
        source: l.source,
        sourceCampaignId: l.sourceCampaignId ?? "",
        status: l.status,
        interestedIn: l.interestedIn,
        estValueMyr: l.estValueMyr,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
    }));
}

/** "Aisha 50% / Mei 50%" — seat label stands in while nobody holds the seat. */
function assigneesLabel(w: Work): string {
    return w.split
        .map((s) => `${s.member || SEAT_LABEL[s.seat]} ${s.pct}%`)
        .join(" / ");
}

/** One row per contract task. `contracts` resolves the human contract code. */
export function tasksToRows(
    works: Work[],
    contracts: Contract[],
): Array<Record<string, unknown>> {
    const codeById = new Map(contracts.map((c) => [c.id, c.code]));
    return works.map((w) => ({
        id: w.id,
        contractCode: codeById.get(w.contractId) ?? "",
        client: w.clientName,
        type: w.type,
        title: w.title,
        month: w.month,
        phase: w.phaseName,
        dueDate: w.dueDate,
        status: w.status,
        assignees: assigneesLabel(w),
        completedAt: w.completedAt ?? "",
    }));
}

export function campaignsToRows(
    campaigns: Campaign[],
    fromDate = "",
    toDate = "",
): Array<Record<string, unknown>> {
    return campaigns.map((c) => {
        const t = totalsFor(c.metrics, fromDate, toDate);
        const cpc = t.clicks > 0 ? +(t.spendMyr / t.clicks).toFixed(2) : 0;
        const cpl =
            t.leadsReported > 0
                ? +(t.spendMyr / t.leadsReported).toFixed(2)
                : 0;
        return {
            name: c.name,
            client: c.clientName,
            platform: c.platform,
            objective: c.objective,
            status: c.status,
            startDate: c.startDate,
            endDate: c.endDate,
            monthlyBudgetMyr: c.monthlyBudgetMyr,
            spendMyr: +t.spendMyr.toFixed(2),
            impressions: t.impressions,
            clicks: t.clicks,
            leadsReported: t.leadsReported,
            conversionsReported: t.conversionsReported,
            cpcMyr: cpc,
            cplMyr: cpl,
            metricDays: t.days,
        };
    });
}

// ---------------------------------------------------------------------------
// Top-level: build a CSV by kind

export const REPORT_KINDS = [
    "monthly",
    "quotations",
    "invoices",
    "leads",
    "tasks",
    "campaigns",
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export async function buildReportCsv(
    kind: ReportKind,
    opts: { year?: number; fromDate?: string; toDate?: string } = {},
): Promise<string> {
    switch (kind) {
        case "monthly": {
            const year = opts.year ?? new Date().getFullYear();
            return toCsv(await buildMonthlySummary(year));
        }
        case "quotations":
            return toCsv(quotationsToRows(await listQuotations()));
        case "invoices":
            return toCsv(invoicesToRows(await listInvoices()));
        case "leads":
            return toCsv(leadsToRows(await listLeads()));
        case "tasks": {
            const [works, contracts] = await Promise.all([
                listWorks(),
                listContracts(),
            ]);
            return toCsv(tasksToRows(works, contracts));
        }
        case "campaigns":
            return toCsv(
                campaignsToRows(
                    await listCampaigns(),
                    opts.fromDate,
                    opts.toDate,
                ),
            );
    }
}

export function reportFilename(
    kind: ReportKind,
    opts: { year?: number } = {},
): string {
    const stamp = new Date().toISOString().slice(0, 10);
    if (kind === "monthly") {
        const y = opts.year ?? new Date().getFullYear();
        return `nexov-monthly-${y}.csv`;
    }
    return `nexov-${kind}-${stamp}.csv`;
}

// ---------------------------------------------------------------------------
// Per-client monthly report (client-facing)

export type ClientReportContract = {
    contract: Contract;
    code: string;
    name: string;
    stageLabel: string;
    startDate: string;
    /** "" = open-ended. */
    endDate: string;
    valueMyr: number;
    /** Over every task on the contract, not just the month. */
    progress: { done: number; total: number; pct: number };
    /** Phase of the earliest open task by due date; "" when nothing is open. */
    currentPhase: string;
    /** Earliest open task by due date. */
    nextDue: Work | undefined;
    /** Open tasks past their due date (as of today). */
    overdueCount: number;
    /** Tasks whose completion landed in the report month. */
    completedInMonth: number;
};

export type ClientMonthlyReport = {
    clientName: string;
    monthKey: string; // YYYY-MM
    monthStart: string; // YYYY-MM-01
    monthEnd: string; // YYYY-MM-{lastDay}
    campaigns: Array<{
        campaign: Campaign;
        spendMyr: number;
        impressions: number;
        clicks: number;
        leadsReported: number;
        crmLeads: number;
        wonRevenueMyr: number;
        mgmtFeeMyr: number;
    }>;
    totals: {
        spendMyr: number;
        impressions: number;
        clicks: number;
        leadsReported: number;
        crmLeads: number;
        wonRevenueMyr: number;
        mgmtFeeMyr: number;
        billableMyr: number; // spend + mgmtFee
    };
    /**
     * The client's contracts that run during the month (not cancelled, not
     * started after it, not ended before it), each with its task progress.
     */
    contracts: ClientReportContract[];
    contentPostsPublished: ContentPost[];
    /**
     * Every deliverable of the month: items in the client's plan month (plus
     * unplanned items whose delivery landed in the month) that have produced
     * output (at least one draft/file) and aren't archived — regardless of
     * whether the client's formal approval click happened in the same
     * calendar month.
     */
    contentDelivered: ContentPost[];
    /**
     * Work beyond what the client's projects promise this month: visuals over
     * the monthly content quota and revisions past the client's limit. Counts
     * only — extras are not priced on the client record any more; the account
     * manager agrees any charge with the client.
     */
    extras: {
        contentCount: number;
        revisionCount: number;
    };
    /**
     * Monthly billing, read off the client's ACTIVE projects: the sum of their
     * monthly billing and the content a month their deliverables promise.
     */
    billing: {
        /** Names of the active projects (what used to be the package name). */
        projects: string[];
        retainer: number;
        includedContents: number;
        deliveredContents: number;
        total: number;
    };
    seoArticlesPublished: SeoArticle[];
    invoicesIssued: Invoice[];
    invoicesPaid: Invoice[];
    invoiceTotals: { issuedMyr: number; paidMyr: number };
};

/** Inclusive last day of month, formatted YYYY-MM-DD. */
function lastDayOfMonth(yyyymm: string): string {
    const [y, m] = yyyymm.split("-").map(Number);
    // new Date(y, m, 0) gives last day of month m (1-indexed in JS Date)
    const d = new Date(Date.UTC(y, m, 0));
    return d.toISOString().slice(0, 10);
}

function inMonth(iso: string | null | undefined, monthKey: string): boolean {
    return Boolean(iso && iso.slice(0, 7) === monthKey);
}

export async function buildClientMonthlyReport(
    clientName: string,
    monthKey: string,
): Promise<ClientMonthlyReport> {
    const [campaigns, contracts, works, invoices, leads, posts, articles] =
        await Promise.all([
            listCampaigns(),
            listContracts(),
            listWorks(),
            listInvoices(),
            listLeads(),
            listContentPosts(),
            listSeoArticles(),
        ]);

    const monthStart = `${monthKey}-01`;
    const monthEnd = lastDayOfMonth(monthKey);

    // Client names are entered by hand in several places — match them the way
    // the quota/limit helpers do (trim + case-insensitive), or records drop
    // out of the report over a stray space or capital letter.
    const wanted = clientName.trim().toLowerCase();
    const isClient = (name: string) => name.trim().toLowerCase() === wanted;

    const clientCampaigns = campaigns.filter((c) => isClient(c.clientName));
    const campaignRows = clientCampaigns.map((c) => {
        const t = totalsFor(c.metrics, monthStart, monthEnd);
        const crmLeads = leads.filter(
            (l) =>
                l.sourceCampaignId === c.id && inMonth(l.createdAt, monthKey),
        );
        const wonRevenueMyr = crmLeads
            .filter((l) => l.status === "won")
            .reduce((s, l) => s + l.estValueMyr, 0);
        return {
            campaign: c,
            spendMyr: +t.spendMyr.toFixed(2),
            impressions: t.impressions,
            clicks: t.clicks,
            leadsReported: t.leadsReported,
            crmLeads: crmLeads.length,
            wonRevenueMyr: +wonRevenueMyr.toFixed(2),
            mgmtFeeMyr: +computeManagementFee(c, t.spendMyr).toFixed(2),
        };
    });
    const totals = campaignRows.reduce(
        (acc, r) => {
            acc.spendMyr += r.spendMyr;
            acc.impressions += r.impressions;
            acc.clicks += r.clicks;
            acc.leadsReported += r.leadsReported;
            acc.crmLeads += r.crmLeads;
            acc.wonRevenueMyr += r.wonRevenueMyr;
            acc.mgmtFeeMyr += r.mgmtFeeMyr;
            return acc;
        },
        {
            spendMyr: 0,
            impressions: 0,
            clicks: 0,
            leadsReported: 0,
            crmLeads: 0,
            wonRevenueMyr: 0,
            mgmtFeeMyr: 0,
            billableMyr: 0,
        },
    );
    totals.spendMyr = +totals.spendMyr.toFixed(2);
    totals.wonRevenueMyr = +totals.wonRevenueMyr.toFixed(2);
    totals.mgmtFeeMyr = +totals.mgmtFeeMyr.toFixed(2);
    totals.billableMyr = +(totals.spendMyr + totals.mgmtFeeMyr).toFixed(2);

    // Contracts running during the month, each rolled up from its tasks.
    const today = todayKey();
    const runsInMonth = (c: Contract) =>
        c.status !== "cancelled" &&
        (!c.startDate || c.startDate <= monthEnd) &&
        (!c.endDate || c.endDate >= monthStart);
    const clientContracts: ClientReportContract[] = contracts
        .filter((c) => isClient(c.clientName) && runsInMonth(c))
        .map((c) => {
            const tasks = works.filter((w) => w.contractId === c.id);
            const upcoming = nextDue(tasks);
            const { done, total, pct } = progress(tasks);
            return {
                contract: c,
                code: c.code,
                name: c.name,
                stageLabel: CONTRACT_STAGE_LABEL[c.stage],
                startDate: c.startDate,
                endDate: c.endDate,
                valueMyr: c.valueMyr,
                progress: { done, total, pct },
                currentPhase: upcoming?.phaseName ?? "",
                nextDue: upcoming,
                overdueCount: tasks.filter((w) => isOverdue(w, today)).length,
                completedInMonth: tasks.filter(
                    (w) => !isOpen(w) && inMonth(w.completedAt, monthKey),
                ).length,
            };
        });

    // Deterministic content sequence: scheduled date first, then NATURAL title
    // order so "Video 2" sorts before "Video 10" (plan items often share the
    // same scheduled date, where raw DB order is arbitrary), then creation
    // time as the final tiebreak.
    const bySequence = (a: ContentPost, b: ContentPost) =>
        a.scheduledFor.localeCompare(b.scheduledFor) ||
        a.title.localeCompare(b.title, undefined, {
            numeric: true,
            sensitivity: "base",
        }) ||
        a.createdAt.localeCompare(b.createdAt);

    const contentPostsPublished = posts
        .filter(
            (p) =>
                isClient(p.clientName) &&
                p.status === "posted" &&
                inMonth(p.postedAt ?? p.scheduledFor, monthKey),
        )
        .sort(bySequence);

    // A deliverable belongs to the month via its PLAN (the same key billing
    // counts against the quota). Items without a plan month fall back to when
    // their delivery actually landed. Approval date is NOT the gate: a July
    // deliverable the client only clicked "approve" on in August is still a
    // July deliverable.
    const belongsToMonth = (p: ContentPost) =>
        p.planMonth
            ? p.planMonth === monthKey
            : inMonth(p.approvedAt ?? p.postedAt ?? p.scheduledFor, monthKey);
    const hasOutput = (p: ContentPost) =>
        p.drafts.length > 0 || Boolean(p.currentFileUrl);
    const contentDelivered = posts
        .filter(
            (p) =>
                isClient(p.clientName) &&
                p.status !== "archived" &&
                belongsToMonth(p) &&
                hasOutput(p),
        )
        .sort(bySequence);

    // Extras: VISUALS beyond the monthly quota the client's projects promise
    // (carousel = several visuals, single = 1) + revisions beyond the client's
    // limit. Counts only. Exact overage: total visuals used − quota.
    const monthContent = posts.filter(
        (p) => isClient(p.clientName) && p.planMonth === monthKey,
    );
    const monthVisuals = monthContent
        .filter((p) => p.status !== "archived")
        .reduce((sum, p) => sum + Math.max(1, p.visualCount || 1), 0);
    const quota = clientContentQuota(clientName, contracts);
    const extraContentCount =
        quota > 0
            ? Math.max(0, monthVisuals - quota)
            : monthContent
                  .filter((p) => p.billable)
                  .reduce((sum, p) => sum + Math.max(1, p.visualCount || 1), 0);
    const extraRevisionCount = monthContent.reduce(
        (n, p) => n + (p.billableRevisions || 0),
        0,
    );
    const extras = {
        contentCount: extraContentCount,
        revisionCount: extraRevisionCount,
    };

    // Billing comes off the active projects: their monthly billing summed.
    const retainer = clientMonthlyMyr(clientName, contracts);
    const billing = {
        projects: activeProjectNames(clientName, contracts),
        retainer,
        includedContents: quota,
        deliveredContents: monthContent.filter(
            (p) => p.status !== "archived" && hasOutput(p),
        ).length,
        total: retainer,
    };
    const seoArticlesPublished = articles.filter(
        (a) =>
            isClient(a.clientName) &&
            a.stage === "published" &&
            inMonth(a.publishedAt, monthKey),
    );

    const clientInvoices = invoices.filter((i) => isClient(i.clientName));
    const invoicesIssued = clientInvoices.filter(
        (i) =>
            i.status !== "draft" &&
            i.status !== "void" &&
            inMonth(i.issueDate, monthKey),
    );
    const invoicesPaid = clientInvoices.filter(
        (i) => i.status === "paid" && inMonth(i.paidAt, monthKey),
    );
    const invoiceTotals = {
        issuedMyr: +invoicesIssued
            .reduce((s, i) => s + computeTotals(i).total, 0)
            .toFixed(2),
        paidMyr: +invoicesPaid
            .reduce((s, i) => s + computeTotals(i).total, 0)
            .toFixed(2),
    };

    return {
        clientName,
        monthKey,
        monthStart,
        monthEnd,
        campaigns: campaignRows,
        totals,
        contracts: clientContracts,
        contentPostsPublished,
        contentDelivered,
        extras,
        billing,
        seoArticlesPublished,
        invoicesIssued,
        invoicesPaid,
        invoiceTotals,
    };
}

/** All distinct client names that have *any* activity (for the picker). */
export async function listAllClientNames(): Promise<string[]> {
    const [campaigns, contracts, invoices, posts, articles] = await Promise.all([
        listCampaigns(),
        listContracts(),
        listInvoices(),
        listContentPosts(),
        listSeoArticles(),
    ]);
    const set = new Set<string>();
    for (const c of campaigns) if (c.clientName) set.add(c.clientName);
    for (const c of contracts) if (c.clientName) set.add(c.clientName);
    for (const i of invoices) if (i.clientName) set.add(i.clientName);
    for (const p of posts) if (p.clientName) set.add(p.clientName);
    for (const a of articles) if (a.clientName) set.add(a.clientName);
    return Array.from(set).sort();
}
