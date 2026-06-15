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
    listProjects,
    PROJECT_PHASES,
    type Project,
} from "@/lib/data/projects";
import {
    computeManagementFee,
    listCampaigns,
    totalsFor,
    type Campaign,
} from "@/lib/data/campaigns";
import { listContentPosts, type ContentPost } from "@/lib/data/content";
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
    projectsCreated: number;
    projectsDelivered: number;
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
        projectsCreated: 0,
        projectsDelivered: 0,
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
    const [leads, projects, invoices, campaigns] = await Promise.all([
        listLeads(),
        listProjects(),
        listInvoices(),
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
    for (const p of projects) {
        bump(monthOf(p.createdAt), (r) => r.projectsCreated++);
        if (p.status === "delivered") {
            bump(monthOf(p.updatedAt), (r) => r.projectsDelivered++);
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
            projectId: i.projectId ?? "",
            createdAt: i.createdAt,
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

export function projectsToRows(
    projects: Project[],
): Array<Record<string, unknown>> {
    return projects.map((p) => ({
        name: p.name,
        client: p.clientName,
        status: p.status,
        phase: p.phase,
        phaseIndex: PROJECT_PHASES.indexOf(p.phase),
        taskCount: p.tasks.length,
        deliverableCount: p.deliverables.length,
        deliverablesApproved: p.deliverables.filter((d) => d.approvedAt).length,
        signedOff: p.signoff.signedAt ? "yes" : "no",
        signedBy: p.signoff.signedBy,
        signedAt: p.signoff.signedAt ?? "",
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
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
    "invoices",
    "leads",
    "projects",
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
        case "invoices":
            return toCsv(invoicesToRows(await listInvoices()));
        case "leads":
            return toCsv(leadsToRows(await listLeads()));
        case "projects":
            return toCsv(projectsToRows(await listProjects()));
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
    projects: Array<{
        project: Project;
        deliverablesApprovedInMonth: number;
        signedOffInMonth: boolean;
    }>;
    contentPostsPublished: ContentPost[];
    contentApproved: ContentPost[];
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
    const [campaigns, projects, invoices, leads, posts, articles] =
        await Promise.all([
            listCampaigns(),
            listProjects(),
            listInvoices(),
            listLeads(),
            listContentPosts(),
            listSeoArticles(),
        ]);

    const monthStart = `${monthKey}-01`;
    const monthEnd = lastDayOfMonth(monthKey);

    const clientCampaigns = campaigns.filter(
        (c) => c.clientName === clientName,
    );
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

    const clientProjects = projects
        .filter((p) => p.clientName === clientName)
        .map((p) => ({
            project: p,
            deliverablesApprovedInMonth: p.deliverables.filter((d) =>
                inMonth(d.approvedAt, monthKey),
            ).length,
            signedOffInMonth: inMonth(p.signoff.signedAt, monthKey),
        }));

    const contentPostsPublished = posts.filter(
        (p) =>
            p.clientName === clientName &&
            p.status === "posted" &&
            inMonth(p.postedAt ?? p.scheduledFor, monthKey),
    );
    const contentApproved = posts.filter(
        (p) =>
            p.clientName === clientName &&
            p.reviewStatus === "approved" &&
            inMonth(p.approvedAt, monthKey),
    );
    const seoArticlesPublished = articles.filter(
        (a) =>
            a.clientName === clientName &&
            a.stage === "published" &&
            inMonth(a.publishedAt, monthKey),
    );

    const clientInvoices = invoices.filter(
        (i) => i.clientName === clientName,
    );
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
        projects: clientProjects,
        contentPostsPublished,
        contentApproved,
        seoArticlesPublished,
        invoicesIssued,
        invoicesPaid,
        invoiceTotals,
    };
}

/** All distinct client names that have *any* activity (for the picker). */
export async function listAllClientNames(): Promise<string[]> {
    const [campaigns, projects, invoices, posts, articles] = await Promise.all([
        listCampaigns(),
        listProjects(),
        listInvoices(),
        listContentPosts(),
        listSeoArticles(),
    ]);
    const set = new Set<string>();
    for (const c of campaigns) if (c.clientName) set.add(c.clientName);
    for (const p of projects) if (p.clientName) set.add(p.clientName);
    for (const i of invoices) if (i.clientName) set.add(i.clientName);
    for (const p of posts) if (p.clientName) set.add(p.clientName);
    for (const a of articles) if (a.clientName) set.add(a.clientName);
    return Array.from(set).sort();
}
