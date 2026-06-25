/**
 * DEV-ONLY local file store for projects.
 * Replaced by Supabase `projects` table once provisioned.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";

const ROOT = path.join(process.cwd(), ".dev-data");
const PROJECTS_DIR = path.join(ROOT, "projects");

export const PROJECT_STATUSES = [
    "kickoff",
    "in_progress",
    "review",
    "delivered",
    "on_hold",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/**
 * Standard delivery phases. Status (above) is the high-level state; phase is
 * where in the delivery pipeline we are. They overlap deliberately:
 * status answers "is this project moving?", phase answers "what stage?".
 */
export const PROJECT_PHASES = [
    "discovery",
    "design",
    "build",
    "qa",
    "client_review",
    "launch",
    "closed",
] as const;
export type ProjectPhase = (typeof PROJECT_PHASES)[number];

export type ProjectTask = {
    id: string;
    title: string;
    done: boolean;
    assignee: string;
    /** Optional phase tag so tasks group naturally. "" = unassigned. */
    phase: ProjectPhase | "";
    createdAt: string;
};

export type ProjectDeliverable = {
    id: string;
    title: string;
    /** External link (Figma, Notion, repo, drive, etc.). "" if just a note. */
    url: string;
    notes: string;
    /** Phase this deliverable belongs to. */
    phase: ProjectPhase;
    /** ISO timestamp when client approved. null = pending. */
    approvedAt: string | null;
    /** Who marked it approved (free text). */
    approvedBy: string;
    createdAt: string;
};

/**
 * A single stage in a project's delivery pipeline, instantiated (copied) from a
 * workflow template and editable per project. `assignee` is the PIC (a team
 * member name). Exactly the active stage is "active"; earlier ones "done".
 */
export type ProjectStage = {
    id: string;
    label: string;
    ownerRole: string;
    assignee: string;
    state: "pending" | "active" | "done";
    /** Editable deadline for the PIC on this stage (YYYY-MM-DD). "" = none. */
    dueDate: string;
    startedAt: string | null;
    doneAt: string | null;
};

export type ProjectSignoff = {
    /** ISO timestamp the project was formally signed off by the client. */
    signedAt: string | null;
    /** Free text — client name, email, or "verbal via WhatsApp". */
    signedBy: string;
    notes: string;
};

export type Project = {
    id: string;
    name: string;
    clientName: string;
    status: ProjectStatus;
    phase: ProjectPhase;
    /** Service category this project's workflow follows (""=not set yet). */
    serviceCategory: string;
    onboardingSubmissionId: string | null;
    notes: string;
    tasks: ProjectTask[];
    deliverables: ProjectDeliverable[];
    /** Ordered delivery pipeline (the flow guide). [] until a service is set. */
    stages: ProjectStage[];
    signoff: ProjectSignoff;
    /**
     * Random unguessable token for the read-only client portal at /p/<token>.
     * Empty string = portal disabled (revoked or never enabled).
     */
    portalToken: string;
    createdAt: string;
    updatedAt: string;
};

function generatePortalToken(): string {
    // 32 bytes = 64 hex chars = 256 bits of entropy.
    return randomBytes(32).toString("hex");
}

async function ensureDir() {
    await fs.mkdir(PROJECTS_DIR, { recursive: true });
}

function fileFor(id: string) {
    return path.join(PROJECTS_DIR, `${id}.json`);
}

export async function createProject(input: {
    name: string;
    clientName: string;
    onboardingSubmissionId?: string | null;
}): Promise<Project> {
    await ensureDir();
    const now = new Date().toISOString();
    const proj: Project = {
        id: randomUUID(),
        name: input.name,
        clientName: input.clientName,
        status: "kickoff",
        phase: "discovery",
        serviceCategory: "",
        onboardingSubmissionId: input.onboardingSubmissionId ?? null,
        notes: "",
        tasks: [],
        deliverables: [],
        stages: [],
        signoff: { signedAt: null, signedBy: "", notes: "" },
        portalToken: "",
        createdAt: now,
        updatedAt: now,
    };
    await fs.writeFile(fileFor(proj.id), JSON.stringify(proj, null, 2), "utf8");
    return proj;
}

export async function listProjects(): Promise<Project[]> {
    await ensureDir();
    const entries = await fs.readdir(PROJECTS_DIR);
    const out: Project[] = [];
    for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const raw = await fs.readFile(path.join(PROJECTS_DIR, entry), "utf8");
        const proj = JSON.parse(raw) as Project;
        backfill(proj);
        out.push(proj);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function backfill(proj: Project): Project {
    if (Array.isArray(proj.tasks)) {
        proj.tasks = proj.tasks.map((t) => ({
            ...t,
            assignee: t.assignee ?? "",
            phase: (t.phase as ProjectPhase | "" | undefined) ?? "",
        }));
    } else {
        proj.tasks = [];
    }
    if (!Array.isArray(proj.deliverables)) proj.deliverables = [];
    if (!Array.isArray(proj.stages)) proj.stages = [];
    if (typeof proj.serviceCategory !== "string") proj.serviceCategory = "";
    if (!proj.phase) proj.phase = "discovery";
    if (!proj.signoff)
        proj.signoff = { signedAt: null, signedBy: "", notes: "" };
    if (typeof proj.portalToken !== "string") proj.portalToken = "";
    return proj;
}

export async function getProjectById(id: string): Promise<Project | null> {
    try {
        const raw = await fs.readFile(fileFor(id), "utf8");
        const parsed = JSON.parse(raw) as Project;
        backfill(parsed);
        return parsed;
    } catch {
        return null;
    }
}

export async function updateProject(
    id: string,
    patch: Partial<Omit<Project, "id" | "createdAt">>,
): Promise<Project> {
    const existing = await getProjectById(id);
    if (!existing) throw new Error(`Project ${id} not found`);
    const updated: Project = {
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(fileFor(id), JSON.stringify(updated, null, 2), "utf8");
    return updated;
}

export async function deleteProject(id: string): Promise<void> {
    try {
        await fs.unlink(fileFor(id));
    } catch {
        // ignore
    }
}

export async function rotateProjectPortalToken(
    id: string,
): Promise<Project> {
    return updateProject(id, { portalToken: generatePortalToken() });
}

export async function revokeProjectPortalToken(
    id: string,
): Promise<Project> {
    return updateProject(id, { portalToken: "" });
}

export async function getProjectByPortalToken(
    token: string,
): Promise<Project | null> {
    if (!token || token.length < 16) return null;
    const all = await listProjects();
    return all.find((p) => p.portalToken && p.portalToken === token) ?? null;
}

export async function addProjectTask(
    id: string,
    title: string,
    assignee: string = "",
    phase: ProjectPhase | "" = "",
): Promise<Project> {
    const existing = await getProjectById(id);
    if (!existing) throw new Error(`Project ${id} not found`);
    const task: ProjectTask = {
        id: randomUUID(),
        title,
        done: false,
        assignee,
        phase,
        createdAt: new Date().toISOString(),
    };
    return updateProject(id, { tasks: [...existing.tasks, task] });
}

export async function toggleProjectTask(
    id: string,
    taskId: string,
): Promise<Project> {
    const existing = await getProjectById(id);
    if (!existing) throw new Error(`Project ${id} not found`);
    const tasks = existing.tasks.map((t) =>
        t.id === taskId ? { ...t, done: !t.done } : t,
    );
    return updateProject(id, { tasks });
}

export async function deleteProjectTask(
    id: string,
    taskId: string,
): Promise<Project> {
    const existing = await getProjectById(id);
    if (!existing) throw new Error(`Project ${id} not found`);
    return updateProject(id, {
        tasks: existing.tasks.filter((t) => t.id !== taskId),
    });
}

export async function addProjectDeliverable(
    id: string,
    input: {
        title: string;
        url?: string;
        notes?: string;
        phase?: ProjectPhase;
    },
): Promise<Project> {
    const existing = await getProjectById(id);
    if (!existing) throw new Error(`Project ${id} not found`);
    const d: ProjectDeliverable = {
        id: randomUUID(),
        title: input.title,
        url: input.url ?? "",
        notes: input.notes ?? "",
        phase: input.phase ?? existing.phase,
        approvedAt: null,
        approvedBy: "",
        createdAt: new Date().toISOString(),
    };
    return updateProject(id, {
        deliverables: [...existing.deliverables, d],
    });
}

export async function approveProjectDeliverable(
    id: string,
    deliverableId: string,
    approvedBy: string,
): Promise<Project> {
    const existing = await getProjectById(id);
    if (!existing) throw new Error(`Project ${id} not found`);
    const now = new Date().toISOString();
    const deliverables = existing.deliverables.map((d) =>
        d.id === deliverableId
            ? { ...d, approvedAt: now, approvedBy: approvedBy || "client" }
            : d,
    );
    return updateProject(id, { deliverables });
}

export async function unapproveProjectDeliverable(
    id: string,
    deliverableId: string,
): Promise<Project> {
    const existing = await getProjectById(id);
    if (!existing) throw new Error(`Project ${id} not found`);
    const deliverables = existing.deliverables.map((d) =>
        d.id === deliverableId
            ? { ...d, approvedAt: null, approvedBy: "" }
            : d,
    );
    return updateProject(id, { deliverables });
}

export async function deleteProjectDeliverable(
    id: string,
    deliverableId: string,
): Promise<Project> {
    const existing = await getProjectById(id);
    if (!existing) throw new Error(`Project ${id} not found`);
    return updateProject(id, {
        deliverables: existing.deliverables.filter(
            (d) => d.id !== deliverableId,
        ),
    });
}

export async function setProjectPhase(
    id: string,
    phase: ProjectPhase,
): Promise<Project> {
    return updateProject(id, { phase });
}

export async function setProjectSignoff(
    id: string,
    input: { signedBy: string; notes?: string },
): Promise<Project> {
    const existing = await getProjectById(id);
    if (!existing) throw new Error(`Project ${id} not found`);
    const signoff: ProjectSignoff = {
        signedAt: new Date().toISOString(),
        signedBy: input.signedBy,
        notes: input.notes ?? existing.signoff.notes,
    };
    return updateProject(id, { signoff, status: "delivered", phase: "closed" });
}

export async function clearProjectSignoff(id: string): Promise<Project> {
    return updateProject(id, {
        signoff: { signedAt: null, signedBy: "", notes: "" },
    });
}
