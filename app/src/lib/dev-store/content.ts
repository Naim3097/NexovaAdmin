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

export const CONTENT_ORIGINS = ["plan", "request"] as const;
export type ContentOrigin = (typeof CONTENT_ORIGINS)[number];

/** Client-approval axis, orthogonal to the publishing `status`. */
export const CONTENT_REVIEW_STATUSES = [
    "none",
    "awaiting_client",
    "changes_requested",
    "approved",
] as const;
export type ContentReviewStatus = (typeof CONTENT_REVIEW_STATUSES)[number];

/** Draft ladder for the review loop (Axtra: Draft 1 → Final Draft). */
export const CONTENT_DRAFT_STAGES = [
    "Draft 1",
    "Draft 2",
    "Draft 3",
    "Final Draft",
] as const;
export type ContentDraftStage = (typeof CONTENT_DRAFT_STAGES)[number];

/** Asset shape of a submitted draft. */
export const CONTENT_ASSET_TYPES = ["image", "carousel", "video"] as const;
export type ContentAssetType = (typeof CONTENT_ASSET_TYPES)[number];

/** One uploaded media item (a carousel draft has several). */
export type ContentMedia = {
    url: string;
    type: "image" | "video";
    name: string;
};

/** A versioned draft the agency submits for client review. */
export type ContentDraft = {
    id: string;
    draftNumber: string;
    /** First media URL — kept for back-compat / quick previews. */
    fileUrl: string;
    /** All uploaded media (carousel = several images). */
    media: ContentMedia[];
    assetType: ContentAssetType;
    caption: string;
    submittedAt: string;
    submittedBy: string;
};

/** One feedback/approval event in the review thread. */
export type ContentFeedback = {
    id: string;
    draftId: string;
    author: "client" | "agency";
    body: string;
    fileUrl: string;
    cycle: number;
    createdAt: string;
};

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
    /** 'YYYY-MM' monthly plan this post belongs to ('' = ad-hoc). */
    planMonth: string;
    /** 'plan' = retainer deliverable, 'request' = one-off client ask. */
    origin: ContentOrigin;
    // ---- Direction (client) + concept (agency) — Phase 6 ------------------
    /** Client's brief for this item. */
    direction: string;
    /** Client-provided reference URLs. */
    references: string[];
    /** Agency concept fields (freeform, any team member). */
    visualHeadline: string;
    visualIdea: string;
    copywriting: string;
    // ---- Client review loop (Phase 2/3) -----------------------------------
    /** Client-approval state, orthogonal to `status`. */
    reviewStatus: ContentReviewStatus;
    /** Current draft stage, e.g. 'Draft 2' ('' before first submission). */
    draftNumber: string;
    /** Client feedback cycles consumed (capped by clients.contentRevisionLimit). */
    revisionsUsed: number;
    /** Latest draft asset URL (mirrors the newest drafts[] entry). */
    currentFileUrl: string;
    /** Version history of agency-submitted drafts. */
    drafts: ContentDraft[];
    /** Threaded client/agency feedback. */
    feedback: ContentFeedback[];
    approvedAt: string | null;
    approvedBy: string;
    createdAt: string;
    updatedAt: string;
    postedAt: string | null;
};

/** Backfill fields added after early dev rows were written. */
function normalizeContentPost(p: ContentPost): ContentPost {
    return {
        ...p,
        planMonth: p.planMonth ?? "",
        origin: p.origin ?? "plan",
        direction: p.direction ?? "",
        references: p.references ?? [],
        visualHeadline: p.visualHeadline ?? "",
        visualIdea: p.visualIdea ?? "",
        copywriting: p.copywriting ?? "",
        reviewStatus: p.reviewStatus ?? "none",
        draftNumber: p.draftNumber ?? "",
        revisionsUsed: p.revisionsUsed ?? 0,
        currentFileUrl: p.currentFileUrl ?? "",
        drafts: p.drafts ?? [],
        feedback: p.feedback ?? [],
        approvedAt: p.approvedAt ?? null,
        approvedBy: p.approvedBy ?? "",
    };
}

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
    planMonth?: string;
    origin?: ContentOrigin;
    direction?: string;
    references?: string[];
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
        planMonth: input.planMonth ?? "",
        origin: input.origin ?? "plan",
        direction: input.direction ?? "",
        references: input.references ?? [],
        visualHeadline: "",
        visualIdea: "",
        copywriting: "",
        reviewStatus: "none",
        draftNumber: "",
        revisionsUsed: 0,
        currentFileUrl: "",
        drafts: [],
        feedback: [],
        approvedAt: null,
        approvedBy: "",
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
        out.push(normalizeContentPost(JSON.parse(raw) as ContentPost));
    }
    // Sort by scheduledFor ascending (calendar order).
    return out.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
}

export async function getContentPostById(
    id: string,
): Promise<ContentPost | null> {
    try {
        const raw = await fs.readFile(fileFor(id), "utf8");
        return normalizeContentPost(JSON.parse(raw) as ContentPost);
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
