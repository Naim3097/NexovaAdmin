/**
 * FINANCE home — the contract & finance person's landing page.
 *
 * What is owed (AR), what is overdue, what falls due soon, what was paid,
 * which drafts from payment schedules must go out, which contracts still
 * need their paperwork, and which end soon. Pure functions over invoices
 * and contracts. No I/O.
 */
import type { Contract } from "@/lib/data/contracts";
import type { Invoice } from "@/lib/data/invoices";
import { computeTotals } from "@/lib/data/invoices";
import { endsInDays } from "@/lib/contracts/helpers";
import { daysSince, shiftYmd, todayYmd } from "@/lib/management/metrics";

/** Sent invoices falling due inside this window are "due soon". */
export const DUE_SOON_DAYS = 14;
/** Draft invoices whose due date is inside this window must be issued now. */
export const DRAFT_WINDOW_DAYS = 30;
/** Receipts window. */
export const PAID_WINDOW_DAYS = 30;
/** Contracts ending inside this window go on the renewal list. */
export const ENDING_WINDOW_DAYS = 60;

export type InvoiceRow = {
    id: string;
    number: string;
    clientName: string;
    contractId: string | null;
    contractCode: string;
    status: Invoice["status"];
    issueDate: string;
    dueDate: string;
    /** Positive = days past due; negative = days until due. */
    daysLate: number;
    totalMyr: number;
    /** YYYY-MM-DD the payment landed (receipts only). */
    paidAt: string;
    href: string;
};

export type ContractRow = {
    id: string;
    code: string;
    name: string;
    clientName: string;
    accountManager: string;
    status: Contract["status"];
    startDate: string;
    endDate: string;
    valueMyr: number;
    amountMyr: number;
    cadence: Contract["billing"]["cadence"];
    signed: boolean;
    /** What is missing / why it is listed. */
    note: string;
    /** Days until the end date (ending list). */
    endsInDays: number | null;
    /** Another contract for the client starts on or after this one ends. */
    hasRenewal: boolean;
    href: string;
};

export type FinanceSnapshot = {
    today: string;
    kpis: {
        arOpenMyr: number;
        arOpenCount: number;
        overdueMyr: number;
        overdueCount: number;
        dueSoonMyr: number;
        dueSoonCount: number;
        paid30Myr: number;
        paid30Count: number;
        draftsMyr: number;
        draftsCount: number;
        /** Every draft on file, not just the ones due inside the window. */
        draftsAll: number;
    };
    overdue: InvoiceRow[];
    dueSoon: InvoiceRow[];
    drafts: InvoiceRow[];
    toPrepare: ContractRow[];
    ending: ContractRow[];
    receipts: InvoiceRow[];
};

export type FinanceInput = {
    invoices: Invoice[];
    contracts: Contract[];
};

function invoiceOverdue(i: Invoice, today: string): boolean {
    return i.status === "overdue" || (i.status === "sent" && i.dueDate < today);
}

/** True when another live contract for the same client starts on or after this one ends (a renewal is on file). */
export function hasRenewalOnFile(c: Contract, contracts: Contract[]): boolean {
    return contracts.some(
        (x) =>
            x.id !== c.id &&
            x.clientName === c.clientName &&
            x.status !== "cancelled" &&
            x.status !== "completed" &&
            (!c.endDate || !x.startDate || x.startDate >= c.endDate || x.createdAt > c.updatedAt),
    );
}

export function buildFinanceSnapshot(input: FinanceInput, today: string = todayYmd()): FinanceSnapshot {
    const { invoices, contracts } = input;
    const byId = new Map(contracts.map((c) => [c.id, c]));
    const paidFrom = shiftYmd(today, -PAID_WINDOW_DAYS);
    const dueSoonUntil = shiftYmd(today, DUE_SOON_DAYS);
    const draftUntil = shiftYmd(today, DRAFT_WINDOW_DAYS);

    const toRow = (i: Invoice): InvoiceRow => {
        const c = i.contractId ? byId.get(i.contractId) : undefined;
        return {
            id: i.id,
            number: i.number,
            clientName: i.clientName,
            contractId: c?.id ?? null,
            contractCode: c?.code ?? "",
            status: i.status,
            issueDate: i.issueDate,
            dueDate: i.dueDate,
            daysLate: daysSince(i.dueDate, today),
            totalMyr: computeTotals(i).total,
            paidAt: i.paidAt ? i.paidAt.slice(0, 10) : "",
            href: `/invoices/${i.id}`,
        };
    };
    const sum = (rows: InvoiceRow[]) => +rows.reduce((s, r) => s + r.totalMyr, 0).toFixed(2);

    const live = invoices.filter((i) => i.status !== "void");
    const ar = live.filter((i) => i.status === "sent" || i.status === "overdue");
    const overdue = ar
        .filter((i) => invoiceOverdue(i, today))
        .map(toRow)
        .sort((a, b) => b.daysLate - a.daysLate || b.totalMyr - a.totalMyr);
    const dueSoon = ar
        .filter((i) => !invoiceOverdue(i, today) && i.dueDate <= dueSoonUntil)
        .map(toRow)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.totalMyr - a.totalMyr);
    const draftsAll = live.filter((i) => i.status === "draft");
    const drafts = draftsAll
        .filter((i) => i.dueDate <= draftUntil)
        .map(toRow)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.clientName.localeCompare(b.clientName));
    const receipts = live
        .filter((i) => i.status === "paid" && i.paidAt && i.paidAt.slice(0, 10) >= paidFrom)
        .map(toRow)
        .sort((a, b) => b.paidAt.localeCompare(a.paidAt) || b.totalMyr - a.totalMyr);

    const hasRenewal = (c: Contract) => hasRenewalOnFile(c, contracts);
    const toContract = (c: Contract, note: string): ContractRow => ({
        id: c.id,
        code: c.code,
        name: c.name,
        clientName: c.clientName,
        accountManager: c.accountManager,
        status: c.status,
        startDate: c.startDate,
        endDate: c.endDate,
        valueMyr: c.valueMyr,
        amountMyr: c.billing.amountMyr,
        cadence: c.billing.cadence,
        signed: Boolean(c.signedAt),
        note,
        endsInDays: endsInDays(c, today),
        hasRenewal: hasRenewal(c),
        href: c.status === "active" && !c.signedAt ? `/contracts/${c.id}?tab=setup` : `/contracts/${c.id}`,
    });

    const toPrepare: ContractRow[] = [];
    for (const c of contracts) {
        if (c.status === "active" && !c.signedAt) {
            const missing: string[] = ["signature"];
            if (!c.reference && !c.fileUrl) missing.push("reference / signed copy");
            if (!c.valueMyr) missing.push("value");
            toPrepare.push(toContract(c, `Active since ${c.startDate || "—"} · missing ${missing.join(", ")}`));
        } else if (c.status === "draft") {
            toPrepare.push(toContract(c, `Draft · ${c.signedAt ? "signed, not activated" : "not signed"}${c.startDate ? ` · starts ${c.startDate}` : ""}`));
        }
    }
    toPrepare.sort(
        (a, b) =>
            Number(b.status === "active") - Number(a.status === "active") ||
            (a.startDate || "9999").localeCompare(b.startDate || "9999") ||
            a.clientName.localeCompare(b.clientName),
    );

    const ending = contracts
        .filter((c) => {
            const d = endsInDays(c, today);
            return d !== null && d <= ENDING_WINDOW_DAYS;
        })
        .map((c) => {
            const d = endsInDays(c, today) ?? 0;
            return toContract(c, `Ends ${c.endDate} (in ${d}d) · ${hasRenewal(c) ? "renewal on file" : "no renewal yet"}`);
        })
        .sort((a, b) => Number(a.hasRenewal) - Number(b.hasRenewal) || (a.endsInDays ?? 0) - (b.endsInDays ?? 0));

    return {
        today,
        kpis: {
            arOpenMyr: +ar.reduce((s, i) => s + computeTotals(i).total, 0).toFixed(2),
            arOpenCount: ar.length,
            overdueMyr: sum(overdue),
            overdueCount: overdue.length,
            dueSoonMyr: sum(dueSoon),
            dueSoonCount: dueSoon.length,
            paid30Myr: sum(receipts),
            paid30Count: receipts.length,
            draftsMyr: sum(drafts),
            draftsCount: drafts.length,
            draftsAll: draftsAll.length,
        },
        overdue,
        dueSoon,
        drafts,
        toPrepare,
        ending,
        receipts,
    };
}

/** "due in 3d" / "due today" / "4d late". */
export function dueLabel(daysLate: number): string {
    if (daysLate > 0) return `${daysLate}d late`;
    if (daysLate === 0) return "due today";
    return `due in ${-daysLate}d`;
}
