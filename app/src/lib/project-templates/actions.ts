"use server";
/**
 * Settings → Templates: create, edit, delete and seed project templates.
 * A template is months + deliverable rows + phase rows, nothing else.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActingMember } from "@/lib/auth";
import {
    STARTER_PROJECT_TEMPLATES,
    clampMonths,
    createProjectTemplate,
    deleteProjectTemplate,
    listProjectTemplates,
    updateProjectTemplate,
} from "@/lib/data/project-templates";
import { deliverablesFromForm, phaseRowsFromForm } from "@/lib/contracts/rows";
import { isAdmin } from "@/lib/roles";

function clean(v: FormDataEntryValue | null): string {
    return typeof v === "string" ? v.trim() : "";
}

function revalidate(id?: string) {
    revalidatePath("/settings");
    revalidatePath("/settings/templates");
    if (id) revalidatePath(`/settings/templates/${id}`);
    revalidatePath("/projects/new");
}

/** A name and at least one deliverable; phases may be empty. */
export async function createProjectTemplateAction(formData: FormData) {
    const name = clean(formData.get("name"));
    if (!name) redirect("/settings/templates?error=name");
    const requirements = deliverablesFromForm(formData);
    if (requirements.length === 0) redirect("/settings/templates?error=requirements");
    const t = await createProjectTemplate({
        name,
        description: clean(formData.get("description")),
        months: clampMonths(formData.get("months")),
        requirements,
        phases: phaseRowsFromForm(formData),
    });
    revalidate(t.id);
    redirect(`/settings/templates/${t.id}`);
}

export async function updateProjectTemplateAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const name = clean(formData.get("name"));
    if (!id) return;
    if (!name) redirect(`/settings/templates/${id}?error=name`);
    const requirements = deliverablesFromForm(formData);
    if (requirements.length === 0) redirect(`/settings/templates/${id}?error=requirements`);
    await updateProjectTemplate(id, {
        name,
        description: clean(formData.get("description")),
        months: clampMonths(formData.get("months")),
        requirements,
        phases: phaseRowsFromForm(formData),
    });
    revalidate(id);
    redirect(`/settings/templates/${id}?saved=1`);
}

/** Admins only. */
export async function deleteProjectTemplateAction(formData: FormData) {
    const id = clean(formData.get("id"));
    if (!id) return;
    if (!isAdmin(await getActingMember())) return;
    await deleteProjectTemplate(id);
    revalidate(id);
    redirect("/settings/templates");
}

/** The three starters (Starter, Growth, Scale), skipping names that already exist. */
export async function seedStarterProjectTemplatesAction() {
    const existing = await listProjectTemplates();
    const have = new Set(existing.map((t) => t.name.toLowerCase()));
    for (const s of STARTER_PROJECT_TEMPLATES) {
        if (have.has(s.name.toLowerCase())) continue;
        await createProjectTemplate(s);
    }
    revalidate();
}
