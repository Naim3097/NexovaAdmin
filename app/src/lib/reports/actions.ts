"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { buildClientMonthlyReport } from "@/lib/reports";
import { createInvoice, updateInvoice } from "@/lib/data/invoices";
import { generateReportInsights } from "@/lib/ai/report-insights";
import {
    saveReportInsights,
    setReportPublished,
} from "@/lib/data/report-insights";

function reportPath(clientName: string, month: string) {
    return `/reports/client/${encodeURIComponent(clientName)}/${month}`;
}

/** Agency edits the report overview (summary / conclusion / recommendations). */
export async function saveReportInsightsAction(formData: FormData) {
    const clientName = String(formData.get("client") ?? "").trim();
    const month = String(formData.get("month") ?? "").trim();
    if (!clientName || !/^\d{4}-\d{2}$/.test(month)) return;
    const recommendations = String(formData.get("recommendations") ?? "")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
    await saveReportInsights({
        clientName,
        month,
        summary: String(formData.get("summary") ?? "").trim(),
        conclusion: String(formData.get("conclusion") ?? "").trim(),
        recommendations,
    });
    revalidatePath(reportPath(clientName, month));
}

/** Publish / unpublish the report to the client portal. */
export async function setReportPublishedAction(formData: FormData) {
    const clientName = String(formData.get("client") ?? "").trim();
    const month = String(formData.get("month") ?? "").trim();
    const published = String(formData.get("published") ?? "") === "1";
    if (!clientName || !/^\d{4}-\d{2}$/.test(month)) return;
    await setReportPublished(clientName, month, published);
    revalidatePath(reportPath(clientName, month));
    revalidatePath("/portal/reports");
}

export type InsightsState = { ok: boolean; error?: string };

/**
 * Generate the AI narrative (summary / conclusion / recommendations) for a
 * client's month from its deliverables + review notes + ad metrics, and cache it.
 */
export async function generateReportInsightsAction(
    _prev: InsightsState | undefined,
    formData: FormData,
): Promise<InsightsState> {
    const clientName = String(formData.get("client") ?? "").trim();
    const month = String(formData.get("month") ?? "").trim();
    if (!clientName || !/^\d{4}-\d{2}$/.test(month)) {
        return { ok: false, error: "Missing client or month." };
    }
    try {
        const report = await buildClientMonthlyReport(clientName, month);
        const result = await generateReportInsights({
            clientName,
            month,
            packageName: report.billing.packageName,
            delivered: report.contentApproved.map((p) => ({
                title: p.title,
                platform: p.platform,
                type: p.type,
                caption: p.copywriting,
                direction: p.direction,
                notes: p.feedback
                    .filter((f) => f.author === "client")
                    .map((f) => f.body),
            })),
            campaigns: report.campaigns.map((r) => ({
                name: r.campaign.name,
                platform: r.campaign.platform,
                spendMyr: r.spendMyr,
                impressions: r.impressions,
                clicks: r.clicks,
                leads: r.crmLeads,
            })),
            extras: {
                contentCount: report.extras.contentCount,
                revisionCount: report.extras.revisionCount,
            },
        });
        await saveReportInsights({ clientName, month, ...result });
        revalidatePath(
            `/reports/client/${encodeURIComponent(clientName)}/${month}`,
        );
        return { ok: true };
    } catch (e) {
        return { ok: false, error: (e as Error).message };
    }
}

/**
 * Auto-build a DRAFT invoice for a client's month = fixed retainer + any
 * chargeable extras (extra content + extra revisions, priced from the client's
 * per-extra rates). Lands you on the draft invoice to review and send.
 */
export async function createMonthlyInvoiceAction(formData: FormData) {
    const clientName = String(formData.get("client") ?? "").trim();
    const month = String(formData.get("month") ?? "").trim();
    if (!clientName || !/^\d{4}-\d{2}$/.test(month)) return;

    const report = await buildClientMonthlyReport(clientName, month);
    const { billing, extras } = report;

    const items: {
        id: string;
        description: string;
        details: string;
        quantity: number;
        unitPriceMyr: number;
    }[] = [];

    if (billing.retainer > 0) {
        items.push({
            id: "",
            details: "",
            description: `${billing.packageName ? `${billing.packageName} ` : ""}monthly retainer — ${month}`,
            quantity: 1,
            unitPriceMyr: billing.retainer,
        });
    }
    if (extras.contentCount > 0) {
        items.push({
            id: "",
            details: "",
            description: `Extra visuals beyond plan — ${month}`,
            quantity: extras.contentCount,
            unitPriceMyr: extras.contentPrice,
        });
    }
    if (extras.revisionCount > 0) {
        items.push({
            id: "",
            details: "",
            description: `Extra revisions beyond limit — ${month}`,
            quantity: extras.revisionCount,
            unitPriceMyr: extras.revisionPrice,
        });
    }
    if (items.length === 0) return;

    const inv = await createInvoice({ clientName });
    await updateInvoice(inv.id, {
        items,
        notes: `${month} — retainer + extras. Auto-generated from the monthly report.`,
    });

    revalidatePath("/invoices");
    revalidatePath(`/invoices/${inv.id}`);
    redirect(`/invoices/${inv.id}`);
}
