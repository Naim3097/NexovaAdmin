/**
 * DEV-ONLY local file store for project templates.
 * Replaced by Supabase `project_templates` once provisioned.
 *
 * A project template is a saved starting point for a project: how many
 * months, what gets delivered in them (the same deliverable rows a project
 * has) and which phase template lays out the timeline. Nothing else: no
 * price, no people, no client. "New project" offers Custom or a template;
 * picking one prefills the form and the AM edits from there. A template
 * change never touches projects already created from it.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { devDataRoot } from "@/lib/dev-store/root";
import { randomUUID } from "node:crypto";
import { normalizeRequirements, type Requirement } from "@/lib/dev-store/contracts";
import { DEFAULT_TEMPLATE_PHASES, normalizeTemplatePhases, type TemplatePhase } from "@/lib/contracts/phases";

const ROOT = devDataRoot();
const DIR = path.join(ROOT, "project-templates");

export const MIN_TEMPLATE_MONTHS = 1;
export const MAX_TEMPLATE_MONTHS = 36;

export type ProjectTemplate = {
    id: string;
    name: string;
    /** One line on what the template is for. */
    description: string;
    /** Term in months; the project gets start + months as its end date. */
    months: number;
    /** What gets delivered: free rows (type, name, how many, a week / a month / once, channel). */
    requirements: Requirement[];
    /** The timeline: phases with a name, the month they start in and how many months they run. */
    phases: TemplatePhase[];
    createdAt: string;
    updatedAt: string;
};

export type CreateProjectTemplateInput = {
    name: string;
    description?: string;
    months?: number;
    requirements?: Requirement[];
    phases?: TemplatePhase[];
};

export type ProjectTemplatePatch = Partial<Omit<ProjectTemplate, "id" | "createdAt">>;

export function clampMonths(n: unknown): number {
    const v = Math.round(Number(n));
    if (!Number.isFinite(v)) return 3;
    return Math.min(MAX_TEMPLATE_MONTHS, Math.max(MIN_TEMPLATE_MONTHS, v));
}

/** Starter templates seeded on a fresh install (Settings → Templates → "Add Starter, Growth, Scale"). */
export const STARTER_PROJECT_TEMPLATES: CreateProjectTemplateInput[] = [
    {
        name: "Starter",
        description: "Keep a brand active: statics every week and a video every week.",
        months: 3,
        requirements: [
            { type: "static", name: "Instagram static", count: 3, per: "week", channel: "Instagram" },
            { type: "video", name: "Instagram reel", count: 1, per: "week", channel: "Instagram" },
        ],
        phases: [
            { key: "kickoff", name: "Kickoff", summary: "Onboarding, access, strategy sign-off.", fromMonth: 1, months: 1 },
            { key: "production", name: "Production", summary: "The weekly posts.", fromMonth: 1, months: 3 },
            { key: "review", name: "Review", summary: "Performance review and the next plan.", fromMonth: 3, months: 1 },
        ],
    },
    {
        name: "Growth",
        description: "Content and search together, with a site to land on.",
        months: 3,
        requirements: [
            { type: "static", name: "Awareness static on Instagram", count: 3, per: "week", channel: "Instagram" },
            { type: "video", name: "Awareness reel", count: 1, per: "week", channel: "Instagram" },
            { type: "seo", name: "Blog article", count: 2, per: "month", channel: "Blog" },
            { type: "website", name: "Website", count: 1, per: "once", channel: "Website" },
        ],
        phases: [
            { key: "kickoff", name: "Kickoff", summary: "Onboarding, brand audit, access, strategy sign-off.", fromMonth: 1, months: 1 },
            { key: "foundation", name: "Foundation", summary: "The website and account setup.", fromMonth: 1, months: 1 },
            { key: "production", name: "Production", summary: "Weekly posts and monthly articles.", fromMonth: 1, months: 3 },
            { key: "review", name: "Review", summary: "Performance review, renewal proposal, next plan.", fromMonth: 3, months: 1 },
        ],
    },
    {
        name: "Scale",
        description: "Full engine: more posts, a campaign a month, search, and a brand refresh up front.",
        months: 6,
        requirements: [
            { type: "static", name: "Instagram static", count: 8, per: "month", channel: "Instagram" },
            { type: "video", name: "Instagram reel", count: 4, per: "month", channel: "Instagram" },
            { type: "campaign", name: "Lead-gen campaign", count: 1, per: "month", channel: "Meta" },
            { type: "seo", name: "Blog article", count: 2, per: "month", channel: "Blog" },
            { type: "custom", name: "Brand refresh", count: 1, per: "once", channel: "Brand" },
        ],
        phases: [
            { key: "kickoff", name: "Kickoff", summary: "Onboarding, brand audit, access, strategy sign-off.", fromMonth: 1, months: 1 },
            { key: "foundation", name: "Foundation", summary: "Brand refresh and account setup.", fromMonth: 1, months: 2 },
            { key: "production", name: "Production", summary: "Monthly posts, campaigns and articles.", fromMonth: 1, months: 6 },
            { key: "review", name: "Review", summary: "Performance review, renewal proposal, next plan.", fromMonth: 6, months: 1 },
        ],
    },
];

export function normalizeProjectTemplate(raw: Partial<ProjectTemplate> & { id: string }): ProjectTemplate {
    const now = new Date().toISOString();
    return {
        id: raw.id,
        name: String(raw.name ?? "").trim(),
        description: String(raw.description ?? ""),
        months: clampMonths(raw.months ?? 3),
        requirements: normalizeRequirements(raw.requirements),
        phases: normalizeTemplatePhases(raw.phases),
        createdAt: raw.createdAt ?? now,
        updatedAt: raw.updatedAt ?? now,
    };
}

export function buildProjectTemplate(input: CreateProjectTemplateInput): ProjectTemplate {
    const now = new Date().toISOString();
    return normalizeProjectTemplate({
        id: randomUUID(),
        name: input.name,
        description: input.description ?? "",
        months: input.months ?? 3,
        requirements: input.requirements ?? [],
        phases: input.phases ?? DEFAULT_TEMPLATE_PHASES,
        createdAt: now,
        updatedAt: now,
    });
}

export function sortProjectTemplates(list: ProjectTemplate[]): ProjectTemplate[] {
    return [...list].sort((a, b) => a.months - b.months || a.name.localeCompare(b.name));
}

async function ensureDir() {
    await fs.mkdir(DIR, { recursive: true });
}
function fileFor(id: string) {
    return path.join(DIR, `${id}.json`);
}
async function write(t: ProjectTemplate) {
    await fs.writeFile(fileFor(t.id), JSON.stringify(t, null, 2), "utf8");
}

export async function createProjectTemplate(input: CreateProjectTemplateInput): Promise<ProjectTemplate> {
    await ensureDir();
    const t = buildProjectTemplate(input);
    await write(t);
    return t;
}

export async function listProjectTemplates(): Promise<ProjectTemplate[]> {
    await ensureDir();
    const files = await fs.readdir(DIR);
    const out: ProjectTemplate[] = [];
    for (const f of files) {
        if (!f.endsWith(".json")) continue;
        const raw = JSON.parse(await fs.readFile(path.join(DIR, f), "utf8")) as Partial<ProjectTemplate> & { id: string };
        out.push(normalizeProjectTemplate(raw));
    }
    return sortProjectTemplates(out);
}

export async function getProjectTemplateById(id: string): Promise<ProjectTemplate | null> {
    try {
        const raw = JSON.parse(await fs.readFile(fileFor(id), "utf8")) as Partial<ProjectTemplate> & { id: string };
        return normalizeProjectTemplate(raw);
    } catch {
        return null;
    }
}

export async function updateProjectTemplate(id: string, patch: ProjectTemplatePatch): Promise<ProjectTemplate> {
    const existing = await getProjectTemplateById(id);
    if (!existing) throw new Error(`Account template ${id} not found`);
    const next = normalizeProjectTemplate({ ...existing, ...patch, id, updatedAt: new Date().toISOString() });
    await write(next);
    return next;
}

export async function deleteProjectTemplate(id: string): Promise<void> {
    await fs.rm(fileFor(id), { force: true });
}
