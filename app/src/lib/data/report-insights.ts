/**
 * Report insights data adapter (dual dev-store / Supabase), keyed by
 * (clientName, month).
 *
 * Name matching is deliberately tolerant. The agency opens a report under the
 * client name as it appears on ACTIVITY records (campaigns, content, invoices —
 * see `listAllClientNames`), while the portal looks the report up by the name on
 * the CLIENT record. Those strings are hand-entered in different places, so a
 * stray space or a capital letter used to mean the client saw "No reports
 * published yet" even after the agency published. Every lookup here compares
 * trimmed + case-insensitively, and writes store the canonical client-record
 * name so both sides converge on one row.
 */
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import type { Database, ReportInsightsRow } from "@/lib/supabase/types";
import { isSupabaseEnabled } from "@/lib/data/flag";
import { listClients } from "@/lib/data/clients";
import * as dev from "@/lib/dev-store/report-insights";

export type { ReportInsights } from "@/lib/dev-store/report-insights";
type ReportInsights = dev.ReportInsights;

type InsightsInsert = Database["public"]["Tables"]["report_insights"]["Insert"];

const TABLE = "report_insights" as const;

const norm = (s: string) => s.trim().toLowerCase();

/**
 * The name exactly as it appears on the client record — the one string both the
 * agency and the portal can agree on. Falls back to the trimmed input when the
 * report is for a name with no client record (activity-only clients).
 */
async function canonicalName(clientName: string): Promise<string> {
    const clients = await listClients().catch(() => []);
    const match = clients.find((c) => norm(c.name) === norm(clientName));
    return match?.name ?? clientName.trim();
}

function rowTo(row: ReportInsightsRow): ReportInsights {
    return {
        id: row.id,
        clientName: row.client_name,
        month: row.month,
        summary: row.summary,
        conclusion: row.conclusion,
        recommendations: (row.recommendations ?? []) as string[],
        published: row.published ?? false,
        generatedAt: row.generated_at,
    };
}

export async function getReportInsights(
    clientName: string,
    month: string,
): Promise<ReportInsights | null> {
    if (!isSupabaseEnabled("reportInsights")) {
        return dev.getReportInsights(clientName, month);
    }
    const sb = createServiceClient();
    // Fetch the month's rows (at most one per client) and match in JS, so rows
    // written under a differently-cased/spaced name are still found.
    const { data, error } = await sb.from(TABLE).select("*").eq("month", month);
    if (error) throw new Error(`getReportInsights: ${error.message}`);
    const want = norm(clientName);
    const row = (data as ReportInsightsRow[]).find(
        (r) => norm(r.client_name) === want,
    );
    return row ? rowTo(row) : null;
}

export async function saveReportInsights(input: {
    clientName: string;
    month: string;
    summary: string;
    conclusion: string;
    recommendations: string[];
    published?: boolean;
}): Promise<ReportInsights> {
    if (!isSupabaseEnabled("reportInsights")) {
        return dev.saveReportInsights(input);
    }
    const sb = createServiceClient();
    const existing = await getReportInsights(input.clientName, input.month);
    const client_name = await canonicalName(input.clientName);
    const row: InsightsInsert = {
        // Update the row we actually found (its stored name may differ), and
        // rewrite it to the canonical name so it lines up from now on.
        id: existing?.id ?? randomUUID(),
        client_name,
        month: input.month,
        summary: input.summary,
        conclusion: input.conclusion,
        recommendations: input.recommendations,
        published: input.published ?? existing?.published ?? false,
        generated_at: new Date().toISOString(),
    };
    const { data, error } = await sb
        .from(TABLE)
        .upsert(row, { onConflict: "id" })
        .select("*")
        .single();
    if (error) throw new Error(`saveReportInsights: ${error.message}`);
    return rowTo(data as ReportInsightsRow);
}

export async function setReportPublished(
    clientName: string,
    month: string,
    published: boolean,
): Promise<void> {
    if (!isSupabaseEnabled("reportInsights")) {
        await dev.setReportPublished(clientName, month, published);
        return;
    }
    // Resolve the row first: a blind .eq() update on a mismatched name silently
    // affects zero rows, which is what made "Published" look like it worked
    // while the client still saw nothing.
    const existing = await getReportInsights(clientName, month);
    if (!existing) {
        throw new Error(
            `setReportPublished: no report for ${clientName} ${month} — generate the overview first`,
        );
    }
    const sb = createServiceClient();
    const { error } = await sb
        .from(TABLE)
        .update({ published, client_name: await canonicalName(clientName) })
        .eq("id", existing.id);
    if (error) throw new Error(`setReportPublished: ${error.message}`);
}

/** Published reports for a client (for the client portal). */
export async function listPublishedReports(
    clientName: string,
): Promise<ReportInsights[]> {
    if (!isSupabaseEnabled("reportInsights")) {
        return dev.listPublishedReports(clientName);
    }
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("published", true)
        .order("month", { ascending: false });
    if (error) throw new Error(`listPublishedReports: ${error.message}`);
    const want = norm(clientName);
    return (data as ReportInsightsRow[])
        .filter((r) => norm(r.client_name) === want)
        .map(rowTo);
}
