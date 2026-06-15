"use server";

/**
 * Authenticated client-portal actions. Authority comes from the signed-in user
 * resolved to their client via getCurrentClient() (clients.user_id) — NOT a
 * token. The client can only ever act on their own content.
 */
import { revalidatePath } from "next/cache";
import { getCurrentClient } from "@/lib/auth";
import {
    approveContent,
    createContentRequest,
    getContentPostById,
    listContentPosts,
    requestChanges,
} from "@/lib/data/content";

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
    await approveContent({
        id,
        by: owned.client.contactName || owned.client.name,
    });
    revalidatePath("/portal/content");
    revalidatePath("/content");
    revalidatePath("/dashboard");
}

/** Logged-in client requests changes on the current draft. */
export async function portalRequestChangesAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const body = String(formData.get("body") ?? "").trim();
    if (!id || !body) return;
    const owned = await ownContent(id);
    if (!owned) return;
    await requestChanges({ id, body });
    revalidatePath("/portal/content");
    revalidatePath("/content");
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

    const references = String(formData.get("references") ?? "")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);

    const month = currentMonth();

    // Quota: monthly_content_quota caps items per month (0 = no cap configured).
    if (client.monthlyContentQuota > 0) {
        const used = (await listContentPosts()).filter(
            (p) =>
                p.clientName.trim().toLowerCase() ===
                    client.name.trim().toLowerCase() && p.planMonth === month,
        ).length;
        if (used >= client.monthlyContentQuota) {
            return {
                ok: false,
                message: `You've reached this month's limit of ${client.monthlyContentQuota} request(s). Contact us to add more.`,
            };
        }
    }

    await createContentRequest({
        clientName: client.name,
        title,
        direction,
        references,
        planMonth: month,
    });

    revalidatePath("/portal/content");
    revalidatePath("/content");
    revalidatePath("/dashboard");
    return { ok: true, message: "Request submitted — we'll get on it." };
}
