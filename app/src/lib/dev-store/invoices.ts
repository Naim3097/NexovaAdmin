/**
 * DEV-ONLY local file store for invoices.
 * Replaced by Supabase `invoices` + `invoice_items` once provisioned.
 *
 * Multi-tenant-ready: clientName free-text now, swap to client_id later.
 * Currency fixed to MYR for now (matches `nexovadmin.md` decision).
 * Tax: simple flat percent (Malaysia SST 6% default, override per invoice).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = path.join(process.cwd(), ".dev-data");
const INVOICES_DIR = path.join(ROOT, "invoices");

export const INVOICE_STATUSES = [
    "draft",
    "sent",
    "paid",
    "overdue",
    "void",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export type InvoiceItem = {
    id: string;
    description: string;
    quantity: number;
    unitPriceMyr: number;
};

export type Invoice = {
    id: string;
    /** Human-readable, e.g. "INV-2026-0001". Generated at creation. */
    number: string;
    clientName: string;
    projectId: string | null;
    status: InvoiceStatus;
    issueDate: string; // YYYY-MM-DD
    dueDate: string; // YYYY-MM-DD
    items: InvoiceItem[];
    /** Tax rate in percent, e.g. 6 for 6% SST. */
    taxRatePct: number;
    notes: string;
    createdAt: string;
    updatedAt: string;
    paidAt: string | null;
    // Payment-link metadata (set when a payment link is generated)
    paymentProvider: string | null;
    paymentLink: string | null;
    paymentExternalId: string | null;
    paymentMeta: Record<string, unknown>;
    paymentLinkCreatedAt: string | null;
};

async function ensureDir() {
    await fs.mkdir(INVOICES_DIR, { recursive: true });
}

function fileFor(id: string) {
    return path.join(INVOICES_DIR, `${id}.json`);
}

export function computeTotals(invoice: Pick<Invoice, "items" | "taxRatePct">): {
    subtotal: number;
    tax: number;
    total: number;
} {
    const subtotal = invoice.items.reduce(
        (sum, it) => sum + (it.quantity || 0) * (it.unitPriceMyr || 0),
        0,
    );
    const tax = +(subtotal * ((invoice.taxRatePct || 0) / 100)).toFixed(2);
    const total = +(subtotal + tax).toFixed(2);
    return { subtotal: +subtotal.toFixed(2), tax, total };
}

async function nextInvoiceNumber(): Promise<string> {
    const all = await listInvoices();
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const usedThisYear = all
        .map((i) => i.number)
        .filter((n) => n.startsWith(prefix))
        .map((n) => Number.parseInt(n.slice(prefix.length), 10) || 0);
    const next = (usedThisYear.length ? Math.max(...usedThisYear) : 0) + 1;
    return `${prefix}${String(next).padStart(4, "0")}`;
}

export async function createInvoice(input: {
    clientName: string;
    projectId?: string | null;
    issueDate?: string;
    dueDate?: string;
    taxRatePct?: number;
}): Promise<Invoice> {
    await ensureDir();
    const now = new Date();
    const issue = input.issueDate || now.toISOString().slice(0, 10);
    const due =
        input.dueDate ||
        new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10);
    const inv: Invoice = {
        id: randomUUID(),
        number: await nextInvoiceNumber(),
        clientName: input.clientName,
        projectId: input.projectId ?? null,
        status: "draft",
        issueDate: issue,
        dueDate: due,
        items: [],
        taxRatePct: input.taxRatePct ?? 6,
        notes: "",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        paidAt: null,
        paymentProvider: null,
        paymentLink: null,
        paymentExternalId: null,
        paymentMeta: {},
        paymentLinkCreatedAt: null,
    };
    await fs.writeFile(fileFor(inv.id), JSON.stringify(inv, null, 2), "utf8");
    return inv;
}

export async function listInvoices(): Promise<Invoice[]> {
    await ensureDir();
    const entries = await fs.readdir(INVOICES_DIR);
    const out: Invoice[] = [];
    for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const raw = await fs.readFile(path.join(INVOICES_DIR, entry), "utf8");
        out.push(JSON.parse(raw) as Invoice);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getInvoiceById(id: string): Promise<Invoice | null> {
    try {
        const raw = await fs.readFile(fileFor(id), "utf8");
        return JSON.parse(raw) as Invoice;
    } catch {
        return null;
    }
}

export async function listInvoicesForProject(
    projectId: string,
): Promise<Invoice[]> {
    const all = await listInvoices();
    return all.filter((i) => i.projectId === projectId);
}

export async function updateInvoice(
    id: string,
    patch: Partial<Omit<Invoice, "id" | "number" | "createdAt">>,
): Promise<Invoice> {
    const existing = await getInvoiceById(id);
    if (!existing) throw new Error(`Invoice ${id} not found`);
    const updated: Invoice = {
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(fileFor(id), JSON.stringify(updated, null, 2), "utf8");
    return updated;
}

export async function setInvoiceStatus(
    id: string,
    status: InvoiceStatus,
): Promise<Invoice> {
    const patch: Partial<Invoice> = { status };
    if (status === "paid") patch.paidAt = new Date().toISOString();
    if (status !== "paid") patch.paidAt = null;
    return updateInvoice(id, patch);
}

export async function deleteInvoice(id: string): Promise<void> {
    try {
        await fs.unlink(fileFor(id));
    } catch {
        // ignore
    }
}

export async function addInvoiceItem(
    id: string,
    input: { description: string; quantity: number; unitPriceMyr: number },
): Promise<Invoice> {
    const existing = await getInvoiceById(id);
    if (!existing) throw new Error(`Invoice ${id} not found`);
    const item: InvoiceItem = {
        id: randomUUID(),
        description: input.description,
        quantity: input.quantity,
        unitPriceMyr: input.unitPriceMyr,
    };
    return updateInvoice(id, { items: [...existing.items, item] });
}

export async function deleteInvoiceItem(
    id: string,
    itemId: string,
): Promise<Invoice> {
    const existing = await getInvoiceById(id);
    if (!existing) throw new Error(`Invoice ${id} not found`);
    return updateInvoice(id, {
        items: existing.items.filter((it) => it.id !== itemId),
    });
}
