/**
 * SEO articles: the brief → published pipeline, one column per stage.
 * Nothing is created here: an article starts as an SEO article task on a
 * project, which makes its record.
 */
import Link from "next/link";
import {
    SEO_STAGES,
    listSeoArticles,
    type SeoStage,
} from "@/lib/data/seo-articles";
import { listContracts } from "@/lib/data/contracts";
import { listWorks } from "@/lib/data/works";
import { getActingMember } from "@/lib/auth";
import { seesEverything, visibleContracts } from "@/lib/scope";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<SeoStage, string> = {
    brief: "Brief",
    outline: "Outline",
    draft: "Draft",
    review: "Review",
    published: "Published",
    archived: "Archived",
};

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

const norm = (s: string) => s.trim().toLowerCase();

export default async function SeoPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
    const sp = await searchParams;
    const asQ = sp.as ? `?as=${encodeURIComponent(sp.as)}` : "";
    const [allArticles, contracts, works, member] = await Promise.all([
        listSeoArticles(),
        listContracts(),
        listWorks(),
        getActingMember(sp.as),
    ]);
    // Articles carry only a client name: a user sees those of the clients whose projects they are on.
    const myClientNames = new Set(visibleContracts(member, contracts, works).map((c) => norm(c.clientName)));
    const articles = seesEverything(member) ? allArticles : allArticles.filter((a) => myClientNames.has(norm(a.clientName)));
    const grouped = new Map<SeoStage, typeof articles>();
    for (const s of SEO_STAGES) grouped.set(s, []);
    for (const a of articles) grouped.get(a.stage)?.push(a);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">
                        SEO articles
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Brief → outline → draft → review → published, kept apart from the social calendar.
                    </p>
                    <p className="text-xs text-muted-foreground">
                        New items start as a task on a{" "}
                        <Link href={`/projects${asQ}`} className="underline">
                            project
                        </Link>
                        .
                    </p>
                </div>
            </div>

            {articles.length === 0 ? (
                <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
                    No articles yet. New items start as a task on a{" "}
                    <Link href={`/projects${asQ}`} className="underline">
                        project
                    </Link>
                    .
                </div>
            ) : null}

            {/* Pipeline */}
            <div className="grid gap-4 lg:grid-cols-3">
                {SEO_STAGES.filter((s) => s !== "archived").map((stage) => {
                    const items = grouped.get(stage) ?? [];
                    return (
                        <div
                            key={stage}
                            className="rounded-lg border bg-card"
                        >
                            <div className="flex items-center justify-between border-b p-3 text-sm font-medium">
                                <span>{STAGE_LABEL[stage]}</span>
                                <Badge variant={STAGE_TONE[stage]}>
                                    {items.length}
                                </Badge>
                            </div>
                            {items.length === 0 ? (
                                <p className="p-4 text-xs text-muted-foreground">
                                    No articles in this stage.
                                </p>
                            ) : (
                                <ul className="divide-y">
                                    {items.map((a) => (
                                        <li key={a.id} className="p-3">
                                            <Link
                                                href={`/seo/${a.id}`}
                                                className="block hover:underline"
                                            >
                                                <p className="font-medium leading-snug">
                                                    {a.title}
                                                </p>
                                                <p className="mt-1 truncate text-xs text-muted-foreground">
                                                    {a.targetKeyword || "no keyword"}
                                                    {a.assignee
                                                        ? ` · @${a.assignee}`
                                                        : ""}
                                                    {a.targetDate
                                                        ? ` · due ${a.targetDate}`
                                                        : ""}
                                                </p>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </div>

            {(grouped.get("archived") ?? []).length > 0 ? (
                <details className="rounded-lg border bg-card p-4">
                    <summary className="cursor-pointer text-sm font-medium">
                        Archived ({(grouped.get("archived") ?? []).length})
                    </summary>
                    <ul className="mt-3 divide-y">
                        {(grouped.get("archived") ?? []).map((a) => (
                            <li key={a.id} className="py-2">
                                <Link
                                    href={`/seo/${a.id}`}
                                    className="text-sm hover:underline"
                                >
                                    {a.title}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </details>
            ) : null}
        </div>
    );
}
