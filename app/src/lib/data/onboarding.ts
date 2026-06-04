/**
 * Onboarding submissions data adapter (table + Storage bucket).
 *
 * Uploads:
 *   - Dev: `.dev-data/uploads/<submissionId>/<safeName>`, served via /api/dev-files/.
 *   - Supabase: bucket `onboarding-uploads`, key `<submissionId>/<safeName>`,
 *     `url` set to the public URL. The `/api/dev-files/` route stays dev-only
 *     (never invoked in Supabase mode because URLs are direct).
 *
 * `readUpload` is dev-only — in Supabase mode it returns null (the `url` in
 * each `UploadedFile` is already a direct public URL).
 */
import { randomUUID, randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import type {
    Database,
    OnboardingFileRow,
    OnboardingSubmissionRow,
} from "@/lib/supabase/types";
import { isSupabaseEnabled } from "@/lib/data/flag";
import * as devOnboarding from "@/lib/dev-store/onboarding";

export type {
    OnboardingStatus,
    OnboardingSubmission,
    UploadedFile,
} from "@/lib/dev-store/onboarding";

type OnboardingSubmission = devOnboarding.OnboardingSubmission;
type UploadedFile = devOnboarding.UploadedFile;
type UpdatePatch = Partial<
    Pick<
        OnboardingSubmission,
        "data" | "files" | "status" | "submittedAt" | "notes" | "token"
    >
>;

type OnboardingInsert =
    Database["public"]["Tables"]["onboarding_submissions"]["Insert"];
type OnboardingUpdate =
    Database["public"]["Tables"]["onboarding_submissions"]["Update"];

const TABLE = "onboarding_submissions" as const;
const BUCKET = "onboarding-uploads" as const;

function rowToSubmission(row: OnboardingSubmissionRow): OnboardingSubmission {
    return {
        id: row.id,
        token: row.token,
        checklistSlug: "website-creation",
        clientName: row.client_name,
        status: row.status as OnboardingSubmission["status"],
        data: row.data ?? {},
        files: (row.files ?? {}) as Record<
            string,
            UploadedFile | UploadedFile[]
        >,
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        submittedAt: row.submitted_at,
    };
}

function submissionToInsert(s: OnboardingSubmission): OnboardingInsert {
    return {
        id: s.id,
        token: s.token,
        checklist_slug: s.checklistSlug,
        client_name: s.clientName,
        status: s.status,
        data: s.data,
        files: s.files as Record<
            string,
            OnboardingFileRow | OnboardingFileRow[]
        >,
        notes: s.notes,
        created_at: s.createdAt,
        updated_at: s.updatedAt,
        submitted_at: s.submittedAt,
    };
}

export async function createSubmission(input: {
    clientName: string;
}): Promise<OnboardingSubmission> {
    if (!isSupabaseEnabled("onboarding")) {
        return devOnboarding.createSubmission(input);
    }
    const now = new Date().toISOString();
    const sub: OnboardingSubmission = {
        id: randomUUID(),
        token: randomBytes(16).toString("base64url"),
        checklistSlug: "website-creation",
        clientName: input.clientName,
        status: "draft",
        data: {},
        files: {},
        notes: "",
        createdAt: now,
        updatedAt: now,
        submittedAt: null,
    };
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .insert(submissionToInsert(sub))
        .select("*")
        .single();
    if (error) throw new Error(`createSubmission: ${error.message}`);
    return rowToSubmission(data as OnboardingSubmissionRow);
}

export async function listSubmissions(): Promise<OnboardingSubmission[]> {
    if (!isSupabaseEnabled("onboarding")) return devOnboarding.listSubmissions();
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .order("created_at", { ascending: false });
    if (error) throw new Error(`listSubmissions: ${error.message}`);
    return (data as OnboardingSubmissionRow[]).map(rowToSubmission);
}

export async function getSubmissionById(
    id: string,
): Promise<OnboardingSubmission | null> {
    if (!isSupabaseEnabled("onboarding")) {
        return devOnboarding.getSubmissionById(id);
    }
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("id", id)
        .maybeSingle();
    if (error) throw new Error(`getSubmissionById: ${error.message}`);
    return data
        ? rowToSubmission(data as OnboardingSubmissionRow)
        : null;
}

export async function getSubmissionByToken(
    token: string,
): Promise<OnboardingSubmission | null> {
    if (!isSupabaseEnabled("onboarding")) {
        return devOnboarding.getSubmissionByToken(token);
    }
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("token", token)
        .maybeSingle();
    if (error) throw new Error(`getSubmissionByToken: ${error.message}`);
    return data
        ? rowToSubmission(data as OnboardingSubmissionRow)
        : null;
}

export async function updateSubmission(
    id: string,
    patch: UpdatePatch,
): Promise<OnboardingSubmission> {
    if (!isSupabaseEnabled("onboarding")) {
        return devOnboarding.updateSubmission(id, patch);
    }
    const existing = await getSubmissionById(id);
    if (!existing) throw new Error(`Submission ${id} not found`);
    const merged: OnboardingSubmission = {
        ...existing,
        ...patch,
        data: { ...existing.data, ...(patch.data ?? {}) },
        files: { ...existing.files, ...(patch.files ?? {}) },
        updatedAt: new Date().toISOString(),
    };
    const update: OnboardingUpdate = {
        data: merged.data,
        files: merged.files as Record<
            string,
            OnboardingFileRow | OnboardingFileRow[]
        >,
        notes: merged.notes,
        status: merged.status,
        submitted_at: merged.submittedAt,
        token: merged.token,
        updated_at: merged.updatedAt,
    };
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .update(update)
        .eq("id", id)
        .select("*")
        .single();
    if (error) throw new Error(`updateSubmission: ${error.message}`);
    return rowToSubmission(data as OnboardingSubmissionRow);
}

export async function deleteSubmission(id: string): Promise<void> {
    if (!isSupabaseEnabled("onboarding")) {
        return devOnboarding.deleteSubmission(id);
    }
    const sb = createServiceClient();
    // Best-effort cleanup of bucket folder before row delete.
    try {
        const { data: list } = await sb.storage.from(BUCKET).list(id);
        if (list && list.length > 0) {
            const paths = list.map((f) => `${id}/${f.name}`);
            await sb.storage.from(BUCKET).remove(paths);
        }
    } catch {
        // ignore — row delete still proceeds.
    }
    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`deleteSubmission: ${error.message}`);
}

export async function regenerateToken(
    id: string,
): Promise<OnboardingSubmission> {
    return updateSubmission(id, {
        token: randomBytes(16).toString("base64url"),
    });
}

export async function appendUploads(
    id: string,
    field: string,
    uploads: UploadedFile[],
): Promise<OnboardingSubmission> {
    if (!isSupabaseEnabled("onboarding")) {
        return devOnboarding.appendUploads(id, field, uploads);
    }
    const existing = await getSubmissionById(id);
    if (!existing) throw new Error(`Submission ${id} not found`);
    const current = existing.files[field];
    const arr = Array.isArray(current) ? current : current ? [current] : [];
    const next = [...arr, ...uploads];
    return updateSubmission(id, { files: { [field]: next } });
}

export async function saveUpload(
    submissionId: string,
    file: File,
): Promise<UploadedFile> {
    if (!isSupabaseEnabled("onboarding")) {
        return devOnboarding.saveUpload(submissionId, file);
    }
    const safeName = `${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
    const key = `${submissionId}/${safeName}`;
    const sb = createServiceClient();
    const buf = Buffer.from(await file.arrayBuffer());
    const { error } = await sb.storage.from(BUCKET).upload(key, buf, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
    });
    if (error) throw new Error(`saveUpload: ${error.message}`);
    const { data } = sb.storage.from(BUCKET).getPublicUrl(key);
    return {
        name: file.name,
        size: file.size,
        type: file.type,
        url: data.publicUrl,
    };
}

export async function readUpload(
    submissionId: string,
    fileName: string,
): Promise<{ buffer: Buffer; type: string } | null> {
    if (!isSupabaseEnabled("onboarding")) {
        return devOnboarding.readUpload(submissionId, fileName);
    }
    // In Supabase mode the public URL is direct — /api/dev-files/ should not
    // be hit. Return null so the route 404s rather than proxying.
    return null;
}
