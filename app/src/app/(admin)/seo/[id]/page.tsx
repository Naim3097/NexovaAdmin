import Link from "next/link";
import { notFound } from "next/navigation";
import {
    SEO_STAGES,
    getSeoArticleById,
    wordCount,
    type SeoStage,
} from "@/lib/data/seo-articles";
import { listTeamMembers } from "@/lib/data/team";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    deleteSeoArticleAction,
    setSeoStageAction,
    updateSeoArticleAction,
} from "@/lib/seo-articles/actions";

export const dynamic = "force-dynamic";

const STAGE_TONE: Record<
    SeoStage,
    "default" | "secondary" | "outline" | "destructive"
> = {
    brief: "outline",
    outline: "secondary",
    draft: "secondary",
    review: "default",
    published: "default",
    archived: "outline",
};

export default async function SeoArticleDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const article = await getSeoArticleById(id);
    if (!article) notFound();
    const team = await listTeamMembers();
    const wc = wordCount(article.body);
    const wcPct = article.targetWordCount
        ? Math.min(100, Math.round((wc / article.targetWordCount) * 100))
        : 0;

    const reviewChecklist = [
        { key: "kw", label: "Target keyword in title", ok: hasKeyword(article.title, article.targetKeyword) },
        { key: "kwBody", label: "Target keyword appears in body", ok: hasKeyword(article.body, article.targetKeyword) },
        { key: "outline", label: "Outline present", ok: article.outline.trim().length > 0 },
        { key: "wc", label: `Body ≥ target word count${article.targetWordCount ? ` (${article.targetWordCount})` : ""}`, ok: article.targetWordCount === 0 || wc >= article.targetWordCount },
        { key: "h2", label: "Has at least one H2 (## ) heading", ok: /^##\s/m.test(article.body) },
    ];

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/seo"
                    className="text-sm text-muted-foreground hover:underline"
                >
                    ← Back to SEO
                </Link>
                <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <h1 className="text-2xl font-semibold md:text-3xl">
                        {article.title}
                    </h1>
                    <div className="flex items-center gap-2">
                        <Badge variant={STAGE_TONE[article.stage]}>
                            {article.stage}
                        </Badge>
                        {article.assignee ? (
                            <Badge variant="secondary">
                                @{article.assignee}
                            </Badge>
                        ) : null}
                    </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                    Client: {article.clientName}
                    {article.targetDate ? ` · due ${article.targetDate}` : ""}
                    {article.publishedAt
                        ? ` · published ${new Date(article.publishedAt).toLocaleDateString()}`
                        : ""}
                </p>
            </div>

            {/* Stage controls */}
            <section className="rounded-lg border bg-card p-4 md:p-6">
                <h2 className="text-sm font-medium">Move stage</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                    {SEO_STAGES.map((s) => (
                        <form key={s} action={setSeoStageAction}>
                            <input type="hidden" name="id" value={article.id} />
                            <input type="hidden" name="stage" value={s} />
                            <Button
                                type="submit"
                                size="sm"
                                variant={
                                    article.stage === s ? "default" : "outline"
                                }
                                disabled={article.stage === s}
                            >
                                {s}
                            </Button>
                        </form>
                    ))}
                </div>
            </section>

            {/* Edit form */}
            <form
                action={updateSeoArticleAction}
                className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
            >
                <input type="hidden" name="id" value={article.id} />
                <h2 className="text-sm font-medium">Brief & metadata</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-sm">Title</Label>
                        <Input name="title" defaultValue={article.title} required />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Client</Label>
                        <Input name="clientName" defaultValue={article.clientName} />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Assignee</Label>
                        <Select
                            name="assignee"
                            defaultValue={article.assignee || "none"}
                        >
                            <SelectTrigger className="h-11">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Unassigned</SelectItem>
                                {team
                                    .filter((m) => m.active)
                                    .map((m) => (
                                        <SelectItem key={m.id} value={m.name}>
                                            {m.name} ({m.role})
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Target keyword</Label>
                        <Input
                            name="targetKeyword"
                            defaultValue={article.targetKeyword}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Secondary keywords</Label>
                        <Input
                            name="secondaryKeywords"
                            defaultValue={article.secondaryKeywords}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Search intent</Label>
                        <Input
                            name="searchIntent"
                            defaultValue={article.searchIntent}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Target word count</Label>
                        <Input
                            name="targetWordCount"
                            type="number"
                            min={0}
                            step={100}
                            defaultValue={article.targetWordCount}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Target publish date</Label>
                        <Input
                            name="targetDate"
                            type="date"
                            defaultValue={article.targetDate}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Published URL</Label>
                        <Input
                            name="publishedUrl"
                            type="url"
                            defaultValue={article.publishedUrl}
                            placeholder="https://…"
                        />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-sm">Brief</Label>
                        <Textarea
                            name="brief"
                            rows={3}
                            defaultValue={article.brief}
                        />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-sm">Outline (markdown)</Label>
                        <Textarea
                            name="outline"
                            rows={6}
                            defaultValue={article.outline}
                            placeholder={"## H2\n- bullet\n## H2"}
                            className="font-mono text-sm"
                        />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                        <div className="flex items-baseline justify-between">
                            <Label className="text-sm">Body (markdown)</Label>
                            <span className="text-xs text-muted-foreground">
                                {wc} words
                                {article.targetWordCount
                                    ? ` / ${article.targetWordCount} (${wcPct}%)`
                                    : ""}
                            </span>
                        </div>
                        <Textarea
                            name="body"
                            rows={20}
                            defaultValue={article.body}
                            className="font-mono text-sm"
                        />
                    </div>
                </div>
                <div className="flex justify-end">
                    <Button type="submit">Save</Button>
                </div>
            </form>

            {/* Review checklist */}
            <section className="rounded-lg border bg-card p-4 md:p-6">
                <h2 className="text-sm font-medium">Review checklist</h2>
                <p className="text-xs text-muted-foreground">
                    Mechanical checks. Editorial review still needed before
                    publishing.
                </p>
                <ul className="mt-3 space-y-2 text-sm">
                    {reviewChecklist.map((c) => (
                        <li key={c.key} className="flex items-center gap-2">
                            <span
                                className={
                                    c.ok
                                        ? "text-green-600 dark:text-green-400"
                                        : "text-muted-foreground"
                                }
                                aria-hidden
                            >
                                {c.ok ? "✓" : "○"}
                            </span>
                            <span className={c.ok ? "" : "text-muted-foreground"}>
                                {c.label}
                            </span>
                        </li>
                    ))}
                </ul>
            </section>

            {/* Delete */}
            <form
                action={deleteSeoArticleAction}
                className="rounded-lg border border-destructive/30 bg-card p-4 md:p-6"
            >
                <input type="hidden" name="id" value={article.id} />
                <h2 className="text-sm font-medium text-destructive">
                    Danger zone
                </h2>
                <p className="text-xs text-muted-foreground">
                    Permanently deletes this article from the local store.
                </p>
                <div className="mt-3">
                    <Button type="submit" variant="destructive" size="sm">
                        Delete article
                    </Button>
                </div>
            </form>
        </div>
    );
}

function hasKeyword(text: string, kw: string): boolean {
    if (!kw.trim()) return false;
    return text.toLowerCase().includes(kw.toLowerCase());
}
