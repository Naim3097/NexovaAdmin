/**
 * Workflow templates data adapter.
 *
 * Defaults live in code (lib/workflows/defaults.ts). The `workflow_templates`
 * table (or dev-store file) holds OVERRIDES only — a missing row falls back to
 * the code default, mirroring how agency_profile falls back to DEFAULT_PROFILE.
 */
import { createServiceClient } from "@/lib/supabase/server";
import type { Database, WorkflowTemplateRow } from "@/lib/supabase/types";
import { isSupabaseEnabled } from "@/lib/data/flag";
import { SERVICE_CATEGORIES, type ServiceCategory } from "@/lib/dev-store/services";
import {
    defaultTemplate,
    DEFAULT_WORKFLOWS,
    type WorkflowTemplate,
    type WorkflowStageDef,
} from "@/lib/workflows/defaults";
import * as devWorkflows from "@/lib/dev-store/workflows";

export type { WorkflowTemplate, WorkflowStageDef } from "@/lib/workflows/defaults";

type TemplateInsert = Database["public"]["Tables"]["workflow_templates"]["Insert"];

const TABLE = "workflow_templates" as const;

function rowToTemplate(row: WorkflowTemplateRow): WorkflowTemplate {
    return {
        serviceCategory: row.service_category as ServiceCategory,
        name: row.name,
        // JSONB stage shape mirrors WorkflowStageDef (camelCase) — pass through.
        stages: (row.stages ?? []) as WorkflowStageDef[],
    };
}

function templateToInsert(tpl: WorkflowTemplate): TemplateInsert {
    return {
        service_category: tpl.serviceCategory,
        name: tpl.name,
        stages: tpl.stages,
        updated_at: new Date().toISOString(),
    };
}

export async function getTemplate(
    category: ServiceCategory,
): Promise<WorkflowTemplate> {
    if (!isSupabaseEnabled("workflows")) return devWorkflows.getTemplate(category);
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("service_category", category)
        .maybeSingle();
    // Degrade to the code default if the table isn't there yet (pre-0005).
    if (error) return defaultTemplate(category);
    return data
        ? rowToTemplate(data as WorkflowTemplateRow)
        : defaultTemplate(category);
}

export async function listTemplates(): Promise<WorkflowTemplate[]> {
    if (!isSupabaseEnabled("workflows")) return devWorkflows.listTemplates();
    const sb = createServiceClient();
    const { data, error } = await sb.from(TABLE).select("*");
    // Degrade to code defaults if the table isn't there yet (pre-0005).
    if (error) return SERVICE_CATEGORIES.map((c) => defaultTemplate(c));
    const overrides = new Map(
        (data as WorkflowTemplateRow[]).map((r) => [
            r.service_category,
            rowToTemplate(r),
        ]),
    );
    return SERVICE_CATEGORIES.map(
        (c) => overrides.get(c) ?? defaultTemplate(c),
    );
}

export async function updateTemplate(
    category: ServiceCategory,
    input: { name?: string; stages: WorkflowStageDef[] },
): Promise<WorkflowTemplate> {
    if (!isSupabaseEnabled("workflows")) {
        return devWorkflows.updateTemplate(category, input);
    }
    const tpl: WorkflowTemplate = {
        serviceCategory: category,
        name: input.name ?? DEFAULT_WORKFLOWS[category]?.name ?? category,
        stages: input.stages,
    };
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .upsert(templateToInsert(tpl), { onConflict: "service_category" })
        .select("*")
        .single();
    if (error) throw new Error(`updateTemplate: ${error.message}`);
    return rowToTemplate(data as WorkflowTemplateRow);
}

export async function resetTemplate(
    category: ServiceCategory,
): Promise<WorkflowTemplate> {
    if (!isSupabaseEnabled("workflows")) return devWorkflows.resetTemplate(category);
    const sb = createServiceClient();
    const { error } = await sb
        .from(TABLE)
        .delete()
        .eq("service_category", category);
    if (error) throw new Error(`resetTemplate: ${error.message}`);
    return defaultTemplate(category);
}
