"use server";

/**
 * Direct-to-storage draft uploads.
 *
 * Files used to travel browser → Next server action → Supabase Storage, which
 * dies on every body-size ceiling (proxy buffer 10MB, server-action 50MB, and
 * Vercel's HARD ~4.5MB serverless request cap — videos are impossible).
 *
 * New flow: the server only issues short-lived SIGNED UPLOAD URLS; the browser
 * uploads each file straight to the `content-assets` bucket; then a tiny JSON
 * of stored paths comes back here to record the draft. Upload size is bounded
 * only by the Supabase project's per-file storage limit.
 */
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { isSupabaseEnabled } from "@/lib/data/flag";
import { getContentPostById, submitDraft } from "@/lib/data/content";
import type { ContentMedia } from "@/lib/dev-store/content";

const BUCKET = "content-assets" as const;

function safeName(name: string) {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name.replace(/[^\w.\-]+/g, "_")}`;
}

export type UploadTarget = {
    /** Storage object key, always under `<contentId>/`. */
    path: string;
    /** One-time signed-upload token for uploadToSignedUrl(). */
    token: string;
    /** Original file name (echoed back for the submit step). */
    name: string;
    /** MIME type. */
    type: string;
};

export type CreateTargetsResult =
    | { ok: true; targets: UploadTarget[] }
    | { ok: false; message: string };

/** Issue signed upload URLs so the browser can PUT files straight to storage. */
export async function createDraftUploadTargetsAction(
    contentId: string,
    files: { name: string; type: string }[],
): Promise<CreateTargetsResult> {
    if (!isSupabaseEnabled("content")) {
        return {
            ok: false,
            message:
                "Direct uploads need Supabase mode (USE_SUPABASE). Dev-store mode isn't supported.",
        };
    }
    if (!contentId || files.length === 0 || files.length > 20) {
        return { ok: false, message: "Pick 1–20 files." };
    }
    const post = await getContentPostById(contentId);
    if (!post) return { ok: false, message: "Content item not found." };

    const sb = createServiceClient();
    const targets: UploadTarget[] = [];
    for (const f of files) {
        const key = `${contentId}/${safeName(f.name || "asset")}`;
        const { data, error } = await sb.storage
            .from(BUCKET)
            .createSignedUploadUrl(key);
        if (error) {
            return { ok: false, message: `Could not prepare upload: ${error.message}` };
        }
        targets.push({
            path: data.path,
            token: data.token,
            name: f.name,
            type: f.type,
        });
    }
    return { ok: true, targets };
}

export type SubmitDraftMetaResult = { ok: boolean; message?: string };

/**
 * Record a draft whose files are ALREADY in storage (uploaded via signed URLs).
 * Body is small JSON — immune to every request-size limit.
 */
export async function submitDraftFromStorageAction(input: {
    id: string;
    draftNumber: string;
    media: { path: string; name: string; type: string }[];
}): Promise<SubmitDraftMetaResult> {
    const { id, draftNumber } = input;
    if (!id || input.media.length === 0) {
        return { ok: false, message: "Missing content id or files." };
    }
    // Only accept objects we issued for THIS content item.
    if (input.media.some((m) => !m.path.startsWith(`${id}/`))) {
        return { ok: false, message: "Invalid file path." };
    }

    const sb = createServiceClient();
    const media: ContentMedia[] = input.media.map((m) => ({
        url: sb.storage.from(BUCKET).getPublicUrl(m.path).data.publicUrl,
        type: m.type.startsWith("video") ? "video" : "image",
        name: m.name,
    }));

    try {
        await submitDraft({ id, draftNumber, media });
    } catch (e) {
        return { ok: false, message: (e as Error).message };
    }

    revalidatePath(`/content/${id}`);
    revalidatePath("/content");
    revalidatePath("/dashboard");
    return { ok: true };
}
