/**
 * Projects data adapter.
 *
 * Five primitives (`createProject`, `listProjects`, `getProjectById`,
 * `updateProject`, `deleteProject`) dispatch via `isSupabaseEnabled("projects")`.
 * All higher-level helpers (tasks, deliverables, signoff, portal token) are
 * implemented locally and call the dispatched primitives, so they work in
 * either backend.
 *
 * `tasks` / `deliverables` / `signoff` ride along as JSONB columns to mirror
 * the dev-store shape exactly — no row explosion for small per-project lists.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import type { Database, ProjectRow } from "@/lib/supabase/types";
import { isSupabaseEnabled } from "@/lib/data/flag";
import * as devProjects from "@/lib/dev-store/projects";
import { getTemplate } from "@/lib/data/workflows";
import { listTeamMembers } from "@/lib/data/team";
import type { ServiceCategory } from "@/lib/dev-store/services";

export {
    PROJECT_PHASES,
    PROJECT_STATUSES,
} from "@/lib/dev-store/projects";
export type {
    Project,
    ProjectDeliverable,
    ProjectPhase,
    ProjectSignoff,
    ProjectStage,
    ProjectStatus,
    ProjectTask,
} from "@/lib/dev-store/projects";

// Local aliases — kept distinct from the re-exports above to avoid TS2456
// circular alias confusion. Only used inside this file.
type Project = devProjects.Project;
type ProjectPhase = devProjects.ProjectPhase;
type ProjectStatus = devProjects.ProjectStatus;
type ProjectTask = devProjects.ProjectTask;
type ProjectDeliverable = devProjects.ProjectDeliverable;
type ProjectSignoff = devProjects.ProjectSignoff;
type ProjectStage = devProjects.ProjectStage;
type UpdatePatch = Partial<Omit<Project, "id" | "createdAt">>;

type ProjectInsert = Database["public"]["Tables"]["projects"]["Insert"];
type ProjectUpdate = Database["public"]["Tables"]["projects"]["Update"];

const TABLE = "projects" as const;

function generatePortalToken(): string {
    return randomBytes(32).toString("hex");
}

function rowToProject(row: ProjectRow): Project {
    return {
        id: row.id,
        name: row.name,
        clientName: row.client_name,
        status: row.status as ProjectStatus,
        phase: row.phase as ProjectPhase,
        serviceCategory: row.service_category ?? "",
        onboardingSubmissionId: row.onboarding_submission_id,
        notes: row.notes,
        tasks: (row.tasks ?? []) as ProjectTask[],
        deliverables: (row.deliverables ?? []) as ProjectDeliverable[],
        stages: (row.stages ?? []) as ProjectStage[],
        signoff:
            (row.signoff as ProjectSignoff | null) ?? {
                signedAt: null,
                signedBy: "",
                notes: "",
            },
        portalToken: row.portal_token,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function projectToInsert(p: Project): ProjectInsert {
    return {
        id: p.id,
        name: p.name,
        client_name: p.clientName,
        status: p.status,
        phase: p.phase,
        service_category: p.serviceCategory,
        onboarding_submission_id: p.onboardingSubmissionId,
        notes: p.notes,
        tasks: p.tasks,
        deliverables: p.deliverables,
        stages: p.stages,
        signoff: p.signoff,
        portal_token: p.portalToken,
        created_at: p.createdAt,
        updated_at: p.updatedAt,
    };
}

function patchToUpdate(patch: UpdatePatch): ProjectUpdate {
    const out: ProjectUpdate = {};
    if (patch.name !== undefined) out.name = patch.name;
    if (patch.clientName !== undefined) out.client_name = patch.clientName;
    if (patch.status !== undefined) out.status = patch.status;
    if (patch.phase !== undefined) out.phase = patch.phase;
    if (patch.serviceCategory !== undefined)
        out.service_category = patch.serviceCategory;
    if (patch.onboardingSubmissionId !== undefined)
        out.onboarding_submission_id = patch.onboardingSubmissionId;
    if (patch.notes !== undefined) out.notes = patch.notes;
    if (patch.tasks !== undefined) out.tasks = patch.tasks;
    if (patch.deliverables !== undefined) out.deliverables = patch.deliverables;
    if (patch.stages !== undefined) out.stages = patch.stages;
    if (patch.signoff !== undefined) out.signoff = patch.signoff;
    if (patch.portalToken !== undefined) out.portal_token = patch.portalToken;
    if (patch.updatedAt !== undefined) out.updated_at = patch.updatedAt;
    return out;
}

// ---------------------------------------------------------------------------
// Core CRUD primitives — dispatch via flag
// ---------------------------------------------------------------------------

export async function createProject(input: {
    name: string;
    clientName: string;
    onboardingSubmissionId?: string | null;
}): Promise<Project> {
    if (!isSupabaseEnabled("projects")) return devProjects.createProject(input);

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
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .insert(projectToInsert(proj))
        .select("*")
        .single();
    if (error) throw new Error(`createProject: ${error.message}`);
    return rowToProject(data as ProjectRow);
}

export async function listProjects(): Promise<Project[]> {
    if (!isSupabaseEnabled("projects")) return devProjects.listProjects();
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .order("created_at", { ascending: false });
    if (error) throw new Error(`listProjects: ${error.message}`);
    return (data as ProjectRow[]).map(rowToProject);
}

export async function getProjectById(id: string): Promise<Project | null> {
    if (!isSupabaseEnabled("projects")) return devProjects.getProjectById(id);
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("id", id)
        .maybeSingle();
    if (error) throw new Error(`getProjectById: ${error.message}`);
    return data ? rowToProject(data as ProjectRow) : null;
}

export async function updateProject(
    id: string,
    patch: UpdatePatch,
): Promise<Project> {
    if (!isSupabaseEnabled("projects")) return devProjects.updateProject(id, patch);
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .update(patchToUpdate(patch))
        .eq("id", id)
        .select("*")
        .single();
    if (error) throw new Error(`updateProject: ${error.message}`);
    return rowToProject(data as ProjectRow);
}

export async function deleteProject(id: string): Promise<void> {
    if (!isSupabaseEnabled("projects")) return devProjects.deleteProject(id);
    const sb = createServiceClient();
    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`deleteProject: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Helpers — backend-agnostic; build on the dispatched primitives above.
// Same names + signatures as src/lib/dev-store/projects.ts.
// ---------------------------------------------------------------------------

export async function getProjectByPortalToken(
    token: string,
): Promise<Project | null> {
    if (!token || token.length < 16) return null;
    if (!isSupabaseEnabled("projects")) {
        return devProjects.getProjectByPortalToken(token);
    }
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("portal_token", token)
        .maybeSingle();
    if (error) throw new Error(`getProjectByPortalToken: ${error.message}`);
    return data ? rowToProject(data as ProjectRow) : null;
}

export async function rotateProjectPortalToken(id: string): Promise<Project> {
    return updateProject(id, { portalToken: generatePortalToken() });
}

export async function revokeProjectPortalToken(id: string): Promise<Project> {
    return updateProject(id, { portalToken: "" });
}

export async function addProjectTask(
    id: string,
    title: string,
    assignee = "",
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

export async function setProjectTaskAssignee(
    id: string,
    taskId: string,
    assignee: string,
): Promise<Project> {
    const existing = await getProjectById(id);
    if (!existing) throw new Error(`Project ${id} not found`);
    if (!existing.tasks.some((t) => t.id === taskId))
        throw new Error(`Task ${taskId} not found on project ${id}`);
    const tasks = existing.tasks.map((t) =>
        t.id === taskId ? { ...t, assignee } : t,
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

// ---------------------------------------------------------------------------
// Delivery stages (the per-project flow pipeline)
// ---------------------------------------------------------------------------

/**
 * Build a fresh ordered pipeline for `category` from its template, auto-assigning
 * each stage's PIC to the first active member of the owner role. First stage is
 * `active`, rest `pending`. Replaces any existing stages.
 */
export async function instantiateProjectStages(
    id: string,
    category: ServiceCategory,
): Promise<Project> {
    const [tpl, team] = await Promise.all([
        getTemplate(category),
        listTeamMembers().catch(() => []),
    ]);
    const picFor = (role: string) =>
        team.find((m) => m.active && m.role === role)?.name ?? "";

    const now = new Date().toISOString();
    const stages: ProjectStage[] = tpl.stages.map((s, i) => ({
        id: randomUUID(),
        label: s.label,
        ownerRole: s.ownerRole,
        assignee: picFor(s.ownerRole),
        state: i === 0 ? "active" : "pending",
        dueDate: "",
        startedAt: i === 0 ? now : null,
        doneAt: null,
    }));
    return updateProject(id, { serviceCategory: category, stages });
}

/** Mark the active stage done and activate the next pending one (if any). */
export async function advanceProjectStage(id: string): Promise<Project> {
    const existing = await getProjectById(id);
    if (!existing) throw new Error(`Project ${id} not found`);
    const now = new Date().toISOString();
    const stages = existing.stages.map((s) => ({ ...s }));
    const activeIdx = stages.findIndex((s) => s.state === "active");
    if (activeIdx === -1) {
        // Nothing active — activate the first pending if present.
        const firstPending = stages.findIndex((s) => s.state === "pending");
        if (firstPending !== -1) {
            stages[firstPending].state = "active";
            stages[firstPending].startedAt = now;
        }
        return updateProject(id, { stages });
    }
    stages[activeIdx].state = "done";
    stages[activeIdx].doneAt = now;
    const next = stages.findIndex(
        (s, i) => i > activeIdx && s.state === "pending",
    );
    if (next !== -1) {
        stages[next].state = "active";
        stages[next].startedAt = now;
    }
    return updateProject(id, { stages });
}

function patchStage(
    stages: ProjectStage[],
    stageId: string,
    patch: Partial<ProjectStage>,
): ProjectStage[] {
    return stages.map((s) => (s.id === stageId ? { ...s, ...patch } : s));
}

export async function setProjectStageAssignee(
    id: string,
    stageId: string,
    assignee: string,
): Promise<Project> {
    const existing = await getProjectById(id);
    if (!existing) throw new Error(`Project ${id} not found`);
    return updateProject(id, {
        stages: patchStage(existing.stages, stageId, { assignee }),
    });
}

export async function updateProjectStage(
    id: string,
    stageId: string,
    patch: {
        label?: string;
        ownerRole?: string;
        assignee?: string;
        dueDate?: string;
    },
): Promise<Project> {
    const existing = await getProjectById(id);
    if (!existing) throw new Error(`Project ${id} not found`);
    return updateProject(id, {
        stages: patchStage(existing.stages, stageId, patch),
    });
}

export async function addProjectStage(
    id: string,
    input: { label: string; ownerRole?: string; assignee?: string },
): Promise<Project> {
    const existing = await getProjectById(id);
    if (!existing) throw new Error(`Project ${id} not found`);
    const stage: ProjectStage = {
        id: randomUUID(),
        label: input.label,
        ownerRole: input.ownerRole ?? "Other",
        assignee: input.assignee ?? "",
        // New stage is pending unless there's no active stage at all.
        state: existing.stages.some((s) => s.state === "active")
            ? "pending"
            : "active",
        dueDate: "",
        startedAt: null,
        doneAt: null,
    };
    return updateProject(id, { stages: [...existing.stages, stage] });
}

export async function removeProjectStage(
    id: string,
    stageId: string,
): Promise<Project> {
    const existing = await getProjectById(id);
    if (!existing) throw new Error(`Project ${id} not found`);
    let stages = existing.stages.filter((s) => s.id !== stageId);
    // Keep exactly one active stage: if we removed it, activate the first pending.
    if (!stages.some((s) => s.state === "active")) {
        const firstPending = stages.findIndex((s) => s.state === "pending");
        if (firstPending !== -1) {
            stages = stages.map((s, i) =>
                i === firstPending
                    ? { ...s, state: "active", startedAt: new Date().toISOString() }
                    : s,
            );
        }
    }
    return updateProject(id, { stages });
}

export async function moveProjectStage(
    id: string,
    stageId: string,
    dir: "up" | "down",
): Promise<Project> {
    const existing = await getProjectById(id);
    if (!existing) throw new Error(`Project ${id} not found`);
    const stages = [...existing.stages];
    const idx = stages.findIndex((s) => s.id === stageId);
    if (idx === -1) return existing;
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= stages.length) return existing;
    [stages[idx], stages[swap]] = [stages[swap], stages[idx]];
    return updateProject(id, { stages });
}
