"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
    SEO_STAGES,
    createSeoArticle,
    deleteSeoArticle,
    setSeoStage,
    updateSeoArticle,
    type SeoStage,
} from "@/lib/data/seo-articles";

function asStage(v: FormDataEntryValue | null): SeoStage {
    const s = String(v ?? "");
    return (SEO_STAGES as readonly string[]).includes(s)
        ? (s as SeoStage)
        : "brief";
}

function asStr(v: FormDataEntryValue | null): string {
    return typeof v === "string" ? v.trim() : "";
}

function asInt(v: FormDataEntryValue | null): number {
    const n = Number(v ?? 0);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export async function createSeoArticleAction(formData: FormData) {
    const title = asStr(formData.get("title"));
    if (!title) return;
    const article = await createSeoArticle({
        title,
        clientName: asStr(formData.get("clientName")) || "Nexov",
        targetKeyword: asStr(formData.get("targetKeyword")),
        secondaryKeywords: asStr(formData.get("secondaryKeywords")),
        searchIntent: asStr(formData.get("searchIntent")),
        targetWordCount: asInt(formData.get("targetWordCount")),
        brief: asStr(formData.get("brief")),
        assignee: asStr(formData.get("assignee")),
        targetDate: asStr(formData.get("targetDate")),
    });
    revalidatePath("/seo");
    revalidatePath("/dashboard");
    redirect(`/seo/${article.id}`);
}

export async function updateSeoArticleAction(formData: FormData) {
    const id = asStr(formData.get("id"));
    if (!id) return;
    await updateSeoArticle(id, {
        title: asStr(formData.get("title")),
        clientName: asStr(formData.get("clientName")) || "Nexov",
        targetKeyword: asStr(formData.get("targetKeyword")),
        secondaryKeywords: asStr(formData.get("secondaryKeywords")),
        searchIntent: asStr(formData.get("searchIntent")),
        targetWordCount: asInt(formData.get("targetWordCount")),
        brief: asStr(formData.get("brief")),
        outline: asStr(formData.get("outline")),
        body: asStr(formData.get("body")),
        publishedUrl: asStr(formData.get("publishedUrl")),
        assignee: asStr(formData.get("assignee")),
        targetDate: asStr(formData.get("targetDate")),
    });
    revalidatePath(`/seo/${id}`);
    revalidatePath("/seo");
}

export async function setSeoStageAction(formData: FormData) {
    const id = asStr(formData.get("id"));
    if (!id) return;
    await setSeoStage(id, asStage(formData.get("stage")));
    revalidatePath(`/seo/${id}`);
    revalidatePath("/seo");
    revalidatePath("/dashboard");
}

export async function deleteSeoArticleAction(formData: FormData) {
    const id = asStr(formData.get("id"));
    if (!id) return;
    await deleteSeoArticle(id);
    revalidatePath("/seo");
    redirect("/seo");
}
