/**
 * SEO articles data adapter (single-table cutover).
 */
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import type { Database, SeoArticleRow } from "@/lib/supabase/types";
import { isSupabaseEnabled } from "@/lib/data/flag";
import * as devSeo from "@/lib/dev-store/seo-articles";

export { SEO_STAGES, wordCount } from "@/lib/dev-store/seo-articles";
export type { SeoArticle, SeoStage } from "@/lib/dev-store/seo-articles";

type SeoArticle = devSeo.SeoArticle;
type SeoStage = devSeo.SeoStage;
type UpdatePatch = Partial<Omit<SeoArticle, "id" | "createdAt">>;

type SeoInsert = Database["public"]["Tables"]["seo_articles"]["Insert"];
type SeoUpdate = Database["public"]["Tables"]["seo_articles"]["Update"];

const TABLE = "seo_articles" as const;

function rowToArticle(row: SeoArticleRow): SeoArticle {
    return {
        id: row.id,
        title: row.title,
        clientName: row.client_name,
        targetKeyword: row.target_keyword,
        secondaryKeywords: row.secondary_keywords,
        searchIntent: row.search_intent,
        targetWordCount: Number(row.target_word_count),
        brief: row.brief,
        outline: row.outline,
        body: row.body,
        publishedUrl: row.published_url,
        stage: row.stage as SeoStage,
        assignee: row.assignee,
        targetDate: row.target_date ?? "",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        publishedAt: row.published_at,
    };
}

function articleToInsert(a: SeoArticle): SeoInsert {
    return {
        id: a.id,
        title: a.title,
        client_name: a.clientName,
        target_keyword: a.targetKeyword,
        secondary_keywords: a.secondaryKeywords,
        search_intent: a.searchIntent,
        target_word_count: a.targetWordCount,
        brief: a.brief,
        outline: a.outline,
        body: a.body,
        published_url: a.publishedUrl,
        stage: a.stage,
        assignee: a.assignee,
        target_date: a.targetDate || null,
        created_at: a.createdAt,
        updated_at: a.updatedAt,
        published_at: a.publishedAt,
    };
}

function patchToUpdate(patch: UpdatePatch): SeoUpdate {
    const out: SeoUpdate = {};
    if (patch.title !== undefined) out.title = patch.title;
    if (patch.clientName !== undefined) out.client_name = patch.clientName;
    if (patch.targetKeyword !== undefined)
        out.target_keyword = patch.targetKeyword;
    if (patch.secondaryKeywords !== undefined)
        out.secondary_keywords = patch.secondaryKeywords;
    if (patch.searchIntent !== undefined)
        out.search_intent = patch.searchIntent;
    if (patch.targetWordCount !== undefined)
        out.target_word_count = patch.targetWordCount;
    if (patch.brief !== undefined) out.brief = patch.brief;
    if (patch.outline !== undefined) out.outline = patch.outline;
    if (patch.body !== undefined) out.body = patch.body;
    if (patch.publishedUrl !== undefined)
        out.published_url = patch.publishedUrl;
    if (patch.stage !== undefined) out.stage = patch.stage;
    if (patch.assignee !== undefined) out.assignee = patch.assignee;
    if (patch.targetDate !== undefined)
        out.target_date = patch.targetDate || null;
    if (patch.publishedAt !== undefined) out.published_at = patch.publishedAt;
    if (patch.updatedAt !== undefined) out.updated_at = patch.updatedAt;
    return out;
}

export async function createSeoArticle(input: {
    title: string;
    clientName?: string;
    targetKeyword?: string;
    secondaryKeywords?: string;
    searchIntent?: string;
    targetWordCount?: number;
    brief?: string;
    assignee?: string;
    targetDate?: string;
}): Promise<SeoArticle> {
    if (!isSupabaseEnabled("seo")) return devSeo.createSeoArticle(input);
    const now = new Date().toISOString();
    const article: SeoArticle = {
        id: randomUUID(),
        title: input.title,
        clientName: input.clientName ?? "Nexov",
        targetKeyword: input.targetKeyword ?? "",
        secondaryKeywords: input.secondaryKeywords ?? "",
        searchIntent: input.searchIntent ?? "",
        targetWordCount: input.targetWordCount ?? 0,
        brief: input.brief ?? "",
        outline: "",
        body: "",
        publishedUrl: "",
        stage: "brief",
        assignee: input.assignee ?? "",
        targetDate: input.targetDate ?? "",
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
    };
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .insert(articleToInsert(article))
        .select("*")
        .single();
    if (error) throw new Error(`createSeoArticle: ${error.message}`);
    return rowToArticle(data as SeoArticleRow);
}

export async function listSeoArticles(): Promise<SeoArticle[]> {
    if (!isSupabaseEnabled("seo")) return devSeo.listSeoArticles();
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .order("updated_at", { ascending: false });
    if (error) throw new Error(`listSeoArticles: ${error.message}`);
    return (data as SeoArticleRow[]).map(rowToArticle);
}

export async function getSeoArticleById(
    id: string,
): Promise<SeoArticle | null> {
    if (!isSupabaseEnabled("seo")) return devSeo.getSeoArticleById(id);
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("id", id)
        .maybeSingle();
    if (error) throw new Error(`getSeoArticleById: ${error.message}`);
    return data ? rowToArticle(data as SeoArticleRow) : null;
}

export async function updateSeoArticle(
    id: string,
    patch: UpdatePatch,
): Promise<SeoArticle> {
    if (!isSupabaseEnabled("seo")) return devSeo.updateSeoArticle(id, patch);
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .update(patchToUpdate(patch))
        .eq("id", id)
        .select("*")
        .single();
    if (error) throw new Error(`updateSeoArticle: ${error.message}`);
    return rowToArticle(data as SeoArticleRow);
}

export async function setSeoStage(
    id: string,
    stage: SeoStage,
): Promise<SeoArticle> {
    const patch: UpdatePatch = { stage };
    if (stage === "published") patch.publishedAt = new Date().toISOString();
    else patch.publishedAt = null;
    return updateSeoArticle(id, patch);
}

export async function deleteSeoArticle(id: string): Promise<void> {
    if (!isSupabaseEnabled("seo")) return devSeo.deleteSeoArticle(id);
    const sb = createServiceClient();
    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`deleteSeoArticle: ${error.message}`);
}
