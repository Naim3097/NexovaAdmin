"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
    addInvoiceItem,
    createInvoice,
    deleteInvoice,
    deleteInvoiceItem,
    INVOICE_STATUSES,
    setInvoiceStatus,
    updateInvoice,
    type InvoiceStatus,
} from "@/lib/data/invoices";
import { computeTotals, getInvoiceById, listInvoices } from "@/lib/data/invoices";
import { billingAddressFor, listClients } from "@/lib/data/clients";
import { listContentPosts, visualsUsed } from "@/lib/data/content";
import { notify } from "@/lib/data/notifications";
import { diffFields, recordAudit } from "@/lib/data/audit";
import {
    paymentsCheckInvoiceStatus,
    paymentsCreateInvoiceLink,
} from "@/lib/agent/tools";

export type ActionResult = {
    ok: boolean;
    message?: string;
};

function asStatus(v: FormDataEntryValue | null): InvoiceStatus {
    const s = String(v ?? "");
    return (INVOICE_STATUSES as readonly string[]).includes(s)
        ? (s as InvoiceStatus)
        : "draft";
}

function nullableId(v: FormDataEntryValue | null): string | null {
    const s = String(v ?? "").trim();
    return s.length > 0 && s !== "none" ? s : null;
}

export async function createInvoiceAction(formData: FormData) {
    const clientName = String(formData.get("clientName") ?? "").trim();
    if (!clientName) return;
    const projectId = nullableId(formData.get("projectId"));
    const issueDate = String(formData.get("issueDate") ?? "").trim() || undefined;
    const dueDate = String(formData.get("dueDate") ?? "").trim() || undefined;
    const taxRatePctRaw = formData.get("taxRatePct");
    const taxRatePct =
        taxRatePctRaw === null || taxRatePctRaw === ""
            ? 6
            : Number(taxRatePctRaw);
    const inv = await createInvoice({
        clientName,
        projectId,
        issueDate,
        dueDate,
        taxRatePct: Number.isFinite(taxRatePct) ? taxRatePct : 6,
    });
    // Prefill "Bill to" from the client record (still editable per invoice).
    const billTo = await billingAddressFor(clientName);
    if (billTo) await updateInvoice(inv.id, { billToAddress: billTo });
    revalidatePath("/invoices");
    revalidatePath("/dashboard");
    if (projectId) revalidatePath(`/projects/${projectId}`);
    redirect(`/invoices/${inv.id}`);
}

export async function updateInvoiceAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const taxRatePct = Number(formData.get("taxRatePct") ?? 0);
    const before = await getInvoiceById(id);
    await updateInvoice(id, {
        clientName: String(formData.get("clientName") ?? "").trim(),
        projectId: nullableId(formData.get("projectId")),
        issueDate: String(formData.get("issueDate") ?? "").trim(),
        dueDate: String(formData.get("dueDate") ?? "").trim(),
        taxRatePct: Number.isFinite(taxRatePct) ? taxRatePct : 0,
        notes: String(formData.get("notes") ?? "").trim(),
        billToAddress: String(formData.get("billToAddress") ?? "").trim(),
        paymentDetails: String(formData.get("paymentDetails") ?? "").trim(),
        logoChoice: String(formData.get("logoChoice") ?? "").trim(),
    });
    if (before) {
        const after = (await getInvoiceById(id)) ?? before;
        const changes = diffFields(
            before as unknown as Record<string, unknown>,
            after as unknown as Record<string, unknown>,
            [
                "clientName",
                "projectId",
                "issueDate",
                "dueDate",
                "taxRatePct",
                "notes",
            ],
        );
        if (changes.length > 0) {
            await recordAudit({
                entity: "invoice",
                entityId: id,
                kind: "update",
                summary: `Invoice updated (${changes.length} field${changes.length === 1 ? "" : "s"})`,
                changes,
            });
        }
    }
    revalidatePath(`/invoices/${id}`);
    revalidatePath("/invoices");
    revalidatePath("/dashboard");
}

export async function setInvoiceStatusAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const status = asStatus(formData.get("status"));
    const before = await getInvoiceById(id);
    await setInvoiceStatus(id, status);
    if (before && before.status !== status) {
        await recordAudit({
            entity: "invoice",
            entityId: id,
            kind: "status",
            summary: `Status: ${before.status} → ${status}`,
            changes: [{ field: "status", before: before.status, after: status }],
        });
    }
    if (before && before.status !== status) {
        const totals = computeTotals(before);
        if (status === "paid") {
            await notify({
                kind: "invoice_paid",
                title: `Invoice paid: ${before.number}`,
                body: `${before.clientName} · MYR ${totals.total.toFixed(2)}`,
                link: `/invoices/${id}`,
            });
        } else if (status === "sent" && before.status === "draft") {
            await notify({
                kind: "invoice_issued",
                title: `Invoice sent: ${before.number}`,
                body: `${before.clientName} · MYR ${totals.total.toFixed(2)}`,
                link: `/invoices/${id}`,
            });
        } else if (status === "overdue") {
            await notify({
                kind: "invoice_overdue",
                title: `Invoice overdue: ${before.number}`,
                body: `${before.clientName} · MYR ${totals.total.toFixed(2)}`,
                link: `/invoices/${id}`,
            });
        }
    }
    revalidatePath(`/invoices/${id}`);
    revalidatePath("/invoices");
    revalidatePath("/dashboard");
}

export async function deleteInvoiceAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await deleteInvoice(id);
    revalidatePath("/invoices");
    revalidatePath("/dashboard");
    redirect("/invoices");
}

export async function addInvoiceItemAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const description = String(formData.get("description") ?? "").trim();
    const details = String(formData.get("details") ?? "").trim();
    const quantity = Number(formData.get("quantity") ?? 1) || 1;
    const unitPriceMyr = Number(formData.get("unitPriceMyr") ?? 0) || 0;
    if (!id || !description) return;
    await addInvoiceItem(id, { description, details, quantity, unitPriceMyr });
    revalidatePath(`/invoices/${id}`);
    revalidatePath("/invoices");
    revalidatePath("/dashboard");
}

export async function deleteInvoiceItemAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const itemId = String(formData.get("itemId") ?? "");
    if (!id || !itemId) return;
    await deleteInvoiceItem(id, itemId);
    revalidatePath(`/invoices/${id}`);
    revalidatePath("/invoices");
    revalidatePath("/dashboard");
}

// ---------- payments ----------

/**
 * Generate a LeanX payment link for the given invoice and stamp it onto the row.
 * Returns a result object so the UI can surface success/error inline.
 */
export async function generatePaymentLinkAction(
    _prev: ActionResult,
    formData: FormData,
): Promise<ActionResult> {
    const id = String(formData.get("id") ?? "");
    if (!id) return { ok: false, message: "Missing invoice id" };
    const customerEmail = String(formData.get("customerEmail") ?? "").trim();
    const customerPhone = String(formData.get("customerPhone") ?? "").trim();
    const customerName = String(formData.get("customerName") ?? "").trim();

    try {
        const result = await paymentsCreateInvoiceLink.invoke({
            invoiceId: id,
            customerEmail: customerEmail || undefined,
            customerPhone: customerPhone || undefined,
            customerName: customerName || undefined,
        });
        await recordAudit({
            entity: "invoice",
            entityId: id,
            kind: "update",
            summary: `Generated LeanX payment link (bill ${result.externalId})`,
            changes: [
                { field: "payment_external_id", before: "", after: result.externalId },
            ],
        });
        revalidatePath(`/invoices/${id}`);
        revalidatePath("/invoices");
        return { ok: true, message: `Link created: ${result.url}` };
    } catch (e) {
        return { ok: false, message: (e as Error).message };
    }
}

/**
 * Record a manually-received payment (bank transfer, cheque, cash, anything
 * non-LeanX). Stamps payment_method + reference + paid date onto the invoice
 * and flips status to "paid". Use this for big clients who TT directly, pay
 * by cheque, etc.
 */
export async function recordManualPaymentAction(
    _prev: ActionResult,
    formData: FormData,
): Promise<ActionResult> {
    const id = String(formData.get("id") ?? "");
    if (!id) return { ok: false, message: "Missing invoice id" };

    const method = String(formData.get("method") ?? "").trim();
    const reference = String(formData.get("reference") ?? "").trim();
    const paidDate = String(formData.get("paidDate") ?? "").trim();
    const amountRaw = String(formData.get("amount") ?? "").trim();
    const paymentNotes = String(formData.get("paymentNotes") ?? "").trim();

    if (!method) return { ok: false, message: "Pick a payment method" };

    const inv = await getInvoiceById(id);
    if (!inv) return { ok: false, message: "Invoice not found" };

    const paidAt = paidDate
        ? new Date(paidDate + "T00:00:00").toISOString()
        : new Date().toISOString();
    const amount = amountRaw ? Number(amountRaw) : computeTotals(inv).total;

    await updateInvoice(id, {
        status: "paid",
        paidAt,
        paymentMeta: {
            ...(inv.paymentMeta ?? {}),
            manual_payment: {
                method,
                reference: reference || null,
                amount,
                paid_at: paidAt,
                notes: paymentNotes || null,
                recorded_at: new Date().toISOString(),
            },
        },
    });

    await recordAudit({
        entity: "invoice",
        entityId: id,
        kind: "status",
        summary: `Marked paid manually (${method}${reference ? ` · ${reference}` : ""})`,
        changes: [
            { field: "status", before: inv.status, after: "paid" },
        ],
    });

    revalidatePath(`/invoices/${id}`);
    revalidatePath("/invoices");
    revalidatePath("/dashboard");

    return {
        ok: true,
        message: `Marked paid via ${method}${reference ? ` (ref ${reference})` : ""}`,
    };
}

/** Force a payment-status refresh from LeanX (no webhook required). */
export async function refreshPaymentStatusAction(
    _prev: ActionResult,
    formData: FormData,
): Promise<ActionResult> {
    const id = String(formData.get("id") ?? "");
    if (!id) return { ok: false, message: "Missing invoice id" };

    try {
        const status = await paymentsCheckInvoiceStatus.invoke({ invoiceId: id });
        if (status.status === "paid") {
            const before = await getInvoiceById(id);
            if (before && before.status !== "paid") {
                await setInvoiceStatus(id, "paid");
                await recordAudit({
                    entity: "invoice",
                    entityId: id,
                    kind: "status",
                    summary: `Status: ${before.status} → paid (LeanX lookup)`,
                    changes: [
                        { field: "status", before: before.status, after: "paid" },
                    ],
                });
            }
        }
        revalidatePath(`/invoices/${id}`);
        return {
            ok: true,
            message: `LeanX says: ${status.status}${status.amount ? ` (MYR ${status.amount})` : ""}`,
        };
    } catch (e) {
        return { ok: false, message: (e as Error).message };
    }
}

/**
 * Monthly retainer run (audit rec #2): one click drafts this month's retainer
 * invoice for every active client with a retainer amount configured.
 *
 * Idempotent via a notes marker `[retainer:YYYY-MM]` — re-running skips clients
 * already invoiced this month. Adds a quota-overage line when the month's
 * visuals exceed the client's quota and an extra-visual price is set.
 * Invoices land as DRAFTS for Farisha to review and send (SOP 5).
 */
export async function generateRetainerInvoicesAction(
    _prev: ActionResult,
    _formData: FormData,
): Promise<ActionResult> {
    const month = new Date().toISOString().slice(0, 7);
    const today = new Date().toISOString().slice(0, 10);
    const due = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
    const marker = `[retainer:${month}]`;

    const [clients, invoices, posts] = await Promise.all([
        listClients(),
        listInvoices(),
        listContentPosts(),
    ]);

    let created = 0;
    let skipped = 0;
    const names: string[] = [];

    for (const c of clients) {
        if (c.status !== "active" || !(c.monthlyRetainerMyr > 0)) continue;
        const already = invoices.some(
            (i) => i.clientName === c.name && i.notes.includes(marker),
        );
        if (already) {
            skipped++;
            continue;
        }

        const inv = await createInvoice({
            clientName: c.name,
            issueDate: today,
            dueDate: due,
        });
        await updateInvoice(inv.id, {
            notes: `Monthly retainer for ${month}. ${marker}`,
            billToAddress: c.billingAddress || "",
        });
        await addInvoiceItem(inv.id, {
            description: `Monthly retainer — ${c.packageName || "service package"} (${month})`,
            quantity: 1,
            unitPriceMyr: c.monthlyRetainerMyr,
        });

        // Quota overage → billable extras line (per-visual pricing).
        const used = visualsUsed(posts, c.name, month);
        const over = Math.max(0, used - (c.monthlyContentQuota || 0));
        if (over > 0 && c.monthlyContentQuota > 0 && c.extraContentPrice > 0) {
            await addInvoiceItem(inv.id, {
                description: `Additional visuals beyond quota (${used}/${c.monthlyContentQuota} used in ${month})`,
                quantity: over,
                unitPriceMyr: c.extraContentPrice,
            });
        }

        await recordAudit({
            entity: "invoice",
            entityId: inv.id,
            kind: "create",
            summary: `Retainer invoice drafted for ${c.name} (${month})`,
        });
        names.push(c.name);
        created++;
    }

    revalidatePath("/invoices");
    if (created === 0 && skipped === 0) {
        return {
            ok: false,
            message:
                "No active clients have a retainer amount set — fill 'Monthly retainer' on client records first.",
        };
    }
    return {
        ok: true,
        message: `${created} draft${created === 1 ? "" : "s"} created${
            names.length ? ` (${names.join(", ")})` : ""
        }${skipped ? ` · ${skipped} already invoiced for ${month}` : ""}. Review each, then Send.`,
    };
}
