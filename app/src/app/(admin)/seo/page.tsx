import Link from "next/link";
import {
    SEO_STAGES,
    listSeoArticles,
    type SeoStage,
} from "@/lib/data/seo-articles";
import { listClients } from "@/lib/data/clients";
import { listTeamMembers } from "@/lib/data/team";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { createSeoArticleAction } from "@/lib/seo-articles/actions";

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

export default async function SeoPage() {
    const [articles, clients, team] = await Promise.all([
        listSeoArticles(),
        listClients(),
        listTeamMembers(),
    ]);
    const grouped = new Map<SeoStage, typeof articles>();
    for (const s of SEO_STAGES) grouped.set(s, []);
    for (const a of articles) grouped.get(a.stage)?.push(a);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold md:text-3xl">
                    SEO articles
                </h1>
                <p className="text-sm text-muted-foreground">
                    Brief → outline → draft → review → published. Tracks the
                    long-form content pipeline separately from the social
                    calendar.
                </p>
            </div>

            <form
                action={createSeoArticleAction}
                className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
            >
                <h2 className="text-sm font-medium">New article brief</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-sm">Working title</Label>
                        <Input
                            name="title"
                            required
                            placeholder='e.g. "Best web design agency in Kuala Lumpur"'
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Client</Label>
                        <Input
                            name="clientName"
                            list="clients-datalist"
                            defaultValue="Nexov"
                            placeholder="Nexov"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Assignee</Label>
                        <Select name="assignee" defaultValue="none">
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
                            placeholder="e.g. seo agency malaysia"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">
                            Secondary keywords (comma-separated)
                        </Label>
                        <Input
                            name="secondaryKeywords"
                            placeholder="local seo, search engine optimization"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Search intent</Label>
                        <Input
                            name="searchIntent"
                            placeholder="informational | commercial | transactional"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Target word count</Label>
                        <Input
                            name="targetWordCount"
                            type="number"
                            min={0}
                            step={100}
                            placeholder="1500"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Target publish date</Label>
                        <Input name="targetDate" type="date" />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-sm">Brief / angle</Label>
                        <Textarea
                            name="brief"
                            rows={3}
                            placeholder="What angle, why now, internal links to include, anything important about tone or format."
                        />
                    </div>
                </div>
                <div className="flex justify-end">
                    <Button type="submit">Create brief</Button>
                </div>
                {/* Datalist used by clientName autocomplete */}
                <datalist id="clients-datalist">
                    {clients.map((c) => (
                        <option key={c.id} value={c.name} />
                    ))}
                </datalist>
            </form>

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
