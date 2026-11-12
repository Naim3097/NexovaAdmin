"use server";

/**
 * Authenticated client-portal actions. Authority comes from the signed-in user
 * resolved to their client via getCurrentClient() (clients.user_id) — NOT a
 * token. The client can only ever act on their own content.
 */
import { revalidatePath } from "next/cache";
import { getCurrentClient } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
    approveContent,
    createContentRequest,
    getContentPostById,
    listContentPosts,
    requestChanges,
    visualsUsed,
} from "@/lib/data/content";
import { getContractById, listContracts } from "@/lib/data/contracts";
import { clientContentQuota } from "@/lib/clients/quota";
import { getWorkById, updateWork } from "@/lib/data/works";
import { recordAudit } from "@/lib/data/audit";
import { notify } from "@/lib/data/notifications";
import { members } from "@/lib/works/helpers";
import { clientActorName, resolveActingClient } from "@/lib/portal/resolve-client";
import { syncLinkedContent, syncTaskForPost } from "@/lib/works/sync";

/**
 * Turn uploaded reference paths (from the form's hidden input) into public
 * URLs. Only accepts objects under the signed prefix for THIS client —
 * anything else is dropped.
 */
function referenceUrls(raw: FormDataEntryValue | null, clientId: string): string[] {
    if (!raw) return [];
    let paths: unknown;
    try {
        paths = JSON.parse(String(raw));
    } catch {
        return [];
    }
    if (!Array.isArray(paths)) return [];
    const prefix = `refs/${clientId}/`;
    const valid = paths.filter(
        (p): p is string => typeof p === "string" && p.startsWith(prefix),
    );
    if (valid.length === 0) return [];
    const sb = createServiceClient();
    return valid.map(
        (p) => sb.storage.from("content-assets").getPublicUrl(p).data.publicUrl,
    );
}

export type PortalCreateState = { ok: boolean; message?: string };

function currentMonth() {
    return new Date().toISOString().slice(0, 7); // YYYY-MM
}

/** Confirm the signed-in client owns this content item before any review action. */
async function ownContent(contentId: string) {
    const client = await getCurrentClient();
    if (!client) return null;
    const post = await getContentPostById(contentId);
    if (
        !post ||
        post.clientName.trim().toLowerCase() !== client.name.trim().toLowerCase()
    ) {
        return null;
    }
    return { client, post };
}

/** Logged-in client approves the current draft. */
export async function portalApproveAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const owned = await ownContent(id);
    if (!owned) return;
    const by = owned.client.contactName || owned.client.name;
    await approveContent({ id, by });
    await syncTaskForPost(id, "approved", `${by} (client, portal)`, "");
    revalidatePath("/portal");
    revalidatePath("/portal/approvals");
    revalidatePath("/works");
    revalidatePath("/portal/content");
    revalidatePath("/static-posts", "layout");
    revalidatePath("/video-posts", "layout");
    revalidatePath("/dashboard");
}

/** Logged-in client requests changes on the current draft (optional image). */
export async function portalRequestChangesAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const body = String(formData.get("body") ?? "").trim();
    if (!id || !body) return;
    const owned = await ownContent(id);
    if (!owned) return;
    const [fileUrl] = referenceUrls(formData.get("refPaths"), owned.client.id);
    await requestChanges({ id, body, fileUrl });
    await syncTaskForPost(id, "changes", `${owned.client.contactName || owned.client.name} (client, portal)`, body);
    revalidatePath("/portal");
    revalidatePath("/portal/approvals");
    revalidatePath("/works");
    revalidatePath("/portal/content");
    revalidatePath("/static-posts", "layout");
    revalidatePath("/video-posts", "layout");
    revalidatePath("/dashboard");
}

/** Client submits a new content request with a direction + reference links. */
export async function portalCreateContentAction(
    _prev: PortalCreateState | undefined,
    formData: FormData,
): Promise<PortalCreateState> {
    const client = await getCurrentClient();
    if (!client) {
        return { ok: false, message: "No client portal access for this account." };
    }

    const title = String(formData.get("title") ?? "").trim();
    const direction = String(formData.get("direction") ?? "").trim();
    if (!title) return { ok: false, message: "Give your request a short title." };

    const references = [
        ...String(formData.get("references") ?? "")
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean),
        // Uploaded visual references become links alongside the pasted ones.
        ...referenceUrls(formData.get("refPaths"), client.id),
    ];

    const month = currentMonth();

    // Quota counts VISUALS (carousel = several, single = 1) and comes from the
    // client's active projects. Going over is ALLOWED; the item is flagged as
    // beyond the plan so the account manager can agree a charge (0 = no cap).
    const rawVisuals = Number(formData.get("visualCount") ?? 1);
    const visualCount =
        Number.isFinite(rawVisuals) && rawVisuals >= 1
            ? Math.min(20, Math.floor(rawVisuals))
            : 1;

    let chargeableVisuals = 0;
    const quota = clientContentQuota(client.name, await listContracts());
    if (quota > 0) {
        const used = visualsUsed(await listContentPosts(), client.name, month);
        chargeableVisuals = Math.max(0, used + visualCount - quota);
    }
    const billable = chargeableVisuals > 0;

    await createContentRequest({
        clientName: client.name,
        title,
        direction,
        references,
        planMonth: month,
        visualCount,
        billable,
    });

    revalidatePath("/portal/content");
    revalidatePath("/static-posts", "layout");
    revalidatePath("/video-posts", "layout");
    revalidatePath("/dashboard");
    return {
        ok: true,
        message: billable
            ? `Request submitted. ${chargeableVisuals} visual${chargeableVisuals === 1 ? " is" : "s are"} beyond your plan — your account manager will confirm any charge.`
            : "Request submitted — we'll get on it.",
    };
}

// ---------------------------------------------------------------------------
// Task approvals (the client's own path; the account manager can always
// approve on their behalf from /works/[id])
// ---------------------------------------------------------------------------

/**
 * Confirm the acting client owns this task (through its project) and that it
 * is actually waiting on them. Anything else is silently ignored — the portal
 * never reveals whether a task id exists. The hidden `client` field is only
 * read under the dev bypass (see resolveActingClient).
 */
async function ownPendingTask(formData: FormData) {
    const id = String(formData.get("id") ?? "").trim();
    if (!id) return null;
    const acting = await resolveActingClient(String(formData.get("client") ?? ""));
    if (!acting) return null;
    const w = await getWorkById(id);
    if (!w || w.status !== "pending_approval" || w.approver !== "client") return null;
    const contract = w.contractId ? await getContractById(w.contractId) : null;
    if (
        !contract ||
        contract.clientName.trim().toLowerCase() !==
            acting.client.name.trim().toLowerCase()
    ) {
        return null;
    }
    return { by: clientActorName(acting.client), w };
}

function revalidateTask(id: string, contractId: string) {
    // The layout carries the Approvals badge, so refresh the whole portal tree.
    revalidatePath("/portal", "layout");
    revalidatePath("/portal");
    revalidatePath("/portal/approvals");
    revalidatePath(`/works/${id}`);
    revalidatePath("/works");
    if (contractId) revalidatePath(`/projects/${contractId}`);
    revalidatePath("/projects");
    revalidatePath("/dashboard");
    revalidatePath("/notifications");
}

/** Client approves a task that waits on them: it completes. `comment` is optional. */
export async function approveTaskAsClientAction(formData: FormData) {
    const owned = await ownPendingTask(formData);
    if (!owned) return;
    const { by, w } = owned;
    const note = String(formData.get("comment") ?? "").trim();
    const now = new Date().toISOString();
    await updateWork(w.id, {
        status: "completed",
        completedAt: now,
        review: { decision: "approved", note, by, at: now },
    });
    await syncLinkedContent(w, "approved", by, note);
    await recordAudit({
        entity: "work",
        entityId: w.id,
        kind: "update",
        summary: `${w.title}: approved by client via portal${note ? ` — ${note}` : ""}`,
        actor: by,
        changes: [{ field: "status", before: w.status, after: "completed" }],
    });
    await notify({
        kind: "work_approved",
        title: `Approved by client: ${w.title}`,
        body: `${w.clientName} · ${w.month} · by ${by}${note ? ` — ${note}` : ""}`,
        link: `/works/${w.id}`,
    });
    revalidateTask(w.id, w.contractId);
}

/** Client sends a task back with a required comment: it returns to in progress. */
export async function requestTaskChangesAsClientAction(formData: FormData) {
    const comment = String(formData.get("comment") ?? "").trim();
    if (!comment) return;
    const owned = await ownPendingTask(formData);
    if (!owned) return;
    const { by, w } = owned;
    const now = new Date().toISOString();
    await updateWork(w.id, {
        status: "in_progress",
        review: { decision: "changes", note: comment, by, at: now },
    });
    await syncLinkedContent(w, "changes", by, comment);
    await recordAudit({
        entity: "work",
        entityId: w.id,
        kind: "update",
        summary: `${w.title}: changes requested by client via portal — ${comment}`,
        actor: by,
        changes: [{ field: "status", before: w.status, after: "in_progress" }],
    });
    // Same kind the internal review uses when a task goes back to the team.
    await notify({
        kind: "work_changes_requested",
        title: `Changes requested by client: ${w.title}`,
        body: `${w.clientName} · ${w.month} · back to ${members(w).join(", ") || "the team"} — ${comment}`,
        link: `/works/${w.id}`,
    });
    revalidateTask(w.id, w.contractId);
}
