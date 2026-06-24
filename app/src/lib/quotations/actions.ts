"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
    addQuotationItem,
    computeTotals,
    createQuotation,
    deleteQuotation,
    deleteQuotationItem,
    getQuotationById,
    QUOTATION_STATUSES,
    setQuotationStatus,
    updateQuotation,
    type QuotationStatus,
} from "@/lib/data/quotations";
import {
    createInvoice,
    updateInvoice,
    getInvoiceById,
} from "@/lib/data/invoices";
import { getAgencyProfile } from "@/lib/data/agency";
import { notify } from "@/lib/data/notifications";
import { diffFields, recordAudit } from "@/lib/data/audit";

function asStatus(v: FormDataEntryValue | null): QuotationStatus {
    const s = String(v ?? "");
    return (QUOTATION_STATUSES as readonly string[]).includes(s)
        ? (s as QuotationStatus)
        : "draft";
}

function nullableId(v: FormDataEntryValue | null): string | null {
    const s = String(v ?? "").trim();
    return s.length > 0 && s !== "none" ? s : null;
}

export async function createQuotationAction(formData: FormData) {
    const clientName = String(formData.get("clientName") ?? "").trim();
    if (!clientName) return;
    const projectId = nullableId(formData.get("projectId"));
    const issueDate = String(formData.get("issueDate") ?? "").trim() || undefined;
    const validUntil =
        String(formData.get("validUntil") ?? "").trim() || undefined;
    const taxRatePctRaw = formData.get("taxRatePct");
    const taxRatePct =
        taxRatePctRaw === null || taxRatePctRaw === ""
            ? 6
            : Number(taxRatePctRaw);
    // Pre-fill T&C + acceptance toggle from the agency defaults (still editable).
    const agency = await getAgencyProfile();
    const quote = await createQuotation({
        clientName,
        projectId,
        issueDate,
        validUntil,
        taxRatePct: Number.isFinite(taxRatePct) ? taxRatePct : 6,
        terms: agency.defaultQuoteTerms,
        showAcceptance: agency.defaultQuoteAcceptance,
    });
    revalidatePath("/quotes");
    revalidatePath("/dashboard");
    if (projectId) revalidatePath(`/projects/${projectId}`);
    redirect(`/quotes/${quote.id}`);
}

export async function updateQuotationAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const taxRatePct = Number(formData.get("taxRatePct") ?? 0);
    const before = await getQuotationById(id);
    await updateQuotation(id, {
        clientName: String(formData.get("clientName") ?? "").trim(),
        projectId: nullableId(formData.get("projectId")),
        issueDate: String(formData.get("issueDate") ?? "").trim(),
        validUntil: String(formData.get("validUntil") ?? "").trim(),
        taxRatePct: Number.isFinite(taxRatePct) ? taxRatePct : 0,
        notes: String(formData.get("notes") ?? "").trim(),
        billToAddress: String(formData.get("billToAddress") ?? "").trim(),
        paymentDetails: String(formData.get("paymentDetails") ?? "").trim(),
        logoChoice: String(formData.get("logoChoice") ?? "").trim(),
        subject: String(formData.get("subject") ?? "").trim(),
        scopeIncludes: String(formData.get("scopeIncludes") ?? "").trim(),
        exclusions: String(formData.get("exclusions") ?? "").trim(),
        terms: String(formData.get("terms") ?? "").trim(),
        showAcceptance: String(formData.get("showAcceptance") ?? "") === "on",
    });
    if (before) {
        const after = (await getQuotationById(id)) ?? before;
        const changes = diffFields(
            before as unknown as Record<string, unknown>,
            after as unknown as Record<string, unknown>,
            ["clientName", "projectId", "issueDate", "validUntil", "taxRatePct", "notes"],
        );
        if (changes.length > 0) {
            await recordAudit({
                entity: "quotation",
                entityId: id,
                kind: "update",
                summary: `Quotation updated (${changes.length} field${changes.length === 1 ? "" : "s"})`,
                changes,
            });
        }
    }
    revalidatePath(`/quotes/${id}`);
    revalidatePath("/quotes");
    revalidatePath("/dashboard");
}

export async function setQuotationStatusAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const status = asStatus(formData.get("status"));
    const before = await getQuotationById(id);
    // A converted quote is locked — only the convert action sets that status.
    if (before?.status === "converted" || status === "converted") return;
    await setQuotationStatus(id, status);
    if (before && before.status !== status) {
        await recordAudit({
            entity: "quotation",
            entityId: id,
            kind: "status",
            summary: `Status: ${before.status} → ${status}`,
            changes: [{ field: "status", before: before.status, after: status }],
        });
        const totals = computeTotals(before);
        if (status === "sent" && before.status === "draft") {
            await notify({
                kind: "quote_sent",
                title: `Quotation sent: ${before.number}`,
                body: `${before.clientName} · MYR ${totals.total.toFixed(2)}`,
                link: `/quotes/${id}`,
            });
        } else if (status === "accepted") {
            await notify({
                kind: "quote_accepted",
                title: `Quotation accepted: ${before.number}`,
                body: `${before.clientName} · MYR ${totals.total.toFixed(2)}`,
                link: `/quotes/${id}`,
            });
        }
    }
    revalidatePath(`/quotes/${id}`);
    revalidatePath("/quotes");
    revalidatePath("/dashboard");
}

export async function deleteQuotationAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await deleteQuotation(id);
    revalidatePath("/quotes");
    revalidatePath("/dashboard");
    redirect("/quotes");
}

export async function addQuotationItemAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const description = String(formData.get("description") ?? "").trim();
    const details = String(formData.get("details") ?? "").trim();
    const quantity = Number(formData.get("quantity") ?? 1) || 1;
    const unitPriceMyr = Number(formData.get("unitPriceMyr") ?? 0) || 0;
    if (!id || !description) return;
    await addQuotationItem(id, { description, details, quantity, unitPriceMyr });
    revalidatePath(`/quotes/${id}`);
    revalidatePath("/quotes");
    revalidatePath("/dashboard");
}

export async function deleteQuotationItemAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const itemId = String(formData.get("itemId") ?? "");
    if (!id || !itemId) return;
    await deleteQuotationItem(id, itemId);
    revalidatePath(`/quotes/${id}`);
    revalidatePath("/quotes");
    revalidatePath("/dashboard");
}

/**
 * Convert a quotation into a draft invoice — the QuickBooks "Estimate → Invoice"
 * move. Copies client, project, tax rate, notes, and every line item into a new
 * invoice; marks the quote `converted` and links it via `convertedInvoiceId`
 * (one-way). Idempotent-ish: if the quote is already converted and the linked
 * invoice still exists, we just redirect to it rather than creating a duplicate.
 */
export async function convertQuotationToInvoiceAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const quote = await getQuotationById(id);
    if (!quote) return;

    // Already converted and the invoice still exists → go there, don't dupe.
    if (quote.convertedInvoiceId) {
        const existingInv = await getInvoiceById(quote.convertedInvoiceId);
        if (existingInv) redirect(`/invoices/${existingInv.id}`);
    }

    const invoice = await createInvoice({
        clientName: quote.clientName,
        projectId: quote.projectId,
        taxRatePct: quote.taxRatePct,
    });
    // Copy line items + notes onto the fresh invoice in one replace-all write.
    await updateInvoice(invoice.id, {
        items: quote.items.map((it) => ({
            id: "", // new id minted by the adapter
            description: it.description,
            details: it.details,
            quantity: it.quantity,
            unitPriceMyr: it.unitPriceMyr,
        })),
        notes: quote.notes
            ? `${quote.notes}\n\n(From quotation ${quote.number})`
            : `From quotation ${quote.number}`,
        // Carry the per-document overrides onto the new invoice.
        billToAddress: quote.billToAddress,
        paymentDetails: quote.paymentDetails,
        logoChoice: quote.logoChoice,
    });

    await updateQuotation(id, {
        status: "converted",
        convertedInvoiceId: invoice.id,
        acceptedAt: quote.acceptedAt ?? new Date().toISOString(),
    });

    await recordAudit({
        entity: "quotation",
        entityId: id,
        kind: "status",
        summary: `Converted to invoice ${invoice.number}`,
        changes: [{ field: "status", before: quote.status, after: "converted" }],
    });
    await recordAudit({
        entity: "invoice",
        entityId: invoice.id,
        kind: "create",
        summary: `Created from quotation ${quote.number}`,
    });
    await notify({
        kind: "invoice_issued",
        title: `Invoice drafted from quote: ${invoice.number}`,
        body: `${quote.clientName} · from ${quote.number}`,
        link: `/invoices/${invoice.id}`,
    });

    revalidatePath(`/quotes/${id}`);
    revalidatePath("/quotes");
    revalidatePath("/invoices");
    revalidatePath("/dashboard");
    redirect(`/invoices/${invoice.id}`);
}
