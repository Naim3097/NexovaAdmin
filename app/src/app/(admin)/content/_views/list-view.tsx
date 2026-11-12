/**
 * List view of a Delivery content page: Static posts (/static-posts) or Video
 * posts (/video-posts). Shows only the posts of that kind (`contentKind`),
 * filtered by status and client, for whoever `?as=` picks. There is no create
 * form: posts come from the project page, where a Static post or Video post
 * task brings its post here (the create action stays for other callers).
 */
import Link from "next/link";
import { CONTENT_STATUSES, listContentPosts, type ContentStatus } from "@/lib/data/content";
import { listContracts } from "@/lib/data/contracts";
import { listWorks } from "@/lib/data/works";
import { getActingMember } from "@/lib/auth";
import { assignedContractIds, seesEverything, visibleContracts } from "@/lib/scope";
import {
    CONTENT_KIND_BLURB,
    CONTENT_KIND_LABEL,
    CONTENT_KIND_TASK,
    linkedTaskTypes,
    postsOfKind,
    type ContentKind,
} from "@/lib/content/kind";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ContentViewLinks } from "./view-links";

export type ContentListParams = { status?: string; client?: string; as?: string };

const norm = (s: string) => s.trim().toLowerCase();

const STATUS_VARIANT: Record<ContentStatus, "default" | "secondary" | "destructive" | "outline"> = {
    idea: "secondary",
    draft: "outline",
    review: "outline",
    scheduled: "default",
    posted: "default",
    archived: "outline",
};

export async function ContentListView({ kind, params: sp }: { kind: ContentKind; params: ContentListParams }) {
    const [allPosts, allContracts, works, member] = await Promise.all([
        listContentPosts(),
        listContracts(),
        listWorks(),
        getActingMember(sp.as),
    ]);
    const kindPosts = postsOfKind(allPosts, kind, linkedTaskTypes(works));
    // A user sees the posts of the projects they are on: linked by project, else by the project's client name.
    const contracts = visibleContracts(member, allContracts, works);
    const myContractIds = assignedContractIds(member, allContracts, works);
    const myClientNames = new Set(contracts.map((c) => norm(c.clientName)));
    const posts = seesEverything(member)
        ? kindPosts
        : kindPosts.filter((p) => (p.contractId && myContractIds.has(p.contractId)) || myClientNames.has(norm(p.clientName)));

    const client = sp.client?.trim().toLowerCase() ?? "";
    const filtered = posts.filter((p) => {
        if (sp.status && sp.status !== "all" && p.status !== sp.status) return false;
        if (client && !p.clientName.toLowerCase().includes(client)) return false;
        return true;
    });
    const label = CONTENT_KIND_LABEL[kind];

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">{label}</h1>
                    <p className="text-sm text-muted-foreground">{CONTENT_KIND_BLURB[kind]}</p>
                    <p className="text-xs text-muted-foreground">
                        Added on the account: each {CONTENT_KIND_TASK[kind]} task brings its post here.
                    </p>
                </div>
                <ContentViewLinks kind={kind} current="list" as={sp.as} />
            </div>

            {/* Filters */}
            <form
                method="get"
                className="flex flex-col gap-2 rounded-lg border bg-card p-3 md:flex-row md:items-end md:gap-3"
            >
                {sp.as ? <input type="hidden" name="as" value={sp.as} /> : null}
                <div className="space-y-1.5 md:w-56">
                    <Label className="text-xs">Status</Label>
                    <Select name="status" defaultValue={sp.status ?? "all"}>
                        <SelectTrigger className="h-10">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            {CONTENT_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                    {s}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex-1 space-y-1.5">
                    <Label className="text-xs">Client</Label>
                    <Input name="client" defaultValue={sp.client ?? ""} placeholder="filter by client name" />
                </div>
                <Button type="submit" variant="outline">
                    Filter
                </Button>
            </form>

            {/* List */}
            <div className="rounded-lg border bg-card">
                <div className="border-b p-4 text-sm font-medium">
                    {label} ({filtered.length} of {posts.length})
                </div>
                {filtered.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">
                        {posts.length === 0
                            ? `No ${label.toLowerCase()} yet. Add a ${CONTENT_KIND_TASK[kind]} task on an account.`
                            : "No posts match the current filters."}
                    </p>
                ) : (
                    <ul className="divide-y">
                        {filtered.map((p) => (
                            <li
                                key={p.id}
                                className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
                            >
                                <div className="min-w-0 flex-1">
                                    <Link href={`/content/${p.id}`} className="font-medium hover:underline">
                                        {p.title}
                                    </Link>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {p.clientName} · {p.platform} · {p.type} · {p.scheduledFor}
                                        {p.scheduledTime ? ` ${p.scheduledTime}` : ""}
                                        {p.assignee ? ` · @${p.assignee}` : ""}
                                    </p>
                                </div>
                                <Badge variant={STATUS_VARIANT[p.status]}>{p.status}</Badge>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
