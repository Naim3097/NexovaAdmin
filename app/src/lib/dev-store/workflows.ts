/**
 * DEV-ONLY local file store for workflow template overrides.
 *
 * Defaults live in lib/workflows/defaults.ts. A file here is an OVERRIDE for one
 * service category; absence means "use the code default". This keeps the
 * defaults version-controlled while letting the team customise in Settings.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { SERVICE_CATEGORIES, type ServiceCategory } from "@/lib/dev-store/services";
import {
    DEFAULT_WORKFLOWS,
    defaultTemplate,
    type WorkflowTemplate,
    type WorkflowStageDef,
} from "@/lib/workflows/defaults";

export type { WorkflowTemplate, WorkflowStageDef } from "@/lib/workflows/defaults";

const ROOT = path.join(process.cwd(), ".dev-data");
const DIR = path.join(ROOT, "workflows");

function fileFor(category: ServiceCategory) {
    return path.join(DIR, `${category}.json`);
}

async function readOverride(
    category: ServiceCategory,
): Promise<WorkflowTemplate | null> {
    try {
        const raw = await fs.readFile(fileFor(category), "utf8");
        return JSON.parse(raw) as WorkflowTemplate;
    } catch {
        return null;
    }
}

export async function getTemplate(
    category: ServiceCategory,
): Promise<WorkflowTemplate> {
    return (await readOverride(category)) ?? defaultTemplate(category);
}

export async function listTemplates(): Promise<WorkflowTemplate[]> {
    return Promise.all(
        SERVICE_CATEGORIES.map((c) => getTemplate(c)),
    );
}

export async function updateTemplate(
    category: ServiceCategory,
    input: { name?: string; stages: WorkflowStageDef[] },
): Promise<WorkflowTemplate> {
    await fs.mkdir(DIR, { recursive: true });
    const tpl: WorkflowTemplate = {
        serviceCategory: category,
        name: input.name ?? DEFAULT_WORKFLOWS[category]?.name ?? category,
        stages: input.stages,
    };
    await fs.writeFile(fileFor(category), JSON.stringify(tpl, null, 2), "utf8");
    return tpl;
}

export async function resetTemplate(
    category: ServiceCategory,
): Promise<WorkflowTemplate> {
    try {
        await fs.unlink(fileFor(category));
    } catch {
        // already default
    }
    return defaultTemplate(category);
}
