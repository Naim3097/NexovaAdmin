/**
 * DEV-ONLY local file store for onboarding submissions.
 * Persists JSON to `.dev-data/onboarding/*.json` and uploads under
 * `.dev-data/uploads/<submissionId>/`.
 *
 * Replaced by Supabase + Storage once the DB is provisioned. All callers go
 * through this module so the swap is a single-file change.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID, randomBytes } from "node:crypto";

const ROOT = path.join(process.cwd(), ".dev-data");
const ONBOARDING_DIR = path.join(ROOT, "onboarding");
const UPLOADS_DIR = path.join(ROOT, "uploads");

export type OnboardingStatus = "draft" | "submitted";

export type UploadedFile = {
    name: string;
    size: number;
    type: string;
    /** path relative to /api/dev-files/ for serving */
    url: string;
};

export type OnboardingSubmission = {
    id: string;
    token: string;
    checklistSlug: "website-creation";
    clientName: string;
    status: OnboardingStatus;
    data: Record<string, unknown>;
    files: Record<string, UploadedFile | UploadedFile[]>;
    notes: string;
    createdAt: string;
    updatedAt: string;
    submittedAt: string | null;
};

async function ensureDirs() {
    await fs.mkdir(ONBOARDING_DIR, { recursive: true });
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

function fileFor(id: string) {
    return path.join(ONBOARDING_DIR, `${id}.json`);
}

export async function createSubmission(input: {
    clientName: string;
}): Promise<OnboardingSubmission> {
    await ensureDirs();
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
    await fs.writeFile(fileFor(sub.id), JSON.stringify(sub, null, 2), "utf8");
    return sub;
}

export async function listSubmissions(): Promise<OnboardingSubmission[]> {
    await ensureDirs();
    const entries = await fs.readdir(ONBOARDING_DIR);
    const out: OnboardingSubmission[] = [];
    for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const raw = await fs.readFile(path.join(ONBOARDING_DIR, entry), "utf8");
        out.push(JSON.parse(raw) as OnboardingSubmission);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getSubmissionById(
    id: string,
): Promise<OnboardingSubmission | null> {
    try {
        const raw = await fs.readFile(fileFor(id), "utf8");
        return JSON.parse(raw) as OnboardingSubmission;
    } catch {
        return null;
    }
}

export async function getSubmissionByToken(
    token: string,
): Promise<OnboardingSubmission | null> {
    const all = await listSubmissions();
    return all.find((s) => s.token === token) ?? null;
}

export async function updateSubmission(
    id: string,
    patch: Partial<
        Pick<
            OnboardingSubmission,
            "data" | "files" | "status" | "submittedAt" | "notes" | "token"
        >
    >,
): Promise<OnboardingSubmission> {
    const existing = await getSubmissionById(id);
    if (!existing) throw new Error(`Submission ${id} not found`);
    const updated: OnboardingSubmission = {
        ...existing,
        ...patch,
        data: { ...existing.data, ...(patch.data ?? {}) },
        files: { ...existing.files, ...(patch.files ?? {}) },
        updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(fileFor(id), JSON.stringify(updated, null, 2), "utf8");
    return updated;
}

export async function deleteSubmission(id: string): Promise<void> {
    try {
        await fs.unlink(fileFor(id));
    } catch {
        // ignore
    }
    try {
        await fs.rm(path.join(UPLOADS_DIR, id), {
            recursive: true,
            force: true,
        });
    } catch {
        // ignore
    }
}

export async function regenerateToken(id: string): Promise<OnboardingSubmission> {
    return updateSubmission(id, { token: randomBytes(16).toString("base64url") });
}

export async function appendUploads(
    id: string,
    field: string,
    uploads: UploadedFile[],
): Promise<OnboardingSubmission> {
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
    await ensureDirs();
    const dir = path.join(UPLOADS_DIR, submissionId);
    await fs.mkdir(dir, { recursive: true });
    const safeName = `${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
    const dest = path.join(dir, safeName);
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(dest, buf);
    return {
        name: file.name,
        size: file.size,
        type: file.type,
        url: `/api/dev-files/${submissionId}/${encodeURIComponent(safeName)}`,
    };
}

export async function readUpload(
    submissionId: string,
    fileName: string,
): Promise<{ buffer: Buffer; type: string } | null> {
    const safe = fileName.replace(/\.\.|[\\/]/g, "");
    const full = path.join(UPLOADS_DIR, submissionId, safe);
    if (!full.startsWith(UPLOADS_DIR)) return null;
    try {
        const buffer = await fs.readFile(full);
        const ext = path.extname(safe).toLowerCase();
        const type =
            ext === ".png"
                ? "image/png"
                : ext === ".jpg" || ext === ".jpeg"
                    ? "image/jpeg"
                    : ext === ".svg"
                        ? "image/svg+xml"
                        : ext === ".webp"
                            ? "image/webp"
                            : "application/octet-stream";
        return { buffer, type };
    } catch {
        return null;
    }
}
