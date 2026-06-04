/**
 * DEV-ONLY local file store for SEO articles.
 * Replaced by Supabase `seo_articles` once provisioned.
 *
 * Distinct from `content_posts` (social calendar) — articles have a longer
 * workflow (brief → outline → draft → review → published) and richer
 * fields (target keyword, outline, body, word count). Kept separate so
 * neither store grows half-applicable fields.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = path.join(process.cwd(), ".dev-data");
const SEO_DIR = path.join(ROOT, "seo-articles");

export const SEO_STAGES = [
    "brief",
    "outline",
    "draft",
    "review",
    "published",
    "archived",
] as const;
export type SeoStage = (typeof SEO_STAGES)[number];

export type SeoArticle = {
    id: string;
    title: string;
    /** "Nexov" for in-house, otherwise client name. */
    clientName: string;
    targetKeyword: string;
    /** Comma-separated supporting keywords / LSI terms. */
    secondaryKeywords: string;
    /** Free-text intent: informational | commercial | transactional | … */
    searchIntent: string;
    targetWordCount: number;
    /** Brief notes from the strategist. */
    brief: string;
    /** Markdown-ish outline (H2/H3 list). */
    outline: string;
    /** The actual article body (markdown). */
    body: string;
    /** URL once published. Empty if not published. */
    publishedUrl: string;
    stage: SeoStage;
    assignee: string;
    /** YYYY-MM-DD target publish date. Empty = unscheduled. */
    targetDate: string;
    createdAt: string;
    updatedAt: string;
    publishedAt: string | null;
};

async function ensureDir() {
    await fs.mkdir(SEO_DIR, { recursive: true });
}

function fileFor(id: string) {
    return path.join(SEO_DIR, `${id}.json`);
}

function backfill(a: SeoArticle): SeoArticle {
    // Defensive defaults so older JSON loads without crashing.
    return {
        ...a,
        secondaryKeywords: a.secondaryKeywords ?? "",
        searchIntent: a.searchIntent ?? "",
        targetWordCount: a.targetWordCount ?? 0,
        brief: a.brief ?? "",
        outline: a.outline ?? "",
        body: a.body ?? "",
        publishedUrl: a.publishedUrl ?? "",
        assignee: a.assignee ?? "",
        targetDate: a.targetDate ?? "",
        publishedAt: a.publishedAt ?? null,
    };
}

/** Word count from a markdown body (rough — splits on whitespace). */
export function wordCount(text: string): number {
    if (!text) return 0;
    const stripped = text
        .replace(/```[\s\S]*?```/g, " ") // code blocks
        .replace(/[#>*_\-`!\[\](){}]/g, " "); // markdown punctuation
    return stripped.split(/\s+/).filter(Boolean).length;
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
    await ensureDir();
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
    await fs.writeFile(
        fileFor(article.id),
        JSON.stringify(article, null, 2),
        "utf8",
    );
    return article;
}

export async function listSeoArticles(): Promise<SeoArticle[]> {
    await ensureDir();
    const entries = await fs.readdir(SEO_DIR);
    const out: SeoArticle[] = [];
    for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const raw = await fs.readFile(path.join(SEO_DIR, entry), "utf8");
        out.push(backfill(JSON.parse(raw) as SeoArticle));
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getSeoArticleById(
    id: string,
): Promise<SeoArticle | null> {
    try {
        const raw = await fs.readFile(fileFor(id), "utf8");
        return backfill(JSON.parse(raw) as SeoArticle);
    } catch {
        return null;
    }
}

export async function updateSeoArticle(
    id: string,
    patch: Partial<Omit<SeoArticle, "id" | "createdAt">>,
): Promise<SeoArticle> {
    const existing = await getSeoArticleById(id);
    if (!existing) throw new Error(`SEO article ${id} not found`);
    const updated: SeoArticle = {
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(fileFor(id), JSON.stringify(updated, null, 2), "utf8");
    return updated;
}

export async function setSeoStage(
    id: string,
    stage: SeoStage,
): Promise<SeoArticle> {
    const patch: Partial<SeoArticle> = { stage };
    if (stage === "published") patch.publishedAt = new Date().toISOString();
    if (stage !== "published") patch.publishedAt = null;
    return updateSeoArticle(id, patch);
}

export async function deleteSeoArticle(id: string): Promise<void> {
    try {
        await fs.unlink(fileFor(id));
    } catch {
        // ignore
    }
}
