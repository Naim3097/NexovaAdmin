/**
 * Quotations data adapter.
 *
 * Mirrors `lib/data/invoices.ts`: primitives dispatch via
 * `isSupabaseEnabled("quotations")`. The dev-store treats `items` as part of the
 * quotation JSON; the Supabase backend stores them in a child table
 * `quotation_items` with cascade delete. This adapter hides that:
 *
 * - Reads: fetch quotation(s) + items, join in memory by `quotation_id`,
 *   order items by `sort_order`.
 * - Writes that include `items`: replace-all (delete by quotation_id, then bulk
 *   insert).
 *
 * `computeTotals` is a pure helper — re-export from dev-store unchanged.
 */
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import type {
    Database,
    QuotationRow,
    QuotationItemRow,
} from "@/lib/supabase/types";
import { isSupabaseEnabled } from "@/lib/data/flag";
import * as devQuotations from "@/lib/dev-store/quotations";

export { QUOTATION_STATUSES, computeTotals } from "@/lib/dev-store/quotations";
export type {
    Quotation,
    QuotationItem,
    QuotationStatus,
} from "@/lib/dev-store/quotations";

type Quotation = devQuotations.Quotation;
type QuotationItem = devQuotations.QuotationItem;
type QuotationStatus = devQuotations.QuotationStatus;
type UpdatePatch = Partial<Omit<Quotation, "id" | "number" | "createdAt">>;

type QuotationInsert = Database["public"]["Tables"]["quotations"]["Insert"];
type QuotationUpdate = Database["public"]["Tables"]["quotations"]["Update"];
type QuotationItemInsert =
    Database["public"]["Tables"]["quotation_items"]["Insert"];

const TABLE = "quotations" as const;
const ITEMS_TABLE = "quotation_items" as const;

function rowToItem(row: QuotationItemRow): QuotationItem {
    return {
        id: row.id,
        description: row.description,
        details: row.details ?? "",
        quantity: Number(row.quantity),
        unitPriceMyr: Number(row.unit_price_myr),
    };
}

function itemToInsert(
    item: QuotationItem,
    quotationId: string,
    sortOrder: number,
): QuotationItemInsert {
    return {
        id: item.id || randomUUID(),
        quotation_id: quotationId,
        description: item.description,
        details: item.details ?? "",
        quantity: item.quantity,
        unit_price_myr: item.unitPriceMyr,
        sort_order: sortOrder,
    };
}

function rowToQuotation(row: QuotationRow, items: QuotationItemRow[]): Quotation {
    return {
        id: row.id,
        number: row.number,
        clientName: row.client_name,
        projectId: row.project_id,
        status: row.status as QuotationStatus,
        issueDate: row.issue_date,
        validUntil: row.valid_until,
        items: items
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(rowToItem),
        taxRatePct: Number(row.tax_rate_pct),
        notes: row.notes,
        billToAddress: row.bill_to_address ?? "",
        paymentDetails: row.payment_details ?? "",
        logoChoice: row.logo_choice ?? "",
        subject: row.subject ?? "",
        scopeIncludes: row.scope_includes ?? "",
        exclusions: row.exclusions ?? "",
        terms: row.terms ?? "",
        showAcceptance: row.show_acceptance ?? true,
        convertedInvoiceId: row.converted_invoice_id ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        acceptedAt: row.accepted_at,
    };
}

function quotationToInsert(q: Quotation): QuotationInsert {
    return {
        id: q.id,
        number: q.number,
        client_name: q.clientName,
        project_id: q.projectId,
        status: q.status,
        issue_date: q.issueDate,
        valid_until: q.validUntil,
        tax_rate_pct: q.taxRatePct,
        notes: q.notes,
        bill_to_address: q.billToAddress,
        payment_details: q.paymentDetails,
        logo_choice: q.logoChoice,
        subject: q.subject,
        scope_includes: q.scopeIncludes,
        exclusions: q.exclusions,
        terms: q.terms,
        show_acceptance: q.showAcceptance,
        converted_invoice_id: q.convertedInvoiceId,
        created_at: q.createdAt,
        updated_at: q.updatedAt,
        accepted_at: q.acceptedAt,
    };
}

function patchToUpdate(patch: UpdatePatch): QuotationUpdate {
    const out: QuotationUpdate = {};
    if (patch.clientName !== undefined) out.client_name = patch.clientName;
    if (patch.projectId !== undefined) out.project_id = patch.projectId;
    if (patch.status !== undefined) out.status = patch.status;
    if (patch.issueDate !== undefined) out.issue_date = patch.issueDate;
    if (patch.validUntil !== undefined) out.valid_until = patch.validUntil;
    if (patch.taxRatePct !== undefined) out.tax_rate_pct = patch.taxRatePct;
    if (patch.notes !== undefined) out.notes = patch.notes;
    if (patch.billToAddress !== undefined) out.bill_to_address = patch.billToAddress;
    if (patch.paymentDetails !== undefined) out.payment_details = patch.paymentDetails;
    if (patch.logoChoice !== undefined) out.logo_choice = patch.logoChoice;
    if (patch.subject !== undefined) out.subject = patch.subject;
    if (patch.scopeIncludes !== undefined) out.scope_includes = patch.scopeIncludes;
    if (patch.exclusions !== undefined) out.exclusions = patch.exclusions;
    if (patch.terms !== undefined) out.terms = patch.terms;
    if (patch.showAcceptance !== undefined) out.show_acceptance = patch.showAcceptance;
    if (patch.convertedInvoiceId !== undefined)
        out.converted_invoice_id = patch.convertedInvoiceId;
    if (patch.acceptedAt !== undefined) out.accepted_at = patch.acceptedAt;
    if (patch.updatedAt !== undefined) out.updated_at = patch.updatedAt;
    return out;
}

async function nextQuotationNumber(): Promise<string> {
    // Server-side scan for max number this year (matches invoices).
    const sb = createServiceClient();
    const year = new Date().getFullYear();
    const prefix = `QUO-${year}-`;
    const { data, error } = await sb
        .from(TABLE)
        .select("number")
        .like("number", `${prefix}%`);
    if (error) throw new Error(`nextQuotationNumber: ${error.message}`);
    const used = (data ?? []).map(
        (r) => Number.parseInt(r.number.slice(prefix.length), 10) || 0,
    );
    const next = (used.length ? Math.max(...used) : 0) + 1;
    return `${prefix}${String(next).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Core CRUD primitives
// ---------------------------------------------------------------------------

export async function createQuotation(input: {
    clientName: string;
    projectId?: string | null;
    issueDate?: string;
    validUntil?: string;
    taxRatePct?: number;
    terms?: string;
    showAcceptance?: boolean;
}): Promise<Quotation> {
    if (!isSupabaseEnabled("quotations")) {
        return devQuotations.createQuotation(input);
    }

    const now = new Date();
    const issue = input.issueDate || now.toISOString().slice(0, 10);
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
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .insert(quotationToInsert(quote))
        .select("*")
        .single();
    if (error) throw new Error(`createQuotation: ${error.message}`);
    return rowToQuotation(data as QuotationRow, []);
}

export async function listQuotations(): Promise<Quotation[]> {
    if (!isSupabaseEnabled("quotations")) return devQuotations.listQuotations();
    const sb = createServiceClient();
    const [{ data: quotes, error: qe }, { data: items, error: itemsErr }] =
        await Promise.all([
            sb.from(TABLE).select("*").order("created_at", { ascending: false }),
            sb.from(ITEMS_TABLE).select("*"),
        ]);
    if (qe) throw new Error(`listQuotations: ${qe.message}`);
    if (itemsErr) throw new Error(`listQuotations(items): ${itemsErr.message}`);
    const byQuotation = new Map<string, QuotationItemRow[]>();
    for (const it of (items ?? []) as QuotationItemRow[]) {
        const arr = byQuotation.get(it.quotation_id) ?? [];
        arr.push(it);
        byQuotation.set(it.quotation_id, arr);
    }
    return (quotes as QuotationRow[]).map((row) =>
        rowToQuotation(row, byQuotation.get(row.id) ?? []),
    );
}

export async function getQuotationById(id: string): Promise<Quotation | null> {
    if (!isSupabaseEnabled("quotations")) {
        return devQuotations.getQuotationById(id);
    }
    const sb = createServiceClient();
    const { data: row, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("id", id)
        .maybeSingle();
    if (error) throw new Error(`getQuotationById: ${error.message}`);
    if (!row) return null;
    const { data: items, error: itemsErr } = await sb
        .from(ITEMS_TABLE)
        .select("*")
        .eq("quotation_id", id);
    if (itemsErr) throw new Error(`getQuotationById(items): ${itemsErr.message}`);
    return rowToQuotation(row as QuotationRow, (items ?? []) as QuotationItemRow[]);
}

export async function listQuotationsForProject(
    projectId: string,
): Promise<Quotation[]> {
    if (!isSupabaseEnabled("quotations")) {
        return devQuotations.listQuotationsForProject(projectId);
    }
    const all = await listQuotations();
    return all.filter((q) => q.projectId === projectId);
}

export async function updateQuotation(
    id: string,
    patch: UpdatePatch,
): Promise<Quotation> {
    if (!isSupabaseEnabled("quotations")) {
        return devQuotations.updateQuotation(id, patch);
    }
    const sb = createServiceClient();
    const { error } = await sb
        .from(TABLE)
        .update(patchToUpdate(patch))
        .eq("id", id);
    if (error) throw new Error(`updateQuotation: ${error.message}`);

    // If items present in patch, replace-all the child rows.
    if (patch.items !== undefined) {
        const { error: delErr } = await sb
            .from(ITEMS_TABLE)
            .delete()
            .eq("quotation_id", id);
        if (delErr) throw new Error(`updateQuotation(del items): ${delErr.message}`);
        if (patch.items.length > 0) {
            const inserts = patch.items.map((it, idx) =>
                itemToInsert(it, id, idx),
            );
            const { error: insErr } = await sb.from(ITEMS_TABLE).insert(inserts);
            if (insErr)
                throw new Error(`updateQuotation(ins items): ${insErr.message}`);
        }
    }

    const next = await getQuotationById(id);
    if (!next) throw new Error(`updateQuotation: ${id} disappeared`);
    return next;
}

export async function setQuotationStatus(
    id: string,
    status: QuotationStatus,
): Promise<Quotation> {
    const patch: UpdatePatch = { status };
    if (status === "accepted") patch.acceptedAt = new Date().toISOString();
    else if (status !== "converted") patch.acceptedAt = null;
    return updateQuotation(id, patch);
}

export async function deleteQuotation(id: string): Promise<void> {
    if (!isSupabaseEnabled("quotations")) {
        return devQuotations.deleteQuotation(id);
    }
    const sb = createServiceClient();
    // quotation_items has ON DELETE CASCADE.
    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`deleteQuotation: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Item helpers — implemented locally, compose dispatched primitives.
// ---------------------------------------------------------------------------

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
