"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
    CONTENT_ASSET_TYPES,
    CONTENT_DRAFT_STAGES,
    CONTENT_PLATFORMS,
    CONTENT_STATUSES,
    CONTENT_TYPES,
    createContentPost,
    deleteContentPost,
    setContentStatus,
    submitDraft,
    updateContentPost,
    type ContentAssetType,
    type ContentMedia,
    type ContentPlatform,
    type ContentStatus,
    type ContentType,
} from "@/lib/data/content";
import { saveContentAsset } from "@/lib/storage/content-assets";

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
    // Patch only the fields actually present in this form, so the Concept and
    // Details sections (separate forms) never clobber each other's values.
    const patch: Parameters<typeof updateContentPost>[1] = {};
    const str = (k: string) => String(formData.get(k) ?? "").trim();
    if (formData.has("title")) patch.title = str("title");
    if (formData.has("clientName")) patch.clientName = str("clientName");
    if (formData.has("projectId"))
        patch.projectId = nullableId(formData.get("projectId"));
    if (formData.has("platform"))
        patch.platform = asPlatform(formData.get("platform"));
    if (formData.has("type")) patch.type = asType(formData.get("type"));
    if (formData.has("scheduledFor")) patch.scheduledFor = str("scheduledFor");
    if (formData.has("scheduledTime")) patch.scheduledTime = str("scheduledTime");
    if (formData.has("caption")) patch.caption = str("caption");
    if (formData.has("hashtags")) patch.hashtags = str("hashtags");
    if (formData.has("notes")) patch.notes = str("notes");
    if (formData.has("assignee"))
        patch.assignee = assigneeStr(formData.get("assignee"));
    if (formData.has("visualHeadline"))
        patch.visualHeadline = str("visualHeadline");
    if (formData.has("visualIdea")) patch.visualIdea = str("visualIdea");
    if (formData.has("copywriting")) patch.copywriting = str("copywriting");
    await updateContentPost(id, patch);
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

function asAssetType(v: FormDataEntryValue | null): ContentAssetType | undefined {
    const s = String(v ?? "");
    return (CONTENT_ASSET_TYPES as readonly string[]).includes(s)
        ? (s as ContentAssetType)
        : undefined;
}

export async function submitDraftAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;

    const files = formData
        .getAll("files")
        .filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) return;

    const media: ContentMedia[] = [];
    for (const file of files) {
        const stored = await saveContentAsset(id, file);
        media.push({
            url: stored.url,
            type: stored.type.startsWith("video") ? "video" : "image",
            name: stored.name,
        });
    }

    await submitDraft({
        id,
        draftNumber: asDraftStage(formData.get("draftNumber")),
        media,
        assetType: asAssetType(formData.get("assetType")),
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
