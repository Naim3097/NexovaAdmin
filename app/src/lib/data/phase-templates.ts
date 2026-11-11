/**
 * Phase templates data adapter. Dispatches via `isSupabaseEnabled("phaseTemplates")`.
 */
import { createServiceClient } from "@/lib/supabase/server";
import type { Database, PhaseTemplateRow } from "@/lib/supabase/types";
import { isSupabaseEnabled } from "@/lib/data/flag";
import * as dev from "@/lib/dev-store/phase-templates";

export { STARTER_PHASE_TEMPLATES, buildPhaseTemplate, normalizePhaseTemplate, sortPhaseTemplates } from "@/lib/dev-store/phase-templates";
export type { PhaseTemplate, CreatePhaseTemplateInput, PhaseTemplatePatch } from "@/lib/dev-store/phase-templates";

type PhaseTemplate = dev.PhaseTemplate;
type Insert = Database["public"]["Tables"]["phase_templates"]["Insert"];
type Update = Database["public"]["Tables"]["phase_templates"]["Update"];

const TABLE = "phase_templates" as const;
const ENTITY = "phaseTemplates" as const;

function rowToTemplate(row: PhaseTemplateRow): PhaseTemplate {
    return dev.normalizePhaseTemplate({
        id: row.id,
        name: row.name,
        description: row.description,
        phases: row.phases as PhaseTemplate["phases"],
        isDefault: row.is_default,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    });
}

function toInsert(t: PhaseTemplate): Insert {
    return {
        id: t.id,
        name: t.name,
        description: t.description,
        phases: t.phases,
        is_default: t.isDefault,
        created_at: t.createdAt,
        updated_at: t.updatedAt,
    };
}

function patchToUpdate(patch: dev.PhaseTemplatePatch): Update {
    const out: Update = {};
    if (patch.name !== undefined) out.name = patch.name;
    if (patch.description !== undefined) out.description = patch.description;
    if (patch.phases !== undefined) out.phases = patch.phases;
    if (patch.isDefault !== undefined) out.is_default = patch.isDefault;
    out.updated_at = new Date().toISOString();
    return out;
}

async function clearDefault() {
    const sb = createServiceClient();
    const { error } = await sb.from(TABLE).update({ is_default: false }).eq("is_default", true);
    if (error) throw new Error(`clearDefaultPhaseTemplate: ${error.message}`);
}

export async function createPhaseTemplate(input: dev.CreatePhaseTemplateInput): Promise<PhaseTemplate> {
    if (!isSupabaseEnabled(ENTITY)) return dev.createPhaseTemplate(input);
    const t = dev.buildPhaseTemplate(input);
    if (t.isDefault) await clearDefault();
    const sb = createServiceClient();
    const { data, error } = await sb.from(TABLE).insert(toInsert(t)).select("*").single();
    if (error) throw new Error(`createPhaseTemplate: ${error.message}`);
    return rowToTemplate(data as PhaseTemplateRow);
}

export async function listPhaseTemplates(): Promise<PhaseTemplate[]> {
    if (!isSupabaseEnabled(ENTITY)) return dev.listPhaseTemplates();
    const sb = createServiceClient();
    const { data, error } = await sb.from(TABLE).select("*");
    if (error) throw new Error(`listPhaseTemplates: ${error.message}`);
    return dev.sortPhaseTemplates((data as PhaseTemplateRow[]).map(rowToTemplate));
}

export async function getPhaseTemplateById(id: string): Promise<PhaseTemplate | null> {
    if (!isSupabaseEnabled(ENTITY)) return dev.getPhaseTemplateById(id);
    const sb = createServiceClient();
    const { data, error } = await sb.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`getPhaseTemplateById: ${error.message}`);
    return data ? rowToTemplate(data as PhaseTemplateRow) : null;
}

export async function getDefaultPhaseTemplate(): Promise<PhaseTemplate | null> {
    const all = await listPhaseTemplates();
    return all.find((t) => t.isDefault) ?? null;
}

export async function updatePhaseTemplate(id: string, patch: dev.PhaseTemplatePatch): Promise<PhaseTemplate> {
    if (!isSupabaseEnabled(ENTITY)) return dev.updatePhaseTemplate(id, patch);
    if (patch.isDefault) await clearDefault();
    const sb = createServiceClient();
    const { data, error } = await sb.from(TABLE).update(patchToUpdate(patch)).eq("id", id).select("*").single();
    if (error) throw new Error(`updatePhaseTemplate: ${error.message}`);
    return rowToTemplate(data as PhaseTemplateRow);
}

export async function deletePhaseTemplate(id: string): Promise<void> {
    if (!isSupabaseEnabled(ENTITY)) return dev.deletePhaseTemplate(id);
    const sb = createServiceClient();
    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`deletePhaseTemplate: ${error.message}`);
}
