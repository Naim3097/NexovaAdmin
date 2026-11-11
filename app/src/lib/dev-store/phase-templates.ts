/**
 * DEV-ONLY local file store for phase templates.
 * Replaced by Supabase `phase_templates` once provisioned.
 *
 * A phase template is a named, reusable set of phases ("Website build":
 * Discovery → Design → Build → QA & launch). A consultant applies one to a
 * proposal or a contract instead of starting from the built-in defaults, then
 * edits the phases freely. Exactly one template may be the default for new
 * proposals; when none is, the built-in Kickoff/Foundation/Production/Review
 * set is used.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { devDataRoot } from "@/lib/dev-store/root";
import { randomUUID } from "node:crypto";
import { normalizePhases, type PlannerPhase } from "@/lib/dev-store/planners";

const ROOT = devDataRoot();
const DIR = path.join(ROOT, "phase-templates");

export type PhaseTemplate = {
    id: string;
    name: string;
    description: string;
    phases: PlannerPhase[];
    /** Used for new proposals when true. At most one template should be default. */
    isDefault: boolean;
    createdAt: string;
    updatedAt: string;
};

export type CreatePhaseTemplateInput = {
    name: string;
    description?: string;
    phases?: PlannerPhase[];
    isDefault?: boolean;
};

export type PhaseTemplatePatch = Partial<Omit<PhaseTemplate, "id" | "createdAt">>;

/** Starter templates seeded on a fresh install (names are editable afterwards). */
export const STARTER_PHASE_TEMPLATES: CreatePhaseTemplateInput[] = [
    {
        name: "Social retainer",
        description: "Ongoing content and campaigns with a setup month and a review at the end.",
        isDefault: true,
        phases: [
            { key: "kickoff", name: "Kickoff", summary: "Onboarding, brand audit, access, strategy sign-off.", startMonth: "", endMonth: "" },
            { key: "foundation", name: "Foundation", summary: "Branding, website and account setup.", startMonth: "", endMonth: "" },
            { key: "production", name: "Production", summary: "Monthly posts, campaigns and articles.", startMonth: "", endMonth: "" },
            { key: "review", name: "Review", summary: "Performance review, renewal proposal, next plan.", startMonth: "", endMonth: "" },
        ],
    },
    {
        name: "Website build",
        description: "A fixed-scope site: discovery, design, build, launch.",
        phases: [
            { key: "discovery", name: "Discovery", summary: "Requirements, sitemap, content inventory.", startMonth: "", endMonth: "" },
            { key: "design", name: "Design", summary: "Wireframes, visual design, client sign-off.", startMonth: "", endMonth: "" },
            { key: "build", name: "Build", summary: "Development, content entry, integrations.", startMonth: "", endMonth: "" },
            { key: "qa-launch", name: "QA & launch", summary: "Testing, fixes, go-live and handover.", startMonth: "", endMonth: "" },
        ],
    },
    {
        name: "Brand launch",
        description: "Identity work first, then rollout across channels.",
        phases: [
            { key: "discovery", name: "Discovery", summary: "Brand audit, positioning, audience.", startMonth: "", endMonth: "" },
            { key: "identity", name: "Identity", summary: "Logo, visual system, brand kit.", startMonth: "", endMonth: "" },
            { key: "rollout", name: "Rollout", summary: "Launch content, campaigns and collateral.", startMonth: "", endMonth: "" },
        ],
    },
];

export function normalizePhaseTemplate(raw: Partial<PhaseTemplate> & { id: string }): PhaseTemplate {
    const now = new Date().toISOString();
    return {
        id: raw.id,
        name: String(raw.name ?? "").trim(),
        description: String(raw.description ?? ""),
        phases: normalizePhases(raw.phases),
        isDefault: Boolean(raw.isDefault),
        createdAt: raw.createdAt ?? now,
        updatedAt: raw.updatedAt ?? now,
    };
}

export function buildPhaseTemplate(input: CreatePhaseTemplateInput): PhaseTemplate {
    const now = new Date().toISOString();
    return normalizePhaseTemplate({
        id: randomUUID(),
        name: input.name,
        description: input.description ?? "",
        phases: input.phases ?? [],
        isDefault: input.isDefault ?? false,
        createdAt: now,
        updatedAt: now,
    });
}

export function sortPhaseTemplates(list: PhaseTemplate[]): PhaseTemplate[] {
    return [...list].sort((a, b) => {
        if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
}

async function ensureDir() {
    await fs.mkdir(DIR, { recursive: true });
}
function fileFor(id: string) {
    return path.join(DIR, `${id}.json`);
}
async function write(t: PhaseTemplate) {
    await fs.writeFile(fileFor(t.id), JSON.stringify(t, null, 2), "utf8");
}

export async function createPhaseTemplate(input: CreatePhaseTemplateInput): Promise<PhaseTemplate> {
    await ensureDir();
    const t = buildPhaseTemplate(input);
    if (t.isDefault) await clearDefault();
    await write(t);
    return t;
}

export async function listPhaseTemplates(): Promise<PhaseTemplate[]> {
    await ensureDir();
    const entries = await fs.readdir(DIR);
    const out: PhaseTemplate[] = [];
    for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const raw = await fs.readFile(path.join(DIR, entry), "utf8");
        out.push(normalizePhaseTemplate(JSON.parse(raw)));
    }
    return sortPhaseTemplates(out);
}

export async function getPhaseTemplateById(id: string): Promise<PhaseTemplate | null> {
    try {
        const raw = await fs.readFile(fileFor(id), "utf8");
        return normalizePhaseTemplate(JSON.parse(raw));
    } catch {
        return null;
    }
}

export async function getDefaultPhaseTemplate(): Promise<PhaseTemplate | null> {
    const all = await listPhaseTemplates();
    return all.find((t) => t.isDefault) ?? null;
}

async function clearDefault() {
    const all = await listPhaseTemplates();
    for (const t of all) {
        if (t.isDefault) await write({ ...t, isDefault: false, updatedAt: new Date().toISOString() });
    }
}

export async function updatePhaseTemplate(id: string, patch: PhaseTemplatePatch): Promise<PhaseTemplate> {
    const existing = await getPhaseTemplateById(id);
    if (!existing) throw new Error(`Phase template ${id} not found`);
    if (patch.isDefault) await clearDefault();
    const updated = normalizePhaseTemplate({ ...existing, ...patch, id, updatedAt: new Date().toISOString() });
    await write(updated);
    return updated;
}

export async function deletePhaseTemplate(id: string): Promise<void> {
    try {
        await fs.unlink(fileFor(id));
    } catch {
        // ignore
    }
}
