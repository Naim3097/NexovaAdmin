/**
 * Invoices data adapter.
 *
 * Five primitives dispatch via `isSupabaseEnabled("invoices")`. The dev-store treats
 * `items` as part of the invoice JSON; the Supabase backend stores them in a
 * child table `invoice_items` with cascade delete. This adapter hides that:
 *
 * - Reads: fetch invoice(s) + items, join in memory by `invoice_id`,
 *   order items by `sort_order`.
 * - Writes that include `items`: replace-all (delete by invoice_id, then bulk
 *   insert) so callers don't have to do diffing.
 *
 * `computeTotals` is a pure helper — re-export from dev-store unchanged.
 */
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import type {
    Database,
    InvoiceRow,
    InvoiceItemRow,
} from "@/lib/supabase/types";
import { isSupabaseEnabled } from "@/lib/data/flag";
import * as devInvoices from "@/lib/dev-store/invoices";

export { INVOICE_STATUSES, computeTotals } from "@/lib/dev-store/invoices";
export type { Invoice, InvoiceItem, InvoiceStatus } from "@/lib/dev-store/invoices";

type Invoice = devInvoices.Invoice;
type InvoiceItem = devInvoices.InvoiceItem;
type InvoiceStatus = devInvoices.InvoiceStatus;
type UpdatePatch = Partial<Omit<Invoice, "id" | "number" | "createdAt">>;

type InvoiceInsert = Database["public"]["Tables"]["invoices"]["Insert"];
type InvoiceUpdate = Database["public"]["Tables"]["invoices"]["Update"];
type InvoiceItemInsert = Database["public"]["Tables"]["invoice_items"]["Insert"];

const TABLE = "invoices" as const;
const ITEMS_TABLE = "invoice_items" as const;

function rowToItem(row: InvoiceItemRow): InvoiceItem {
    return {
        id: row.id,
        description: row.description,
        quantity: Number(row.quantity),
        unitPriceMyr: Number(row.unit_price_myr),
    };
}

function itemToInsert(
    item: InvoiceItem,
    invoiceId: string,
    sortOrder: number,
): InvoiceItemInsert {
    return {
        id: item.id || randomUUID(),
        invoice_id: invoiceId,
        description: item.description,
        quantity: item.quantity,
        unit_price_myr: item.unitPriceMyr,
        sort_order: sortOrder,
    };
}

function rowToInvoice(row: InvoiceRow, items: InvoiceItemRow[]): Invoice {
    return {
        id: row.id,
        number: row.number,
        clientName: row.client_name,
        projectId: row.project_id,
        status: row.status as InvoiceStatus,
        issueDate: row.issue_date,
        dueDate: row.due_date,
        items: items
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(rowToItem),
        taxRatePct: Number(row.tax_rate_pct),
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        paidAt: row.paid_at,
        paymentProvider: row.payment_provider ?? null,
        paymentLink: row.payment_link ?? null,
        paymentExternalId: row.payment_external_id ?? null,
        paymentMeta: row.payment_meta ?? {},
        paymentLinkCreatedAt: row.payment_link_created_at ?? null,
    };
}

function invoiceToInsert(inv: Invoice): InvoiceInsert {
    return {
        id: inv.id,
        number: inv.number,
        client_name: inv.clientName,
        project_id: inv.projectId,
        status: inv.status,
        issue_date: inv.issueDate,
        due_date: inv.dueDate,
        tax_rate_pct: inv.taxRatePct,
        notes: inv.notes,
        created_at: inv.createdAt,
        updated_at: inv.updatedAt,
        paid_at: inv.paidAt,
        payment_provider: inv.paymentProvider,
        payment_link: inv.paymentLink,
        payment_external_id: inv.paymentExternalId,
        payment_meta: inv.paymentMeta,
        payment_link_created_at: inv.paymentLinkCreatedAt,
    };
}

function patchToUpdate(patch: UpdatePatch): InvoiceUpdate {
    const out: InvoiceUpdate = {};
    if (patch.clientName !== undefined) out.client_name = patch.clientName;
    if (patch.projectId !== undefined) out.project_id = patch.projectId;
    if (patch.status !== undefined) out.status = patch.status;
    if (patch.issueDate !== undefined) out.issue_date = patch.issueDate;
    if (patch.dueDate !== undefined) out.due_date = patch.dueDate;
    if (patch.taxRatePct !== undefined) out.tax_rate_pct = patch.taxRatePct;
    if (patch.notes !== undefined) out.notes = patch.notes;
    if (patch.paidAt !== undefined) out.paid_at = patch.paidAt;
    if (patch.updatedAt !== undefined) out.updated_at = patch.updatedAt;
    if (patch.paymentProvider !== undefined) out.payment_provider = patch.paymentProvider;
    if (patch.paymentLink !== undefined) out.payment_link = patch.paymentLink;
    if (patch.paymentExternalId !== undefined) out.payment_external_id = patch.paymentExternalId;
    if (patch.paymentMeta !== undefined) out.payment_meta = patch.paymentMeta;
    if (patch.paymentLinkCreatedAt !== undefined) out.payment_link_created_at = patch.paymentLinkCreatedAt;
    return out;
}

async function nextInvoiceNumber(): Promise<string> {
    // Server-side scan for max number this year. With small volume (<5k/yr)
    // a full select is fine and avoids races more reliably than a sequence
    // (the dev-store already does a full scan).
    const sb = createServiceClient();
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const { data, error } = await sb
        .from(TABLE)
        .select("number")
        .like("number", `${prefix}%`);
    if (error) throw new Error(`nextInvoiceNumber: ${error.message}`);
    const used = (data ?? []).map(
        (r) => Number.parseInt(r.number.slice(prefix.length), 10) || 0,
    );
    const next = (used.length ? Math.max(...used) : 0) + 1;
    return `${prefix}${String(next).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Core CRUD primitives
// ---------------------------------------------------------------------------

export async function createInvoice(input: {
    clientName: string;
    projectId?: string | null;
    issueDate?: string;
    dueDate?: string;
    taxRatePct?: number;
}): Promise<Invoice> {
    if (!isSupabaseEnabled("invoices")) return devInvoices.createInvoice(input);

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
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .insert(invoiceToInsert(inv))
        .select("*")
        .single();
    if (error) throw new Error(`createInvoice: ${error.message}`);
    return rowToInvoice(data as InvoiceRow, []);
}

export async function listInvoices(): Promise<Invoice[]> {
    if (!isSupabaseEnabled("invoices")) return devInvoices.listInvoices();
    const sb = createServiceClient();
    const [{ data: invs, error: ie }, { data: items, error: itemsErr }] =
        await Promise.all([
            sb.from(TABLE).select("*").order("created_at", { ascending: false }),
            sb.from(ITEMS_TABLE).select("*"),
        ]);
    if (ie) throw new Error(`listInvoices: ${ie.message}`);
    if (itemsErr) throw new Error(`listInvoices(items): ${itemsErr.message}`);
    const byInvoice = new Map<string, InvoiceItemRow[]>();
    for (const it of (items ?? []) as InvoiceItemRow[]) {
        const arr = byInvoice.get(it.invoice_id) ?? [];
        arr.push(it);
        byInvoice.set(it.invoice_id, arr);
    }
    return (invs as InvoiceRow[]).map((row) =>
        rowToInvoice(row, byInvoice.get(row.id) ?? []),
    );
}

export async function getInvoiceById(id: string): Promise<Invoice | null> {
    if (!isSupabaseEnabled("invoices")) return devInvoices.getInvoiceById(id);
    const sb = createServiceClient();
    const { data: row, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("id", id)
        .maybeSingle();
    if (error) throw new Error(`getInvoiceById: ${error.message}`);
    if (!row) return null;
    const { data: items, error: itemsErr } = await sb
        .from(ITEMS_TABLE)
        .select("*")
        .eq("invoice_id", id);
    if (itemsErr) throw new Error(`getInvoiceById(items): ${itemsErr.message}`);
    return rowToInvoice(row as InvoiceRow, (items ?? []) as InvoiceItemRow[]);
}

export async function listInvoicesForProject(
    projectId: string,
): Promise<Invoice[]> {
    if (!isSupabaseEnabled("invoices")) {
        return devInvoices.listInvoicesForProject(projectId);
    }
    const all = await listInvoices();
    return all.filter((i) => i.projectId === projectId);
}

export async function updateInvoice(
    id: string,
    patch: UpdatePatch,
): Promise<Invoice> {
    if (!isSupabaseEnabled("invoices")) return devInvoices.updateInvoice(id, patch);
    const sb = createServiceClient();
    const { error } = await sb
        .from(TABLE)
        .update(patchToUpdate(patch))
        .eq("id", id);
    if (error) throw new Error(`updateInvoice: ${error.message}`);

    // If items present in patch, replace-all the child rows.
    if (patch.items !== undefined) {
        const { error: delErr } = await sb
            .from(ITEMS_TABLE)
            .delete()
            .eq("invoice_id", id);
        if (delErr) throw new Error(`updateInvoice(del items): ${delErr.message}`);
        if (patch.items.length > 0) {
            const inserts = patch.items.map((it, idx) =>
                itemToInsert(it, id, idx),
            );
            const { error: insErr } = await sb
                .from(ITEMS_TABLE)
                .insert(inserts);
            if (insErr)
                throw new Error(`updateInvoice(ins items): ${insErr.message}`);
        }
    }

    const next = await getInvoiceById(id);
    if (!next) throw new Error(`updateInvoice: ${id} disappeared`);
    return next;
}

export async function setInvoiceStatus(
    id: string,
    status: InvoiceStatus,
): Promise<Invoice> {
    const patch: UpdatePatch = { status };
    if (status === "paid") patch.paidAt = new Date().toISOString();
    else patch.paidAt = null;
    return updateInvoice(id, patch);
}

export async function deleteInvoice(id: string): Promise<void> {
    if (!isSupabaseEnabled("invoices")) return devInvoices.deleteInvoice(id);
    const sb = createServiceClient();
    // invoice_items has ON DELETE CASCADE.
    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`deleteInvoice: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Item helpers — implemented locally, compose dispatched primitives.
// ---------------------------------------------------------------------------

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
