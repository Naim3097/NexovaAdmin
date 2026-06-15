/**
 * Content asset storage — mirrors lib/data/onboarding.saveUpload but for the
 * dedicated `content-assets` bucket.
 *
 *   - Supabase mode: upload to the public `content-assets` bucket, return the
 *     public URL (server-side, service-role — clients never write directly).
 *   - Dev mode: write under `.dev-data/uploads/<contentId>/` and return a
 *     `/api/dev-files/` URL (the same route that serves onboarding uploads).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { createServiceClient } from "@/lib/supabase/server";
import { isSupabaseEnabled } from "@/lib/data/flag";

const BUCKET = "content-assets" as const;
const UPLOADS_DIR = path.join(process.cwd(), ".dev-data", "uploads");

export type StoredAsset = {
    name: string;
    type: string; // MIME
    url: string;
};

function safeName(name: string) {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name.replace(/[^\w.\-]+/g, "_")}`;
}

export async function saveContentAsset(
    contentId: string,
    file: File,
): Promise<StoredAsset> {
    const fname = safeName(file.name || "asset");

    if (!isSupabaseEnabled("content")) {
        const dir = path.join(UPLOADS_DIR, contentId);
        await fs.mkdir(dir, { recursive: true });
        const buf = Buffer.from(await file.arrayBuffer());
        await fs.writeFile(path.join(dir, fname), buf);
        return {
            name: file.name,
            type: file.type,
            url: `/api/dev-files/${contentId}/${encodeURIComponent(fname)}`,
        };
    }

    const key = `${contentId}/${fname}`;
    const sb = createServiceClient();
    const buf = Buffer.from(await file.arrayBuffer());
    const { error } = await sb.storage.from(BUCKET).upload(key, buf, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
    });
    if (error) throw new Error(`saveContentAsset: ${error.message}`);
    const { data } = sb.storage.from(BUCKET).getPublicUrl(key);
    return { name: file.name, type: file.type, url: data.publicUrl };
}
