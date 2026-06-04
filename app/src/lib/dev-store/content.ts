/**
 * DEV-ONLY local file store for content posts (social/SEO/blog calendar).
 * Replaced by Supabase `content_posts` once provisioned.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = path.join(process.cwd(), ".dev-data");
const CONTENT_DIR = path.join(ROOT, "content");

export const CONTENT_STATUSES = [
    "idea",
    "draft",
    "review",
    "scheduled",
    "posted",
    "archived",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const CONTENT_PLATFORMS = [
    "instagram",
    "facebook",
    "tiktok",
    "linkedin",
    "x",
    "youtube",
    "blog",
    "newsletter",
    "gmb",
] as const;
export type ContentPlatform = (typeof CONTENT_PLATFORMS)[number];

export const CONTENT_TYPES = [
    "post",
    "reel",
    "story",
    "carousel",
    "article",
    "email",
    "video",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export type ContentPost = {
    id: string;
    title: string;
    clientName: string;
    projectId: string | null;
    platform: ContentPlatform;
    type: ContentType;
    status: ContentStatus;
    /** YYYY-MM-DD; required (it's a calendar). */
    scheduledFor: string;
    /** HH:MM optional, 24h. */
    scheduledTime: string;
    caption: string;
    hashtags: string;
    notes: string;
    assignee: string;
    createdAt: string;
    updatedAt: string;
    postedAt: string | null;
};

async function ensureDir() {
    await fs.mkdir(CONTENT_DIR, { recursive: true });
}

function fileFor(id: string) {
    return path.join(CONTENT_DIR, `${id}.json`);
}

export async function createContentPost(input: {
    title: string;
    clientName: string;
    projectId?: string | null;
    platform?: ContentPlatform;
    type?: ContentType;
    scheduledFor: string;
    scheduledTime?: string;
    caption?: string;
    hashtags?: string;
    notes?: string;
    assignee?: string;
}): Promise<ContentPost> {
    await ensureDir();
    const now = new Date().toISOString();
    const post: ContentPost = {
        id: randomUUID(),
        title: input.title,
        clientName: input.clientName,
        projectId: input.projectId ?? null,
        platform: input.platform ?? "instagram",
        type: input.type ?? "post",
        status: "idea",
        scheduledFor: input.scheduledFor,
        scheduledTime: input.scheduledTime ?? "",
        caption: input.caption ?? "",
        hashtags: input.hashtags ?? "",
        notes: input.notes ?? "",
        assignee: input.assignee ?? "",
        createdAt: now,
        updatedAt: now,
        postedAt: null,
    };
    await fs.writeFile(fileFor(post.id), JSON.stringify(post, null, 2), "utf8");
    return post;
}

export async function listContentPosts(): Promise<ContentPost[]> {
    await ensureDir();
    const entries = await fs.readdir(CONTENT_DIR);
    const out: ContentPost[] = [];
    for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const raw = await fs.readFile(path.join(CONTENT_DIR, entry), "utf8");
        out.push(JSON.parse(raw) as ContentPost);
    }
    // Sort by scheduledFor ascending (calendar order).
    return out.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
}

export async function getContentPostById(
    id: string,
): Promise<ContentPost | null> {
    try {
        const raw = await fs.readFile(fileFor(id), "utf8");
        return JSON.parse(raw) as ContentPost;
    } catch {
        return null;
    }
}

export async function updateContentPost(
    id: string,
    patch: Partial<Omit<ContentPost, "id" | "createdAt">>,
): Promise<ContentPost> {
    const existing = await getContentPostById(id);
    if (!existing) throw new Error(`Content post ${id} not found`);
    const updated: ContentPost = {
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(fileFor(id), JSON.stringify(updated, null, 2), "utf8");
    return updated;
}

export async function setContentStatus(
    id: string,
    status: ContentStatus,
): Promise<ContentPost> {
    const patch: Partial<ContentPost> = { status };
    if (status === "posted") patch.postedAt = new Date().toISOString();
    if (status !== "posted") patch.postedAt = null;
    return updateContentPost(id, patch);
}

export async function deleteContentPost(id: string): Promise<void> {
    try {
        await fs.unlink(fileFor(id));
    } catch {
        // ignore
    }
}
