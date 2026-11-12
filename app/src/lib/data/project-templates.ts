/**
 * Project templates data adapter. Dispatches via `isSupabaseEnabled("projectTemplates")`.
 */
import { createServiceClient } from "@/lib/supabase/server";
import type { Database, ProjectTemplateRow } from "@/lib/supabase/types";
import { isSupabaseEnabled } from "@/lib/data/flag";
import * as dev from "@/lib/dev-store/project-templates";

export {
    MAX_TEMPLATE_MONTHS,
    MIN_TEMPLATE_MONTHS,
    STARTER_PROJECT_TEMPLATES,
    buildProjectTemplate,
    clampMonths,
    normalizeProjectTemplate,
    sortProjectTemplates,
} from "@/lib/dev-store/project-templates";
export type { ProjectTemplate, CreateProjectTemplateInput, ProjectTemplatePatch } from "@/lib/dev-store/project-templates";

type ProjectTemplate = dev.ProjectTemplate;
type Insert = Database["public"]["Tables"]["project_templates"]["Insert"];
type Update = Database["public"]["Tables"]["project_templates"]["Update"];

const TABLE = "project_templates" as const;
const ENTITY = "projectTemplates" as const;

function rowToTemplate(row: ProjectTemplateRow): ProjectTemplate {
    return dev.normalizeProjectTemplate({
        id: row.id,
        name: row.name,
        description: row.description,
        months: row.months,
        requirements: row.requirements as ProjectTemplate["requirements"],
        phases: row.phases as ProjectTemplate["phases"],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    });
}

function toInsert(t: ProjectTemplate): Insert {
    return {
        id: t.id,
        name: t.name,
        description: t.description,
        months: t.months,
        requirements: t.requirements,
        phases: t.phases,
        created_at: t.createdAt,
        updated_at: t.updatedAt,
    };
}

function patchToUpdate(patch: dev.ProjectTemplatePatch): Update {
    const out: Update = {};
    if (patch.name !== undefined) out.name = patch.name;
    if (patch.description !== undefined) out.description = patch.description;
    if (patch.months !== undefined) out.months = patch.months;
    if (patch.requirements !== undefined) out.requirements = patch.requirements;
    if (patch.phases !== undefined) out.phases = patch.phases;
    out.updated_at = new Date().toISOString();
    return out;
}

export async function createProjectTemplate(input: dev.CreateProjectTemplateInput): Promise<ProjectTemplate> {
    if (!isSupabaseEnabled(ENTITY)) return dev.createProjectTemplate(input);
    const t = dev.buildProjectTemplate(input);
    const sb = createServiceClient();
    const { data, error } = await sb.from(TABLE).insert(toInsert(t)).select("*").single();
    if (error) throw new Error(`createProjectTemplate: ${error.message}`);
    return rowToTemplate(data as ProjectTemplateRow);
}

export async function listProjectTemplates(): Promise<ProjectTemplate[]> {
    if (!isSupabaseEnabled(ENTITY)) return dev.listProjectTemplates();
    const sb = createServiceClient();
    const { data, error } = await sb.from(TABLE).select("*");
    if (error) throw new Error(`listProjectTemplates: ${error.message}`);
    return dev.sortProjectTemplates((data as ProjectTemplateRow[]).map(rowToTemplate));
}

export async function getProjectTemplateById(id: string): Promise<ProjectTemplate | null> {
    if (!isSupabaseEnabled(ENTITY)) return dev.getProjectTemplateById(id);
    const sb = createServiceClient();
    const { data, error } = await sb.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`getProjectTemplateById: ${error.message}`);
    return data ? rowToTemplate(data as ProjectTemplateRow) : null;
}

export async function updateProjectTemplate(id: string, patch: dev.ProjectTemplatePatch): Promise<ProjectTemplate> {
    if (!isSupabaseEnabled(ENTITY)) return dev.updateProjectTemplate(id, patch);
    const sb = createServiceClient();
    const { data, error } = await sb.from(TABLE).update(patchToUpdate(patch)).eq("id", id).select("*").single();
    if (error) throw new Error(`updateProjectTemplate: ${error.message}`);
    return rowToTemplate(data as ProjectTemplateRow);
}

export async function deleteProjectTemplate(id: string): Promise<void> {
    if (!isSupabaseEnabled(ENTITY)) return dev.deleteProjectTemplate(id);
    const sb = createServiceClient();
    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`deleteProjectTemplate: ${error.message}`);
}
