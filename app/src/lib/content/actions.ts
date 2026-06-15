"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
    CONTENT_DRAFT_STAGES,
    CONTENT_PLATFORMS,
    CONTENT_STATUSES,
    CONTENT_TYPES,
    createContentPost,
    deleteContentPost,
    setContentStatus,
    submitDraft,
    updateContentPost,
    type ContentPlatform,
    type ContentStatus,
    type ContentType,
} from "@/lib/data/content";

function asPlatform(v: FormDataEntryValue | null): ContentPlatform {
    const s = String(v ?? "");
    return (CONTENT_PLATFORMS as readonly string[]).includes(s)
        ? (s as ContentPlatform)
        : "instagram";
}
function asType(v: FormDataEntryValue | null): ContentType {
    const s = String(v ?? "");
    return (CONTENT_TYPES as readonly string[]).includes(s)
        ? (s as ContentType)
        : "post";
}
function asStatus(v: FormDataEntryValue | null): ContentStatus {
    const s = String(v ?? "");
    return (CONTENT_STATUSES as readonly string[]).includes(s)
        ? (s as ContentStatus)
        : "idea";
}
function nullableId(v: FormDataEntryValue | null): string | null {
    const s = String(v ?? "").trim();
    return s.length > 0 && s !== "none" ? s : null;
}
function assigneeStr(v: FormDataEntryValue | null): string {
    const s = String(v ?? "").trim();
    return s === "none" ? "" : s;
}

export async function createContentPostAction(formData: FormData) {
    const title = String(formData.get("title") ?? "").trim();
    const clientName = String(formData.get("clientName") ?? "").trim();
    const scheduledFor = String(formData.get("scheduledFor") ?? "").trim();
    if (!title || !clientName || !scheduledFor) return;
    const post = await createContentPost({
        title,
        clientName,
        projectId: nullableId(formData.get("projectId")),
        platform: asPlatform(formData.get("platform")),
        type: asType(formData.get("type")),
        scheduledFor,
        scheduledTime: String(formData.get("scheduledTime") ?? "").trim(),
        caption: String(formData.get("caption") ?? "").trim(),
        hashtags: String(formData.get("hashtags") ?? "").trim(),
        notes: String(formData.get("notes") ?? "").trim(),
        assignee: assigneeStr(formData.get("assignee")),
    });
    revalidatePath("/content");
    revalidatePath("/content/calendar");
    revalidatePath("/dashboard");
    redirect(`/content/${post.id}`);
}

export async function updateContentPostAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await updateContentPost(id, {
        title: String(formData.get("title") ?? "").trim(),
        clientName: String(formData.get("clientName") ?? "").trim(),
        projectId: nullableId(formData.get("projectId")),
        platform: asPlatform(formData.get("platform")),
        type: asType(formData.get("type")),
        scheduledFor: String(formData.get("scheduledFor") ?? "").trim(),
        scheduledTime: String(formData.get("scheduledTime") ?? "").trim(),
        caption: String(formData.get("caption") ?? "").trim(),
        hashtags: String(formData.get("hashtags") ?? "").trim(),
        notes: String(formData.get("notes") ?? "").trim(),
        assignee: assigneeStr(formData.get("assignee")),
    });
    revalidatePath(`/content/${id}`);
    revalidatePath("/content");
    revalidatePath("/content/calendar");
}

export async function setContentStatusAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await setContentStatus(id, asStatus(formData.get("status")));
    revalidatePath(`/content/${id}`);
    revalidatePath("/content");
    revalidatePath("/content/calendar");
    revalidatePath("/dashboard");
}

function asDraftStage(v: FormDataEntryValue | null): string {
    const s = String(v ?? "");
    return (CONTENT_DRAFT_STAGES as readonly string[]).includes(s)
        ? s
        : "Draft 1";
}

export async function submitDraftAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const fileUrl = String(formData.get("fileUrl") ?? "").trim();
    if (!id || !fileUrl) return;
    await submitDraft({
        id,
        draftNumber: asDraftStage(formData.get("draftNumber")),
        fileUrl,
        caption: String(formData.get("caption") ?? "").trim(),
    });
    revalidatePath(`/content/${id}`);
    revalidatePath("/content");
    revalidatePath("/dashboard");
}

export async function deleteContentPostAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await deleteContentPost(id);
    revalidatePath("/content");
    revalidatePath("/content/calendar");
    revalidatePath("/dashboard");
    redirect("/content");
}
