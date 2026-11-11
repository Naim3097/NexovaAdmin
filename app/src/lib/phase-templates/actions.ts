"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
    STARTER_PHASE_TEMPLATES,
    createPhaseTemplate,
    deletePhaseTemplate,
    getPhaseTemplateById,
    listPhaseTemplates,
    updatePhaseTemplate,
} from "@/lib/data/phase-templates";
import { phaseKeyFrom, type PlannerPhase } from "@/lib/dev-store/planners";

function clean(v: FormDataEntryValue | null): string {
    return String(v ?? "").trim();
}

/** "Name — summary", "Name – summary", "Name - summary" (spaced hyphen only, so "Go-live" survives). */
const NAME_SUMMARY_SEP = /\s*[—–]\s*|\s+-\s+/;

/**
 * One phase per line, in order. Keys come from the name ("QA & launch" →
 * "qa-launch"); a repeated name gets a numeric suffix so lines can still tell
 * the phases apart. Months are never set on a template — they belong to the
 * contract.
 */
function parsePhases(text: string): PlannerPhase[] {
    const seen = new Map<string, number>();
    const out: PlannerPhase[] = [];
    for (const raw of text.split(/\r?\n/)) {
        // Tolerate "1. Discovery" / "- Discovery" / "• Discovery".
        const line = raw.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, "").trim();
        if (!line) continue;
        const [first = "", ...rest] = line.split(NAME_SUMMARY_SEP);
        const name = first.trim();
        if (!name) continue;
        const base = phaseKeyFrom(name);
        const n = (seen.get(base) ?? 0) + 1;
        seen.set(base, n);
        out.push({ key: n === 1 ? base : `${base}-${n}`, name, summary: rest.join(" — ").trim(), startMonth: "", endMonth: "" });
    }
    return out;
}

/** Templates are picked when a contract is created and on the contract itself, so those pages refresh too. */
function revalidate(id?: string) {
    revalidatePath("/settings");
    revalidatePath("/settings/phases");
    if (id) revalidatePath(`/settings/phases/${id}`);
    revalidatePath("/contracts");
    revalidatePath("/contracts/new");
    revalidatePath("/contracts/[id]", "page");
}

export async function createPhaseTemplateAction(formData: FormData) {
    const name = clean(formData.get("name"));
    if (!name) return;
    const t = await createPhaseTemplate({
        name,
        description: clean(formData.get("description")),
        phases: parsePhases(String(formData.get("phases") ?? "")),
        isDefault: clean(formData.get("isDefault")) === "on",
    });
    revalidate(t.id);
    redirect(`/settings/phases/${t.id}`);
}

/** Name, description and the phases textarea. The default flag has its own action. */
export async function updatePhaseTemplateAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const t = id ? await getPhaseTemplateById(id) : null;
    if (!t) return;
    await updatePhaseTemplate(id, {
        name: clean(formData.get("name")) || t.name,
        description: formData.has("description") ? clean(formData.get("description")) : t.description,
        phases: formData.has("phases") ? parsePhases(String(formData.get("phases") ?? "")) : t.phases,
    });
    revalidate(id);
}

/**
 * Make this template the one new contracts start from (the store clears the
 * previous default). Send `isDefault=0` to clear it instead, which puts new
 * contracts back on the built-in Kickoff / Foundation / Production / Review set.
 */
export async function setDefaultPhaseTemplateAction(formData: FormData) {
    const id = clean(formData.get("id"));
    const t = id ? await getPhaseTemplateById(id) : null;
    if (!t) return;
    const isDefault = clean(formData.get("isDefault")) !== "0";
    if (t.isDefault !== isDefault) await updatePhaseTemplate(id, { isDefault });
    revalidate(id);
}

/** Contracts that already applied the template keep their phases — only the template goes. */
export async function deletePhaseTemplateAction(formData: FormData) {
    const id = clean(formData.get("id"));
    if (!id) return;
    await deletePhaseTemplate(id);
    revalidate(id);
    redirect("/settings/phases");
}

/** Creates the three starters (Social retainer as default) on an empty list only. */
export async function seedStarterPhaseTemplatesAction() {
    const existing = await listPhaseTemplates();
    if (existing.length > 0) return;
    for (const starter of STARTER_PHASE_TEMPLATES) await createPhaseTemplate(starter);
    revalidate();
}
