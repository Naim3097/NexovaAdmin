/**
 * Content posts data adapter.
 *
 * Single-table cutover. Same pattern as leads: 5 dispatched primitives + a
 * tiny `setContentStatus` helper that composes `updateContentPost`.
 */
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import type { Database, ContentPostRow } from "@/lib/supabase/types";
import { isSupabaseEnabled } from "@/lib/data/flag";
import { notify } from "@/lib/data/notifications";
import { listClients } from "@/lib/data/clients";
import * as devContent from "@/lib/dev-store/content";

export {
    CONTENT_STATUSES,
    CONTENT_PLATFORMS,
    CONTENT_TYPES,
    CONTENT_ORIGINS,
    CONTENT_REVIEW_STATUSES,
    CONTENT_DRAFT_STAGES,
    CONTENT_ASSET_TYPES,
} from "@/lib/dev-store/content";
export type {
    ContentPost,
    ContentPlatform,
    ContentStatus,
    ContentType,
    ContentOrigin,
    ContentReviewStatus,
    ContentDraftStage,
    ContentDraft,
    ContentFeedback,
    ContentMedia,
    ContentAssetType,
} from "@/lib/dev-store/content";

type ContentPost = devContent.ContentPost;
type ContentStatus = devContent.ContentStatus;
type ContentPlatform = devContent.ContentPlatform;
type ContentType = devContent.ContentType;
type ContentOrigin = devContent.ContentOrigin;
type ContentReviewStatus = devContent.ContentReviewStatus;
type ContentDraft = devContent.ContentDraft;
type ContentFeedback = devContent.ContentFeedback;
type ContentMedia = devContent.ContentMedia;
type ContentAssetType = devContent.ContentAssetType;
type UpdatePatch = Partial<Omit<ContentPost, "id" | "createdAt">>;

type ContentInsert = Database["public"]["Tables"]["content_posts"]["Insert"];
type ContentUpdate = Database["public"]["Tables"]["content_posts"]["Update"];

const TABLE = "content_posts" as const;

function rowToPost(row: ContentPostRow): ContentPost {
    return {
        id: row.id,
        title: row.title,
        clientName: row.client_name,
        projectId: row.project_id,
        platform: row.platform as ContentPlatform,
        type: row.type as ContentType,
        status: row.status as ContentStatus,
        scheduledFor: row.scheduled_for,
        scheduledTime: row.scheduled_time,
        caption: row.caption,
        hashtags: row.hashtags,
        notes: row.notes,
        assignee: row.assignee,
        planMonth: row.plan_month,
        origin: row.origin as ContentOrigin,
        direction: row.direction,
        references: (row.reference_links ?? []) as string[],
        visualHeadline: row.visual_headline,
        visualIdea: row.visual_idea,
        copywriting: row.copywriting,
        billable: row.billable,
        billableRevisions: row.billable_revisions,
        reviewStatus: row.review_status as ContentReviewStatus,
        draftNumber: row.draft_number,
        revisionsUsed: row.revisions_used,
        currentFileUrl: row.current_file_url,
        drafts: (row.drafts ?? []) as ContentDraft[],
        feedback: (row.feedback ?? []) as ContentFeedback[],
        approvedAt: row.approved_at,
        approvedBy: row.approved_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        postedAt: row.posted_at,
    };
}

function postToInsert(p: ContentPost): ContentInsert {
    return {
        id: p.id,
        title: p.title,
        client_name: p.clientName,
        project_id: p.projectId,
        platform: p.platform,
        type: p.type,
        status: p.status,
        scheduled_for: p.scheduledFor,
        scheduled_time: p.scheduledTime,
        caption: p.caption,
        hashtags: p.hashtags,
        notes: p.notes,
        assignee: p.assignee,
        plan_month: p.planMonth,
        origin: p.origin,
        direction: p.direction,
        reference_links: p.references,
        visual_headline: p.visualHeadline,
        visual_idea: p.visualIdea,
        copywriting: p.copywriting,
        billable: p.billable,
        billable_revisions: p.billableRevisions,
        review_status: p.reviewStatus,
        draft_number: p.draftNumber,
        revisions_used: p.revisionsUsed,
        current_file_url: p.currentFileUrl,
        drafts: p.drafts,
        feedback: p.feedback,
        approved_at: p.approvedAt,
        approved_by: p.approvedBy,
        created_at: p.createdAt,
        updated_at: p.updatedAt,
        posted_at: p.postedAt,
    };
}

function patchToUpdate(patch: UpdatePatch): ContentUpdate {
    const out: ContentUpdate = {};
    if (patch.title !== undefined) out.title = patch.title;
    if (patch.clientName !== undefined) out.client_name = patch.clientName;
    if (patch.projectId !== undefined) out.project_id = patch.projectId;
    if (patch.platform !== undefined) out.platform = patch.platform;
    if (patch.type !== undefined) out.type = patch.type;
    if (patch.status !== undefined) out.status = patch.status;
    if (patch.scheduledFor !== undefined) out.scheduled_for = patch.scheduledFor;
    if (patch.scheduledTime !== undefined)
        out.scheduled_time = patch.scheduledTime;
    if (patch.caption !== undefined) out.caption = patch.caption;
    if (patch.hashtags !== undefined) out.hashtags = patch.hashtags;
    if (patch.notes !== undefined) out.notes = patch.notes;
    if (patch.assignee !== undefined) out.assignee = patch.assignee;
    if (patch.planMonth !== undefined) out.plan_month = patch.planMonth;
    if (patch.origin !== undefined) out.origin = patch.origin;
    if (patch.direction !== undefined) out.direction = patch.direction;
    if (patch.references !== undefined) out.reference_links = patch.references;
    if (patch.visualHeadline !== undefined)
        out.visual_headline = patch.visualHeadline;
    if (patch.visualIdea !== undefined) out.visual_idea = patch.visualIdea;
    if (patch.copywriting !== undefined) out.copywriting = patch.copywriting;
    if (patch.billable !== undefined) out.billable = patch.billable;
    if (patch.billableRevisions !== undefined)
        out.billable_revisions = patch.billableRevisions;
    if (patch.reviewStatus !== undefined) out.review_status = patch.reviewStatus;
    if (patch.draftNumber !== undefined) out.draft_number = patch.draftNumber;
    if (patch.revisionsUsed !== undefined)
        out.revisions_used = patch.revisionsUsed;
    if (patch.currentFileUrl !== undefined)
        out.current_file_url = patch.currentFileUrl;
    if (patch.drafts !== undefined) out.drafts = patch.drafts;
    if (patch.feedback !== undefined) out.feedback = patch.feedback;
    if (patch.approvedAt !== undefined) out.approved_at = patch.approvedAt;
    if (patch.approvedBy !== undefined) out.approved_by = patch.approvedBy;
    if (patch.postedAt !== undefined) out.posted_at = patch.postedAt;
    if (patch.updatedAt !== undefined) out.updated_at = patch.updatedAt;
    return out;
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
    billable?: boolean;
}): Promise<ContentPost> {
    if (!isSupabaseEnabled("content")) return devContent.createContentPost(input);

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
        billable: input.billable ?? false,
        billableRevisions: 0,
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
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .insert(postToInsert(post))
        .select("*")
        .single();
    if (error) throw new Error(`createContentPost: ${error.message}`);
    return rowToPost(data as ContentPostRow);
}

export async function listContentPosts(): Promise<ContentPost[]> {
    if (!isSupabaseEnabled("content")) return devContent.listContentPosts();
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .order("scheduled_for", { ascending: true });
    if (error) throw new Error(`listContentPosts: ${error.message}`);
    return (data as ContentPostRow[]).map(rowToPost);
}

export async function getContentPostById(
    id: string,
): Promise<ContentPost | null> {
    if (!isSupabaseEnabled("content")) return devContent.getContentPostById(id);
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("id", id)
        .maybeSingle();
    if (error) throw new Error(`getContentPostById: ${error.message}`);
    return data ? rowToPost(data as ContentPostRow) : null;
}

export async function updateContentPost(
    id: string,
    patch: UpdatePatch,
): Promise<ContentPost> {
    if (!isSupabaseEnabled("content")) return devContent.updateContentPost(id, patch);
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .update(patchToUpdate(patch))
        .eq("id", id)
        .select("*")
        .single();
    if (error) throw new Error(`updateContentPost: ${error.message}`);
    return rowToPost(data as ContentPostRow);
}

export async function setContentStatus(
    id: string,
    status: ContentStatus,
): Promise<ContentPost> {
    const patch: UpdatePatch = { status };
    if (status === "posted") patch.postedAt = new Date().toISOString();
    else patch.postedAt = null;
    return updateContentPost(id, patch);
}

/**
 * Generate a client's monthly content plan: create `quota` placeholder content
 * posts for the given month (origin 'plan'), replacing Axtra's hardcoded
 * per-client deliverable lists. Idempotent per (client, month): if a plan
 * already exists it creates nothing and reports the existing count.
 *
 * @returns the number of posts created (0 if a plan already existed or quota<=0)
 */
export async function generateMonthlyPlan(input: {
    clientName: string;
    month: string; // 'YYYY-MM'
    quota: number;
    type?: ContentType;
    platform?: ContentPlatform;
}): Promise<{ created: number; existing: number }> {
    const { clientName, month, quota } = input;
    if (!clientName || !/^\d{4}-\d{2}$/.test(month)) {
        throw new Error("generateMonthlyPlan: clientName and YYYY-MM month required");
    }

    const all = await listContentPosts();
    const existing = all.filter(
        (p) => p.clientName === clientName && p.planMonth === month,
    );
    if (existing.length > 0 || quota <= 0) {
        return { created: 0, existing: existing.length };
    }

    const scheduledFor = `${month}-01`;
    for (let i = 1; i <= quota; i++) {
        await createContentPost({
            title: `${month} · Content ${i}`,
            clientName,
            scheduledFor,
            type: input.type ?? "post",
            platform: input.platform ?? "instagram",
            planMonth: month,
            origin: "plan",
        });
    }
    return { created: quota, existing: 0 };
}

/**
 * Agency submits a new draft version of a content item for client review.
 * Appends to drafts[], advances the draft stage, moves the item into the
 * 'awaiting_client' review state, and notifies (in-app + Telegram).
 *
 * Built on the dual-pathed getContentPostById + updateContentPost, so it works
 * the same in dev-store and Supabase mode.
 */
export async function submitDraft(input: {
    id: string;
    draftNumber: string;
    media: ContentMedia[];
    assetType?: ContentAssetType;
    caption?: string;
    submittedBy?: string;
}): Promise<ContentPost> {
    const post = await getContentPostById(input.id);
    if (!post) throw new Error(`submitDraft: content post ${input.id} not found`);
    if (input.media.length === 0) {
        throw new Error("submitDraft: at least one asset is required");
    }

    const assetType: ContentAssetType =
        input.assetType ??
        (input.media.some((m) => m.type === "video")
            ? "video"
            : input.media.length > 1
                ? "carousel"
                : "image");
    const fileUrl = input.media[0]?.url ?? "";

    const draft: ContentDraft = {
        id: randomUUID(),
        draftNumber: input.draftNumber,
        fileUrl,
        media: input.media,
        assetType,
        caption: input.caption ?? "",
        submittedAt: new Date().toISOString(),
        submittedBy: input.submittedBy ?? "agency",
    };

    const updated = await updateContentPost(input.id, {
        drafts: [...post.drafts, draft],
        currentFileUrl: fileUrl,
        draftNumber: input.draftNumber,
        caption: input.caption?.trim() ? input.caption : post.caption,
        reviewStatus: "awaiting_client",
        status: "review",
    });

    await notify({
        kind: "content_draft_submitted",
        title: `Draft sent for review: ${post.title}`,
        body: `${post.clientName} · ${input.draftNumber}`,
        link: `/content/${input.id}`,
    });

    return updated;
}

/** Resolve a client's capped revision limit by name (defaults to 3). */
async function revisionLimitFor(clientName: string): Promise<number> {
    const clients = await listClients();
    const c = clients.find(
        (x) => x.name.trim().toLowerCase() === clientName.trim().toLowerCase(),
    );
    return c?.contentRevisionLimit ?? 3;
}

/**
 * Client requests changes on the current draft. Appends a client feedback entry
 * and moves the item to 'changes_requested'. Revisions BEYOND the client's limit
 * are still allowed but flagged billable (billable_revisions++) so they flow into
 * the report + invoice. Returns an error only on a true block (already approved /
 * no draft yet); `billable` says whether this revision is chargeable.
 */
export async function requestChanges(input: {
    id: string;
    body: string;
    fileUrl?: string;
}): Promise<{ post?: ContentPost; error?: string; billable?: boolean }> {
    const post = await getContentPostById(input.id);
    if (!post) return { error: "Content not found." };
    if (post.reviewStatus === "approved") {
        return { error: "This content is already approved." };
    }
    if (post.drafts.length === 0) {
        return { error: "There is no draft to give feedback on yet." };
    }
    const limit = await revisionLimitFor(post.clientName);
    const cycle = post.revisionsUsed + 1;
    const isExtra = post.revisionsUsed >= limit;

    const entry: ContentFeedback = {
        id: randomUUID(),
        draftId: post.drafts[post.drafts.length - 1]?.id ?? "",
        author: "client",
        body: input.body,
        fileUrl: input.fileUrl ?? "",
        cycle,
        createdAt: new Date().toISOString(),
    };

    const updated = await updateContentPost(input.id, {
        feedback: [...post.feedback, entry],
        revisionsUsed: cycle,
        billableRevisions: post.billableRevisions + (isExtra ? 1 : 0),
        reviewStatus: "changes_requested",
        status: "review",
    });

    await notify({
        kind: "content_changes_requested",
        title: `Changes requested: ${post.title}`,
        body: `${post.clientName} · revision ${cycle}${isExtra ? " (chargeable extra)" : ` of ${limit}`}`,
        link: `/content/${input.id}`,
    });

    return { post: updated, billable: isExtra };
}

/** Client approves the current draft — terminal for the review loop. */
export async function approveContent(input: {
    id: string;
    by?: string;
}): Promise<ContentPost> {
    const post = await getContentPostById(input.id);
    if (!post) throw new Error(`approveContent: content ${input.id} not found`);
    if (post.reviewStatus === "approved") return post;

    const updated = await updateContentPost(input.id, {
        reviewStatus: "approved",
        approvedAt: new Date().toISOString(),
        approvedBy: input.by ?? "client",
    });

    await notify({
        kind: "content_approved",
        title: `Content approved: ${post.title}`,
        body: `${post.clientName}${post.draftNumber ? ` · ${post.draftNumber}` : ""}`,
        link: `/content/${input.id}`,
    });

    return updated;
}

/**
 * Client submits a one-off content request (Track B). Creates a content_posts
 * row with origin 'request' and notifies the agency.
 */
export async function createContentRequest(input: {
    clientName: string;
    title: string;
    instructions?: string;
    direction?: string;
    references?: string[];
    planMonth?: string;
    scheduledFor?: string;
    billable?: boolean;
}): Promise<ContentPost> {
    const month = input.planMonth || new Date().toISOString().slice(0, 7);
    const post = await createContentPost({
        title: input.title,
        clientName: input.clientName,
        scheduledFor:
            input.scheduledFor || `${month}-01`,
        notes: input.instructions ?? "",
        direction: input.direction ?? "",
        references: input.references ?? [],
        planMonth: month,
        origin: "request",
        billable: input.billable ?? false,
    });

    await notify({
        kind: "system",
        title: `New content request from ${input.clientName}`,
        body: input.title,
        link: `/content/${post.id}`,
    });

    return post;
}

export async function deleteContentPost(id: string): Promise<void> {
    if (!isSupabaseEnabled("content")) return devContent.deleteContentPost(id);
    const sb = createServiceClient();
    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`deleteContentPost: ${error.message}`);
}
