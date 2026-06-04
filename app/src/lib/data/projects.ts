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

export {
    PROJECT_PHASES,
    PROJECT_STATUSES,
} from "@/lib/dev-store/projects";
export type {
    Project,
    ProjectDeliverable,
    ProjectPhase,
    ProjectSignoff,
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
        onboardingSubmissionId: row.onboarding_submission_id,
        notes: row.notes,
        tasks: (row.tasks ?? []) as ProjectTask[],
        deliverables: (row.deliverables ?? []) as ProjectDeliverable[],
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
        onboarding_submission_id: p.onboardingSubmissionId,
        notes: p.notes,
        tasks: p.tasks,
        deliverables: p.deliverables,
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
    if (patch.onboardingSubmissionId !== undefined)
        out.onboarding_submission_id = patch.onboardingSubmissionId;
    if (patch.notes !== undefined) out.notes = patch.notes;
    if (patch.tasks !== undefined) out.tasks = patch.tasks;
    if (patch.deliverables !== undefined) out.deliverables = patch.deliverables;
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
        onboardingSubmissionId: input.onboardingSubmissionId ?? null,
        notes: "",
        tasks: [],
        deliverables: [],
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
