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
import * as devContent from "@/lib/dev-store/content";

export {
    CONTENT_STATUSES,
    CONTENT_PLATFORMS,
    CONTENT_TYPES,
    CONTENT_ORIGINS,
} from "@/lib/dev-store/content";
export type {
    ContentPost,
    ContentPlatform,
    ContentStatus,
    ContentType,
    ContentOrigin,
} from "@/lib/dev-store/content";

type ContentPost = devContent.ContentPost;
type ContentStatus = devContent.ContentStatus;
type ContentPlatform = devContent.ContentPlatform;
type ContentType = devContent.ContentType;
type ContentOrigin = devContent.ContentOrigin;
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

export async function deleteContentPost(id: string): Promise<void> {
    if (!isSupabaseEnabled("content")) return devContent.deleteContentPost(id);
    const sb = createServiceClient();
    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`deleteContentPost: ${error.message}`);
}
