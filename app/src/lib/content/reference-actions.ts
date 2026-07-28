"use server";

/**
 * Visual-reference uploads for the client portal (direction images on content
 * requests + attachments on change requests).
 *
 * Same direct-to-storage pattern as drafts: the server issues signed upload
 * URLs, the browser PUTs the images straight to the `content-assets` bucket,
 * and only the stored paths come back with the form. Ownership is baked into
 * the path prefix `refs/<clientId>/…`, which the consuming actions verify.
 */
import { getCurrentClient } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { isSupabaseEnabled } from "@/lib/data/flag";
import type { CreateTargetsResult, UploadTarget } from "./upload-actions";

const BUCKET = "content-assets" as const;

function safeName(name: string) {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name.replace(/[^\w.\-]+/g, "_")}`;
}

/** Signed upload URLs for portal reference images (images only, max 6). */
export async function createPortalReferenceTargetsAction(
    files: { name: string; type: string }[],
): Promise<CreateTargetsResult> {
    if (!isSupabaseEnabled("content")) {
        return { ok: false, message: "Uploads need Supabase mode." };
    }
    const client = await getCurrentClient();
    if (!client) {
        return { ok: false, message: "No client portal access." };
    }
    if (files.length === 0 || files.length > 6) {
        return { ok: false, message: "Pick 1–6 images." };
    }
    if (files.some((f) => !f.type.startsWith("image/"))) {
        return { ok: false, message: "References must be images." };
    }

    const sb = createServiceClient();
    const targets: UploadTarget[] = [];
    for (const f of files) {
        const key = `refs/${client.id}/${safeName(f.name || "reference")}`;
        const { data, error } = await sb.storage
            .from(BUCKET)
            .createSignedUploadUrl(key);
        if (error) {
            return {
                ok: false,
                message: `Could not prepare upload: ${error.message}`,
            };
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
