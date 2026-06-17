/**
 * Report insights data adapter (dual dev-store / Supabase), keyed by
 * (clientName, month). Upsert = update the existing row for the month if any,
 * else insert.
 */
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import type { Database, ReportInsightsRow } from "@/lib/supabase/types";
import { isSupabaseEnabled } from "@/lib/data/flag";
import * as dev from "@/lib/dev-store/report-insights";

export type { ReportInsights } from "@/lib/dev-store/report-insights";
type ReportInsights = dev.ReportInsights;

type InsightsInsert = Database["public"]["Tables"]["report_insights"]["Insert"];

const TABLE = "report_insights" as const;

function rowTo(row: ReportInsightsRow): ReportInsights {
    return {
        id: row.id,
        clientName: row.client_name,
        month: row.month,
        summary: row.summary,
        conclusion: row.conclusion,
        recommendations: (row.recommendations ?? []) as string[],
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
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("client_name", clientName)
        .eq("month", month)
        .maybeSingle();
    if (error) throw new Error(`getReportInsights: ${error.message}`);
    return data ? rowTo(data as ReportInsightsRow) : null;
}

export async function saveReportInsights(input: {
    clientName: string;
    month: string;
    summary: string;
    conclusion: string;
    recommendations: string[];
}): Promise<ReportInsights> {
    if (!isSupabaseEnabled("reportInsights")) {
        return dev.saveReportInsights(input);
    }
    const sb = createServiceClient();
    const existing = await getReportInsights(input.clientName, input.month);
    const row: InsightsInsert = {
        id: existing?.id ?? randomUUID(),
        client_name: input.clientName,
        month: input.month,
        summary: input.summary,
        conclusion: input.conclusion,
        recommendations: input.recommendations,
        generated_at: new Date().toISOString(),
    };
    const { data, error } = await sb
        .from(TABLE)
        .upsert(row, { onConflict: "client_name,month" })
        .select("*")
        .single();
    if (error) throw new Error(`saveReportInsights: ${error.message}`);
    return rowTo(data as ReportInsightsRow);
}
