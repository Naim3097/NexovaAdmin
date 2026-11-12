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
            projects: report.billing.projects,
            delivered: report.contentDelivered.map((p) => ({
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
 * Auto-build a DRAFT invoice for a client's month: the monthly billing of
 * their active projects, one line. Work beyond the plan (extra visuals, extra
 * revisions) is no longer priced on the client record, so it goes into the
 * invoice notes as a reminder for the account manager to add a line by hand.
 * Lands you on the draft invoice to review and send.
 */
export async function createMonthlyInvoiceAction(formData: FormData) {
    const clientName = String(formData.get("client") ?? "").trim();
    const month = String(formData.get("month") ?? "").trim();
    if (!clientName || !/^\d{4}-\d{2}$/.test(month)) return;

    const report = await buildClientMonthlyReport(clientName, month);
    const { billing, extras } = report;
    if (billing.retainer <= 0) return;

    const items = [
        {
            id: "",
            details: billing.projects.join(", "),
            description: `Monthly retainer — ${month}`,
            quantity: 1,
            unitPriceMyr: billing.retainer,
        },
    ];
    const extraNotes: string[] = [];
    if (extras.contentCount > 0) {
        extraNotes.push(`${extras.contentCount} visual${extras.contentCount === 1 ? "" : "s"} beyond the monthly plan`);
    }
    if (extras.revisionCount > 0) {
        extraNotes.push(`${extras.revisionCount} revision${extras.revisionCount === 1 ? "" : "s"} beyond the limit`);
    }

    const inv = await createInvoice({ clientName });
    await updateInvoice(inv.id, {
        items,
        notes: [
            `${month} — monthly billing of the active projects. Auto-generated from the monthly report.`,
            extraNotes.length ? `Beyond the plan this month: ${extraNotes.join(" · ")} — add a line if these are chargeable.` : "",
        ]
            .filter(Boolean)
            .join("\n"),
    });

    revalidatePath("/invoices");
    revalidatePath(`/invoices/${inv.id}`);
    redirect(`/invoices/${inv.id}`);
}
