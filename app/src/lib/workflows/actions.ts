"use server";

import { revalidatePath } from "next/cache";
import {
    getTemplate,
    updateTemplate,
    resetTemplate,
    type WorkflowStageDef,
} from "@/lib/data/workflows";
import {
    SERVICE_CATEGORIES,
    type ServiceCategory,
} from "@/lib/dev-store/services";

function asCategory(v: FormDataEntryValue | null): ServiceCategory | null {
    const s = String(v ?? "").trim();
    return (SERVICE_CATEGORIES as readonly string[]).includes(s)
        ? (s as ServiceCategory)
        : null;
}

function slug(label: string): string {
    return (
        label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "") || "stage"
    );
}

function revalidate(category: ServiceCategory) {
    revalidatePath("/settings/workflows");
    revalidatePath(`/settings/workflows/${category}`);
}

export async function addTemplateStageAction(formData: FormData) {
    const category = asCategory(formData.get("category"));
    if (!category) return;
    const label = String(formData.get("label") ?? "").trim();
    if (!label) return;
    const ownerRole = String(formData.get("ownerRole") ?? "").trim() || "Other";
    const tpl = await getTemplate(category);
    const stages: WorkflowStageDef[] = [
        ...tpl.stages,
        { key: slug(label), label, ownerRole: ownerRole as WorkflowStageDef["ownerRole"], description: "" },
    ];
    await updateTemplate(category, { name: tpl.name, stages });
    revalidate(category);
}

export async function updateTemplateStageAction(formData: FormData) {
    const category = asCategory(formData.get("category"));
    if (!category) return;
    const idx = Number(formData.get("index"));
    const tpl = await getTemplate(category);
    if (!Number.isInteger(idx) || idx < 0 || idx >= tpl.stages.length) return;
    const label = String(formData.get("label") ?? "").trim();
    const ownerRole = String(formData.get("ownerRole") ?? "").trim();
    const stages = tpl.stages.map((s, i) =>
        i === idx
            ? {
                  ...s,
                  label: label || s.label,
                  ownerRole: (ownerRole || s.ownerRole) as WorkflowStageDef["ownerRole"],
              }
            : s,
    );
    await updateTemplate(category, { name: tpl.name, stages });
    revalidate(category);
}

export async function removeTemplateStageAction(formData: FormData) {
    const category = asCategory(formData.get("category"));
    if (!category) return;
    const idx = Number(formData.get("index"));
    const tpl = await getTemplate(category);
    if (!Number.isInteger(idx)) return;
    const stages = tpl.stages.filter((_, i) => i !== idx);
    await updateTemplate(category, { name: tpl.name, stages });
    revalidate(category);
}

export async function moveTemplateStageAction(formData: FormData) {
    const category = asCategory(formData.get("category"));
    if (!category) return;
    const idx = Number(formData.get("index"));
    const dir = String(formData.get("dir") ?? "");
    const tpl = await getTemplate(category);
    const stages = [...tpl.stages];
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (
        !Number.isInteger(idx) ||
        idx < 0 ||
        idx >= stages.length ||
        swap < 0 ||
        swap >= stages.length
    ) {
        return;
    }
    [stages[idx], stages[swap]] = [stages[swap], stages[idx]];
    await updateTemplate(category, { name: tpl.name, stages });
    revalidate(category);
}

export async function renameTemplateAction(formData: FormData) {
    const category = asCategory(formData.get("category"));
    if (!category) return;
    const name = String(formData.get("name") ?? "").trim();
    const tpl = await getTemplate(category);
    await updateTemplate(category, { name: name || tpl.name, stages: tpl.stages });
    revalidate(category);
}

export async function resetTemplateAction(formData: FormData) {
    const category = asCategory(formData.get("category"));
    if (!category) return;
    await resetTemplate(category);
    revalidate(category);
}
