"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
    addProjectDeliverable,
    addProjectTask,
    approveProjectDeliverable,
    clearProjectSignoff,
    createProject,
    deleteProject,
    deleteProjectDeliverable,
    deleteProjectTask,
    PROJECT_PHASES,
    PROJECT_STATUSES,
    revokeProjectPortalToken,
    rotateProjectPortalToken,
    setProjectPhase,
    setProjectSignoff,
    toggleProjectTask,
    unapproveProjectDeliverable,
    updateProject,
    instantiateProjectStages,
    advanceProjectStage,
    setProjectStageAssignee,
    updateProjectStage,
    addProjectStage,
    removeProjectStage,
    moveProjectStage,
    type ProjectPhase,
    type ProjectStatus,
} from "@/lib/data/projects";
import { getProjectById } from "@/lib/data/projects";
import { notify } from "@/lib/data/notifications";
import { diffFields, recordAudit } from "@/lib/data/audit";
import {
    SERVICE_CATEGORIES,
    type ServiceCategory,
} from "@/lib/dev-store/services";

function asServiceCategory(v: FormDataEntryValue | null): ServiceCategory {
    const s = String(v ?? "").trim();
    return (SERVICE_CATEGORIES as readonly string[]).includes(s)
        ? (s as ServiceCategory)
        : "other";
}

function asStatus(v: FormDataEntryValue | null): ProjectStatus {
    const s = String(v ?? "");
    return (PROJECT_STATUSES as readonly string[]).includes(s)
        ? (s as ProjectStatus)
        : "kickoff";
}

function asPhase(v: FormDataEntryValue | null): ProjectPhase {
    const s = String(v ?? "");
    return (PROJECT_PHASES as readonly string[]).includes(s)
        ? (s as ProjectPhase)
        : "discovery";
}

function asPhaseOrEmpty(v: FormDataEntryValue | null): ProjectPhase | "" {
    const s = String(v ?? "").trim();
    if (!s || s === "none") return "";
    return (PROJECT_PHASES as readonly string[]).includes(s)
        ? (s as ProjectPhase)
        : "";
}

export async function createProjectAction(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim();
    const clientName = String(formData.get("clientName") ?? "").trim();
    if (!name || !clientName) return;
    const proj = await createProject({ name, clientName });
    // Generate the delivery pipeline from the chosen service's workflow.
    const category = asServiceCategory(formData.get("serviceCategory"));
    await instantiateProjectStages(proj.id, category).catch(() => {});
    revalidatePath("/projects");
    revalidatePath("/dashboard");
    redirect(`/projects/${proj.id}`);
}

export async function updateProjectAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const before = await getProjectById(id);
    await updateProject(id, {
        name: String(formData.get("name") ?? "").trim(),
        clientName: String(formData.get("clientName") ?? "").trim(),
        notes: String(formData.get("notes") ?? "").trim(),
    });
    if (before) {
        const after = (await getProjectById(id)) ?? before;
        const changes = diffFields(
            before as unknown as Record<string, unknown>,
            after as unknown as Record<string, unknown>,
            ["name", "clientName", "notes"],
        );
        if (changes.length > 0) {
            await recordAudit({
                entity: "project",
                entityId: id,
                kind: "update",
                summary: `Project updated (${changes.length} field${changes.length === 1 ? "" : "s"})`,
                changes,
            });
        }
    }
    revalidatePath(`/projects/${id}`);
    revalidatePath("/projects");
}

export async function setProjectStatusAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const status = asStatus(formData.get("status"));
    const before = await getProjectById(id);
    await updateProject(id, { status });
    if (before && before.status !== status) {
        await recordAudit({
            entity: "project",
            entityId: id,
            kind: "status",
            summary: `Status: ${before.status} → ${status}`,
            changes: [{ field: "status", before: before.status, after: status }],
        });
    }
    revalidatePath(`/projects/${id}`);
    revalidatePath("/projects");
    revalidatePath("/dashboard");
}

export async function deleteProjectAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await deleteProject(id);
    revalidatePath("/projects");
    revalidatePath("/dashboard");
    redirect("/projects");
}

// ---------------------------------------------------------------------------
// Delivery stages (the flow pipeline)
// ---------------------------------------------------------------------------

function revalidateProject(id: string) {
    revalidatePath(`/projects/${id}`);
    revalidatePath("/projects");
}

/** Pick / change a project's service → (re)generate its stage pipeline. */
export async function setProjectServiceAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const category = asServiceCategory(formData.get("serviceCategory"));
    await instantiateProjectStages(id, category);
    await recordAudit({
        entity: "project",
        entityId: id,
        kind: "update",
        summary: `Workflow set to "${category}" — pipeline generated`,
    });
    revalidateProject(id);
}

/** Mark the active stage done, activate the next, and ping the next PIC. */
export async function advanceStageAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const proj = await advanceProjectStage(id);
    const active = proj.stages.find((s) => s.state === "active");
    const allDone =
        proj.stages.length > 0 && proj.stages.every((s) => s.state === "done");

    if (active) {
        const who = active.assignee || active.ownerRole || "the team";
        await notify({
            kind: "stage_advanced",
            title: `${proj.name}: ${active.label} is now active`,
            body: `${who}, you're up next.`,
            link: `/projects/${id}`,
        });
    } else if (allDone) {
        await notify({
            kind: "stage_advanced",
            title: `${proj.name}: all stages complete`,
            body: "Ready for sign-off.",
            link: `/projects/${id}`,
        });
    }
    await recordAudit({
        entity: "project",
        entityId: id,
        kind: "status",
        summary: active
            ? `Stage advanced → ${active.label}`
            : "Final stage completed",
    });
    revalidateProject(id);
    revalidatePath("/dashboard");
}

export async function assignStagePicAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const stageId = String(formData.get("stageId") ?? "");
    if (!id || !stageId) return;
    const raw = String(formData.get("assignee") ?? "").trim();
    await setProjectStageAssignee(id, stageId, raw === "none" ? "" : raw);
    revalidateProject(id);
}

export async function updateStageAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const stageId = String(formData.get("stageId") ?? "");
    if (!id || !stageId) return;
    const patch: { label?: string; ownerRole?: string; assignee?: string } = {};
    const label = String(formData.get("label") ?? "").trim();
    const ownerRole = String(formData.get("ownerRole") ?? "").trim();
    if (label) patch.label = label;
    if (ownerRole) patch.ownerRole = ownerRole;
    // assignee may legitimately be cleared → handle "none" sentinel explicitly.
    const assigneeRaw = formData.get("assignee");
    if (assigneeRaw !== null) {
        const a = String(assigneeRaw).trim();
        patch.assignee = a === "none" ? "" : a;
    }
    await updateProjectStage(id, stageId, patch);
    revalidateProject(id);
}

export async function addStageAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const label = String(formData.get("label") ?? "").trim();
    if (!label) return;
    const ownerRole = String(formData.get("ownerRole") ?? "").trim() || "Other";
    await addProjectStage(id, { label, ownerRole });
    revalidateProject(id);
}

export async function removeStageAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const stageId = String(formData.get("stageId") ?? "");
    if (!id || !stageId) return;
    await removeProjectStage(id, stageId);
    revalidateProject(id);
}

export async function moveStageAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const stageId = String(formData.get("stageId") ?? "");
    const dir = String(formData.get("dir") ?? "");
    if (!id || !stageId || (dir !== "up" && dir !== "down")) return;
    await moveProjectStage(id, stageId, dir);
    revalidateProject(id);
}

export async function addProjectTaskAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const title = String(formData.get("title") ?? "").trim();
    if (!id || !title) return;
    const rawAssignee = String(formData.get("assignee") ?? "").trim();
    const assignee = rawAssignee === "none" ? "" : rawAssignee;
    const phase = asPhaseOrEmpty(formData.get("phase"));
    await addProjectTask(id, title, assignee, phase);
    revalidatePath(`/projects/${id}`);
}

export async function toggleProjectTaskAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const taskId = String(formData.get("taskId") ?? "");
    if (!id || !taskId) return;
    await toggleProjectTask(id, taskId);
    revalidatePath(`/projects/${id}`);
}

export async function deleteProjectTaskAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const taskId = String(formData.get("taskId") ?? "");
    if (!id || !taskId) return;
    await deleteProjectTask(id, taskId);
    revalidatePath(`/projects/${id}`);
}

export async function setProjectPhaseAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const phase = asPhase(formData.get("phase"));
    const before = await getProjectById(id);
    await setProjectPhase(id, phase);
    if (before && before.phase !== phase) {
        await recordAudit({
            entity: "project",
            entityId: id,
            kind: "update",
            summary: `Phase: ${before.phase} → ${phase}`,
            changes: [{ field: "phase", before: before.phase, after: phase }],
        });
    }
    revalidatePath(`/projects/${id}`);
    revalidatePath("/projects");
    revalidatePath("/dashboard");
}

export async function addProjectDeliverableAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const title = String(formData.get("title") ?? "").trim();
    if (!id || !title) return;
    await addProjectDeliverable(id, {
        title,
        url: String(formData.get("url") ?? "").trim(),
        notes: String(formData.get("notes") ?? "").trim(),
        phase: asPhase(formData.get("phase")),
    });
    revalidatePath(`/projects/${id}`);
}

export async function approveDeliverableAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const deliverableId = String(formData.get("deliverableId") ?? "");
    if (!id || !deliverableId) return;
    const approvedBy = String(formData.get("approvedBy") ?? "").trim();
    await approveProjectDeliverable(id, deliverableId, approvedBy);
    const proj = await getProjectById(id);
    const deliverable = proj?.deliverables.find((d) => d.id === deliverableId);
    if (proj && deliverable) {
        await notify({
            kind: "deliverable_approved",
            title: `Deliverable approved: ${deliverable.title}`,
            body: `${proj.clientName} · ${proj.name}${approvedBy ? ` · by ${approvedBy}` : ""}`,
            link: `/projects/${id}`,
        });
    }
    revalidatePath(`/projects/${id}`);
}

export async function unapproveDeliverableAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const deliverableId = String(formData.get("deliverableId") ?? "");
    if (!id || !deliverableId) return;
    await unapproveProjectDeliverable(id, deliverableId);
    revalidatePath(`/projects/${id}`);
}

export async function deleteDeliverableAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const deliverableId = String(formData.get("deliverableId") ?? "");
    if (!id || !deliverableId) return;
    await deleteProjectDeliverable(id, deliverableId);
    revalidatePath(`/projects/${id}`);
}

export async function signoffProjectAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const signedBy = String(formData.get("signedBy") ?? "").trim();
    if (!id || !signedBy) return;
    await setProjectSignoff(id, {
        signedBy,
        notes: String(formData.get("notes") ?? "").trim(),
    });
    const proj = await getProjectById(id);
    if (proj) {
        await notify({
            kind: "project_signoff",
            title: `Project signed off: ${proj.name}`,
            body: `${proj.clientName} · by ${signedBy}`,
            link: `/projects/${id}`,
        });
    }
    revalidatePath(`/projects/${id}`);
    revalidatePath("/projects");
    revalidatePath("/dashboard");
}

export async function clearSignoffAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await clearProjectSignoff(id);
    revalidatePath(`/projects/${id}`);
    revalidatePath("/projects");
    revalidatePath("/dashboard");
}

export async function rotateProjectPortalTokenAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await rotateProjectPortalToken(id);
    revalidatePath(`/projects/${id}`);
}

export async function revokeProjectPortalTokenAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await revokeProjectPortalToken(id);
    revalidatePath(`/projects/${id}`);
}
