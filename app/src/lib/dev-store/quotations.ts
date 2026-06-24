/**
 * DEV-ONLY local file store for quotations.
 * Replaced by Supabase `quotations` + `quotation_items` once provisioned.
 *
 * Mirrors the invoice dev-store. Currency fixed to MYR; tax is a flat percent
 * (Malaysia SST 6% default, override per quote). A quote is the pre-sale half of
 * the flow — once accepted it can be converted into an invoice (see
 * `lib/quotations/actions.ts`), which stamps `convertedInvoiceId`.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = path.join(process.cwd(), ".dev-data");
const QUOTATIONS_DIR = path.join(ROOT, "quotations");

export const QUOTATION_STATUSES = [
    "draft",
    "sent",
    "accepted",
    "declined",
    "expired",
    "converted",
] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export type QuotationItem = {
    id: string;
    description: string;
    /** Optional sub-points, one bullet per line. Rendered under the description. */
    details: string;
    quantity: number;
    unitPriceMyr: number;
};

export type Quotation = {
    id: string;
    /** Human-readable, e.g. "QUO-2026-0001". Generated at creation. */
    number: string;
    clientName: string;
    projectId: string | null;
    status: QuotationStatus;
    issueDate: string; // YYYY-MM-DD
    validUntil: string; // YYYY-MM-DD
    items: QuotationItem[];
    /** Tax rate in percent, e.g. 6 for 6% SST. */
    taxRatePct: number;
    notes: string;
    /** Per-quote "Prepared for" address (under the client name). Empty = none. */
    billToAddress: string;
    /** Free-text payment/terms block; when set, overrides agency bank details. */
    paymentDetails: string;
    /** Logo: "" = agency default · "none" = hide · else a logo id. */
    logoChoice: string;
    /** Document subject/title, e.g. "Website Enhancement & Backend Optimization". */
    subject: string;
    /** "Scope includes" bullets (one per line). */
    scopeIncludes: string;
    /** "Exclusions" bullets (one per line). */
    exclusions: string;
    /** "Terms & Conditions" bullets (one per line). */
    terms: string;
    /** Whether to print the acceptance / signature block. */
    showAcceptance: boolean;
    /** Set once when converted into an invoice. */
    convertedInvoiceId: string | null;
    createdAt: string;
    updatedAt: string;
    acceptedAt: string | null;
};

async function ensureDir() {
    await fs.mkdir(QUOTATIONS_DIR, { recursive: true });
}

function fileFor(id: string) {
    return path.join(QUOTATIONS_DIR, `${id}.json`);
}

export function computeTotals(
    quote: Pick<Quotation, "items" | "taxRatePct">,
): { subtotal: number; tax: number; total: number } {
    const subtotal = quote.items.reduce(
        (sum, it) => sum + (it.quantity || 0) * (it.unitPriceMyr || 0),
        0,
    );
    const tax = +(subtotal * ((quote.taxRatePct || 0) / 100)).toFixed(2);
    const total = +(subtotal + tax).toFixed(2);
    return { subtotal: +subtotal.toFixed(2), tax, total };
}

async function nextQuotationNumber(): Promise<string> {
    const all = await listQuotations();
    const year = new Date().getFullYear();
    const prefix = `QUO-${year}-`;
    const usedThisYear = all
        .map((q) => q.number)
        .filter((n) => n.startsWith(prefix))
        .map((n) => Number.parseInt(n.slice(prefix.length), 10) || 0);
    const next = (usedThisYear.length ? Math.max(...usedThisYear) : 0) + 1;
    return `${prefix}${String(next).padStart(4, "0")}`;
}

export async function createQuotation(input: {
    clientName: string;
    projectId?: string | null;
    issueDate?: string;
    validUntil?: string;
    taxRatePct?: number;
    terms?: string;
    showAcceptance?: boolean;
}): Promise<Quotation> {
    await ensureDir();
    const now = new Date();
    const issue = input.issueDate || now.toISOString().slice(0, 10);
    // Quotes default to a 30-day validity window.
    const valid =
        input.validUntil ||
        new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10);
    const quote: Quotation = {
        id: randomUUID(),
        number: await nextQuotationNumber(),
        clientName: input.clientName,
        projectId: input.projectId ?? null,
        status: "draft",
        issueDate: issue,
        validUntil: valid,
        items: [],
        taxRatePct: input.taxRatePct ?? 6,
        notes: "",
        billToAddress: "",
        paymentDetails: "",
        logoChoice: "",
        subject: "",
        scopeIncludes: "",
        exclusions: "",
        terms: input.terms ?? "",
        showAcceptance: input.showAcceptance ?? true,
        convertedInvoiceId: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        acceptedAt: null,
    };
    await fs.writeFile(fileFor(quote.id), JSON.stringify(quote, null, 2), "utf8");
    return quote;
}

export async function listQuotations(): Promise<Quotation[]> {
    await ensureDir();
    const entries = await fs.readdir(QUOTATIONS_DIR);
    const out: Quotation[] = [];
    for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const raw = await fs.readFile(path.join(QUOTATIONS_DIR, entry), "utf8");
        out.push(JSON.parse(raw) as Quotation);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getQuotationById(id: string): Promise<Quotation | null> {
    try {
        const raw = await fs.readFile(fileFor(id), "utf8");
        return JSON.parse(raw) as Quotation;
    } catch {
        return null;
    }
}

export async function listQuotationsForProject(
    projectId: string,
): Promise<Quotation[]> {
    const all = await listQuotations();
    return all.filter((q) => q.projectId === projectId);
}

export async function updateQuotation(
    id: string,
    patch: Partial<Omit<Quotation, "id" | "number" | "createdAt">>,
): Promise<Quotation> {
    const existing = await getQuotationById(id);
    if (!existing) throw new Error(`Quotation ${id} not found`);
    const updated: Quotation = {
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(fileFor(id), JSON.stringify(updated, null, 2), "utf8");
    return updated;
}

export async function setQuotationStatus(
    id: string,
    status: QuotationStatus,
): Promise<Quotation> {
    const patch: Partial<Quotation> = { status };
    if (status === "accepted") patch.acceptedAt = new Date().toISOString();
    if (status !== "accepted" && status !== "converted") patch.acceptedAt = null;
    return updateQuotation(id, patch);
}

export async function deleteQuotation(id: string): Promise<void> {
    try {
        await fs.unlink(fileFor(id));
    } catch {
        // ignore
    }
}

export async function addQuotationItem(
    id: string,
    input: {
        description: string;
        details?: string;
        quantity: number;
        unitPriceMyr: number;
    },
): Promise<Quotation> {
    const existing = await getQuotationById(id);
    if (!existing) throw new Error(`Quotation ${id} not found`);
    const item: QuotationItem = {
        id: randomUUID(),
        description: input.description,
        details: input.details ?? "",
        quantity: input.quantity,
        unitPriceMyr: input.unitPriceMyr,
    };
    return updateQuotation(id, { items: [...existing.items, item] });
}

export async function deleteQuotationItem(
    id: string,
    itemId: string,
): Promise<Quotation> {
    const existing = await getQuotationById(id);
    if (!existing) throw new Error(`Quotation ${id} not found`);
    return updateQuotation(id, {
        items: existing.items.filter((it) => it.id !== itemId),
    });
}
