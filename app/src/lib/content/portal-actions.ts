"use server";

/**
 * Client-portal content actions. The portal is UNAUTHENTICATED — authority comes
 * from the unguessable client portal token in the URL. Every write resolves the
 * client by token and asserts the target content belongs to that client BEFORE
 * mutating (server-side authority; never trust the client). All writes go
 * through the lib/data/content functions.
 */
import { revalidatePath } from "next/cache";
import { getClientByPortalToken } from "@/lib/data/clients";
import {
    approveContent,
    createContentRequest,
    getContentPostById,
    requestChanges,
} from "@/lib/data/content";

function sameName(a: string, b: string) {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Resolve client by token and confirm the content item is theirs. */
async function authorize(token: string, contentId: string) {
    const client = await getClientByPortalToken(token);
    if (!client) return null;
    const post = await getContentPostById(contentId);
    if (!post || !sameName(post.clientName, client.name)) return null;
    return { client, post };
}

function revalidatePortal(token: string, contentId: string) {
    revalidatePath(`/c/${token}`);
    revalidatePath(`/content/${contentId}`);
    revalidatePath("/content");
    revalidatePath("/dashboard");
}

export async function portalApproveAction(formData: FormData) {
    const token = String(formData.get("token") ?? "");
    const id = String(formData.get("id") ?? "");
    if (!token || !id) return;
    const ok = await authorize(token, id);
    if (!ok) return;
    await approveContent({
        id,
        by: ok.client.contactName || ok.client.name,
    });
    revalidatePortal(token, id);
}

export async function portalRequestChangesAction(formData: FormData) {
    const token = String(formData.get("token") ?? "");
    const id = String(formData.get("id") ?? "");
    const body = String(formData.get("body") ?? "").trim();
    if (!token || !id || !body) return;
    const ok = await authorize(token, id);
    if (!ok) return;
    await requestChanges({
        id,
        body,
        fileUrl: String(formData.get("fileUrl") ?? "").trim() || undefined,
    });
    revalidatePortal(token, id);
}

export async function portalCreateRequestAction(formData: FormData) {
    const token = String(formData.get("token") ?? "");
    const title = String(formData.get("title") ?? "").trim();
    if (!token || !title) return;
    const client = await getClientByPortalToken(token);
    if (!client) return;
    await createContentRequest({
        clientName: client.name,
        title,
        instructions: String(formData.get("instructions") ?? "").trim(),
    });
    revalidatePath(`/c/${token}`);
    revalidatePath("/content");
    revalidatePath("/dashboard");
}
