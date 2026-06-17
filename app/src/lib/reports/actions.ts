"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { buildClientMonthlyReport } from "@/lib/reports";
import { createInvoice, updateInvoice } from "@/lib/data/invoices";

/**
 * Auto-build a DRAFT invoice from a client's chargeable extras for a month
 * (extra content + extra revisions, priced from the client's per-extra rates).
 * Lands you on the draft invoice to review and send.
 */
export async function createExtrasInvoiceAction(formData: FormData) {
    const clientName = String(formData.get("client") ?? "").trim();
    const month = String(formData.get("month") ?? "").trim();
    if (!clientName || !/^\d{4}-\d{2}$/.test(month)) return;

    const report = await buildClientMonthlyReport(clientName, month);
    const { extras } = report;
    if (extras.total <= 0) return;

    const monthLabel = month;
    const items: {
        id: string;
        description: string;
        quantity: number;
        unitPriceMyr: number;
    }[] = [];
    if (extras.contentCount > 0) {
        items.push({
            id: "",
            description: `Extra content beyond plan — ${monthLabel}`,
            quantity: extras.contentCount,
            unitPriceMyr: extras.contentPrice,
        });
    }
    if (extras.revisionCount > 0) {
        items.push({
            id: "",
            description: `Extra revisions beyond limit — ${monthLabel}`,
            quantity: extras.revisionCount,
            unitPriceMyr: extras.revisionPrice,
        });
    }
    if (items.length === 0) return;

    const inv = await createInvoice({ clientName });
    await updateInvoice(inv.id, {
        items,
        notes: `Chargeable extras for ${monthLabel}. Auto-generated from the monthly report.`,
    });

    revalidatePath("/invoices");
    revalidatePath(`/invoices/${inv.id}`);
    redirect(`/invoices/${inv.id}`);
}
