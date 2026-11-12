/**
 * Management metrics — PROJECTS view: which clients we actually have a job
 * with, whether each project is in order (signed, invoiced, not past its
 * end), what work runs under it, which work runs with NO project, and which
 * payments haven't arrived.
 *
 * Pure functions over projects, clients, work and invoices. No I/O.
 */
import type { Contract } from "@/lib/data/contracts";
import type { Client } from "@/lib/data/clients";
import type { Invoice } from "@/lib/data/invoices";
import { computeTotals } from "@/lib/data/invoices";
import type { Work } from "@/lib/data/works";
import type { ContentPost } from "@/lib/data/content";
import type { Campaign } from "@/lib/data/campaigns";
import {
    clientJobStatus,
    endedDaysAgo,
    endsInDays,
    hasTerms,
    invoicesFor,
    summarizeWorks,
    urgentGaps,
    worksFor,
    CONTRACT_ENDING_SOON_DAYS,
    type JobStatus,
    type WorkSummary,
} from "@/lib/contracts/helpers";
import { daysSince, todayYmd, type Health } from "@/lib/management/metrics";

export type ContractRow = {
    id: string;
    code: string;
    name: string;
    clientName: string;
    accountManager: string;
    status: string;
    startDate: string;
    endDate: string;
    cadence: string;
    amountMyr: number;
    valueMyr: number;
    signed: boolean;
    work: WorkSummary;
    missingInvoices: string[];
    invoicedMyr: number;
    paidMyr: number;
    outstandingMyr: number;
    overdueInvoices: number;
    endedDaysAgo: number | null;
    endsInDays: number | null;
    health: Health;
    note: string;
    href: string;
};

export type ClientJobRow = {
    id: string;
    name: string;
    status: string;
    /** Who closed the deal; the projects under `job` carry their own AM. */
    dealOwner: string;
    job: JobStatus;
    activeContracts: number;
    /** Content / campaigns that are live for this client but sit under no project. */
    unlinkedWork: number;
    href: string;
};

export type PaymentRow = {
    invoiceId: string;
    number: string;
    clientName: string;
    contract: string;
    contractId: string | null;
    totalMyr: number;
    issueDate: string;
    dueDate: string;
    daysOverdue: number;
    status: string;
    href: string;
};

export type ContractIssue = {
    kind: "no_terms" | "unsigned" | "ended" | "ending" | "no_invoice";
    contractId: string;
    code: string;
    name: string;
    clientName: string;
    accountManager: string;
    detail: string;
    severity: "red" | "amber";
    href: string;
};

export type UnlinkedWork = {
    kind: "content" | "campaign";
    title: string;
    clientName: string;
    detail: string;
    href: string;
};

export type ContractsSnapshot = {
    today: string;
    kpis: {
        activeContracts: number;
        clientsWithJob: number;
        clientsWithoutJob: number;
        unsigned: number;
        ended: number;
        endingSoon: number;
        missingInvoices: number;
        unlinkedWork: number;
        contractedMonthlyMyr: number;
        pendingPaymentsMyr: number;
        overduePaymentsMyr: number;
        overduePaymentsCount: number;
    };
    contracts: ContractRow[];
    clients: ClientJobRow[];
    issues: ContractIssue[];
    unlinked: UnlinkedWork[];
    payments: PaymentRow[];
};

export type ContractsInput = {
    contracts: Contract[];
    clients: Client[];
    invoices: Invoice[];
    works: Work[];
    content: ContentPost[];
    campaigns: Campaign[];
};

const OPEN_CONTENT = new Set(["idea", "draft", "review", "scheduled"]);
const LIVE_CAMPAIGN = new Set(["planning", "live"]);
const HEALTH_RANK: Record<Health, number> = { red: 0, amber: 1, green: 2 };

export function buildContractsSnapshot(input: ContractsInput, today: string = todayYmd()): ContractsSnapshot {
    const { contracts, clients, invoices, works, content, campaigns } = input;
    const active = contracts.filter((c) => c.status === "active");

    // ---- Per project
    const rows: ContractRow[] = contracts
        .filter((c) => c.status !== "cancelled")
        .map((c) => {
            const work = summarizeWorks(worksFor(c, { works, content, campaigns }), today);
            const gaps = urgentGaps(c, invoices, today);
            const missingInvoices = gaps.filter((g) => g.key === "invoice").map((g) => g.month ?? g.label);
            const linked = invoicesFor(c, invoices);
            const invoicedMyr = linked.reduce((s, i) => s + computeTotals(i).total, 0);
            const paidMyr = linked.filter((i) => i.status === "paid").reduce((s, i) => s + computeTotals(i).total, 0);
            const outstanding = linked.filter((i) => i.status === "sent" || i.status === "overdue");
            const overdueInvoices = outstanding.filter((i) => i.status === "overdue" || i.dueDate < today).length;
            const ended = endedDaysAgo(c, today);
            const ending = endsInDays(c, today);

            let health: Health = "green";
            let note = "";
            if (c.status === "completed") {
                note = "Completed";
            } else if (c.status === "draft") {
                health = "amber";
                note = "Draft — not started";
            } else if (ended !== null) {
                health = "red";
                note = `Ended ${ended}d ago, still active — close, extend or renew`;
            } else if (!hasTerms(c)) {
                health = "red";
                note = "No terms on file";
            } else if (!c.signedAt) {
                health = "red";
                note = "Not signed";
            } else if (missingInvoices.length > 0) {
                health = "red";
                note = `No invoice for ${missingInvoices.join(", ")}`;
            } else if (overdueInvoices > 0) {
                health = "amber";
                note = `${overdueInvoices} invoice${overdueInvoices === 1 ? "" : "s"} overdue`;
            } else if (work.tasks + work.content + work.campaigns === 0) {
                health = "amber";
                note = "No tasks under this account yet";
            } else if (work.overdueTasks > 0) {
                health = "amber";
                note = `${work.overdueTasks} task${work.overdueTasks === 1 ? "" : "s"} overdue`;
            } else if (ending !== null && ending <= CONTRACT_ENDING_SOON_DAYS) {
                health = "amber";
                note = `Ends in ${ending}d — line up the renewal`;
            } else {
                note = `In order · ${work.openItems} open item${work.openItems === 1 ? "" : "s"}`;
            }

            return {
                id: c.id,
                code: c.code,
                name: c.name,
                clientName: c.clientName,
                accountManager: c.accountManager,
                status: c.status,
                startDate: c.startDate,
                endDate: c.endDate,
                cadence: c.billing.cadence,
                amountMyr: c.billing.amountMyr,
                valueMyr: c.valueMyr,
                signed: Boolean(c.signedAt),
                work,
                missingInvoices,
                invoicedMyr,
                paidMyr,
                outstandingMyr: outstanding.reduce((s, i) => s + computeTotals(i).total, 0),
                overdueInvoices,
                endedDaysAgo: ended,
                endsInDays: ending,
                health,
                note,
                href: `/projects/${c.id}`,
            };
        })
        .sort((a, b) => HEALTH_RANK[a.health] - HEALTH_RANK[b.health] || a.clientName.localeCompare(b.clientName) || a.name.localeCompare(b.name));

    // ---- Work with no project (live work on clients we service)
    const unlinked: UnlinkedWork[] = [];
    const clientStatus = new Map(clients.map((c) => [c.name, c.status]));
    const servicing = (name: string) => clientStatus.get(name) === "active" || clientStatus.get(name) === "paused";
    for (const x of content) {
        if (x.contractId || !OPEN_CONTENT.has(x.status) || !servicing(x.clientName)) continue;
        unlinked.push({
            kind: "content",
            title: x.title,
            clientName: x.clientName,
            detail: `${x.scheduledFor} · ${x.status}`,
            href: `/content/${x.id}`,
        });
    }
    for (const x of campaigns) {
        if (x.contractId || !LIVE_CAMPAIGN.has(x.status) || !servicing(x.clientName) || x.clientName === "Nexov") continue;
        unlinked.push({
            kind: "campaign",
            title: x.name,
            clientName: x.clientName,
            detail: `${x.platform} · ${x.status}`,
            href: `/campaigns/${x.id}`,
        });
    }
    unlinked.sort((a, b) => a.clientName.localeCompare(b.clientName) || a.title.localeCompare(b.title));

    // ---- Per client: do we have a job?
    const unlinkedByClient = new Map<string, number>();
    for (const u of unlinked) unlinkedByClient.set(u.clientName, (unlinkedByClient.get(u.clientName) ?? 0) + 1);
    const clientRows: ClientJobRow[] = clients
        .filter((c) => c.status !== "churned")
        .map((c) => {
            const job = clientJobStatus(c.name, contracts, today);
            return {
                id: c.id,
                name: c.name,
                status: c.status,
                dealOwner: c.dealOwner,
                job,
                activeContracts: job.active.length,
                unlinkedWork: unlinkedByClient.get(c.name) ?? 0,
                href: `/settings/clients/${c.id}`,
            };
        })
        .sort((a, b) => {
            const rank = (s: string) => (s === "ended" || s === "unsigned" ? 0 : s === "none" ? 1 : s === "ending" ? 2 : s === "draft" ? 3 : 4);
            return rank(a.job.state) - rank(b.job.state) || a.name.localeCompare(b.name);
        });

    // ---- Contract issues
    const issues: ContractIssue[] = [];
    for (const c of active) {
        const base = {
            contractId: c.id,
            code: c.code,
            name: c.name,
            clientName: c.clientName,
            accountManager: c.accountManager,
            href: `/projects/${c.id}?tab=money#terms`,
        };
        if (!hasTerms(c)) {
            issues.push({ ...base, kind: "no_terms", severity: "red", detail: "No reference, value or signed copy on file" });
        } else if (!c.signedAt) {
            issues.push({
                ...base,
                kind: "unsigned",
                severity: "red",
                detail: `${c.reference || "Contract"}${c.valueMyr ? ` · RM ${c.valueMyr.toLocaleString()}` : ""} · not signed, work started ${c.startDate}`,
            });
        }
        const ended = endedDaysAgo(c, today);
        const ending = endsInDays(c, today);
        if (ended !== null) {
            issues.push({
                ...base,
                href: `/projects/${c.id}`,
                kind: "ended",
                severity: "red",
                detail: `Ended ${c.endDate} (${ended}d ago) · complete it, extend, or renew`,
            });
        } else if (ending !== null && ending <= CONTRACT_ENDING_SOON_DAYS) {
            issues.push({
                ...base,
                href: `/projects/${c.id}`,
                kind: "ending",
                severity: "amber",
                detail: `Ends ${c.endDate} (in ${ending}d) · line up the renewal`,
            });
        }
        const missing = urgentGaps(c, invoices, today).filter((g) => g.key === "invoice");
        if (missing.length > 0) {
            issues.push({
                ...base,
                kind: "no_invoice",
                severity: "red",
                detail: `Not invoiced: ${missing.map((g) => g.month ?? g.label).join(", ")}`,
            });
        }
    }
    issues.sort((a, b) => (a.severity === b.severity ? a.clientName.localeCompare(b.clientName) : a.severity === "red" ? -1 : 1));

    // ---- Pending payments: every invoice sent and not yet paid (all clients).
    const byId = new Map(contracts.map((c) => [c.id, c]));
    const payments: PaymentRow[] = invoices
        .filter((i) => i.status === "sent" || i.status === "overdue")
        .map((i) => {
            const c = i.contractId ? byId.get(i.contractId) : undefined;
            const overdueDays = i.dueDate < today ? daysSince(i.dueDate, today) : 0;
            return {
                invoiceId: i.id,
                number: i.number,
                clientName: i.clientName,
                contract: c ? `${c.code} · ${c.name}` : "",
                contractId: c?.id ?? null,
                totalMyr: computeTotals(i).total,
                issueDate: i.issueDate,
                dueDate: i.dueDate,
                daysOverdue: overdueDays,
                status: i.status === "overdue" || overdueDays > 0 ? "overdue" : "awaiting payment",
                href: `/invoices/${i.id}`,
            };
        })
        .sort((a, b) => b.daysOverdue - a.daysOverdue || a.dueDate.localeCompare(b.dueDate));
    const overduePayments = payments.filter((p) => p.daysOverdue > 0);

    const servicingClients = clientRows.filter((c) => c.status === "active");
    return {
        today,
        kpis: {
            activeContracts: active.length,
            clientsWithJob: servicingClients.filter((c) => c.activeContracts > 0).length,
            clientsWithoutJob: servicingClients.filter((c) => c.activeContracts === 0).length,
            unsigned: issues.filter((x) => x.kind === "unsigned" || x.kind === "no_terms").length,
            ended: issues.filter((x) => x.kind === "ended").length,
            endingSoon: issues.filter((x) => x.kind === "ending").length,
            missingInvoices: rows.reduce((s, r) => s + r.missingInvoices.length, 0),
            unlinkedWork: unlinked.length,
            contractedMonthlyMyr: active
                .filter((c) => c.billing.cadence === "monthly")
                .reduce((s, c) => s + c.billing.amountMyr, 0),
            pendingPaymentsMyr: payments.reduce((s, p) => s + p.totalMyr, 0),
            overduePaymentsMyr: overduePayments.reduce((s, p) => s + p.totalMyr, 0),
            overduePaymentsCount: overduePayments.length,
        },
        contracts: rows,
        clients: clientRows,
        issues,
        unlinked,
        payments,
    };
}
