import Link from "next/link";
import {
    CONTENT_PLATFORMS,
    CONTENT_STATUSES,
    CONTENT_TYPES,
    listContentPosts,
    type ContentStatus,
} from "@/lib/data/content";
import { listTeamMembers } from "@/lib/data/team";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { createContentPostAction } from "@/lib/content/actions";
import { listContracts } from "@/lib/data/contracts";
import { listWorks } from "@/lib/data/works";
import { getActingMember } from "@/lib/auth";
import { assignedContractIds, seesEverything, visibleContracts } from "@/lib/scope";
import { NewSection } from "@/components/new-button";

export const dynamic = "force-dynamic";

const norm = (s: string) => s.trim().toLowerCase();

const STATUS_VARIANT: Record<
    ContentStatus,
    "default" | "secondary" | "destructive" | "outline"
> = {
    idea: "secondary",
    draft: "outline",
    review: "outline",
    scheduled: "default",
    posted: "default",
    archived: "outline",
};

export default async function ContentPage({
    searchParams,
}: {
    searchParams: Promise<{ status?: string; client?: string; as?: string; new?: string }>;
}) {
    const sp = await searchParams;
    const [allPosts, team, allContracts, works, member] = await Promise.all([
        listContentPosts(),
        listTeamMembers(),
        listContracts(),
        listWorks(),
        getActingMember(sp.as),
    ]);
    // A user sees the posts of the projects they are on: linked by project, else by the project's client name.
    const contracts = visibleContracts(member, allContracts, works);
    const myContractIds = assignedContractIds(member, allContracts, works);
    const myClientNames = new Set(contracts.map((c) => norm(c.clientName)));
    const posts = seesEverything(member)
        ? allPosts
        : allPosts.filter((p) => (p.contractId && myContractIds.has(p.contractId)) || myClientNames.has(norm(p.clientName)));
    const openContracts = contracts.filter((c) => c.status === "active" || c.status === "draft");
    const activeTeam = team.filter((m) => m.active);

    const filtered = posts.filter((p) => {
        if (sp.status && sp.status !== "all" && p.status !== sp.status) return false;
        if (
            sp.client &&
            sp.client.trim() &&
            !p.clientName.toLowerCase().includes(sp.client.toLowerCase())
        )
            return false;
        return true;
    });

    const today = new Date().toISOString().slice(0, 10);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">Content</h1>
                    <p className="text-sm text-muted-foreground">
                        Plan, draft and schedule; publishing integrations are on hold.
                    </p>
                    <p className="text-xs text-muted-foreground">Items come from project tasks. The account manager adds them on the project.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <Link
                        href="/content/board"
                        className="text-sm font-medium underline"
                    >
                        Review board
                    </Link>
                    <Link
                        href="/content/calendar"
                        className="text-sm font-medium underline"
                    >
                        Open calendar
                    </Link>
                </div>
            </div>

            {/* Add form, folded until the button above opens it */}
            <NewSection open={sp.new === "1"} title="New post">
                <form action={createContentPostAction} className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label className="text-sm">Title</Label>
                            <Input
                                name="title"
                                required
                                placeholder="e.g. Launch teaser carousel"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Client</Label>
                            <Input name="clientName" list="clients-datalist" required placeholder="Lean.x" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Project (optional)</Label>
                            <Select name="contractId" defaultValue={"none"}>
                                <SelectTrigger className="h-10">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">— none —</SelectItem>
                                    {openContracts.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.clientName} · {c.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Platform</Label>
                            <Select name="platform" defaultValue="instagram">
                                <SelectTrigger className="h-10">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {CONTENT_PLATFORMS.map((p) => (
                                        <SelectItem key={p} value={p}>
                                            {p}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Type</Label>
                            <Select name="type" defaultValue="post">
                                <SelectTrigger className="h-10">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {CONTENT_TYPES.map((t) => (
                                        <SelectItem key={t} value={t}>
                                            {t}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Scheduled for</Label>
                            <Input
                                name="scheduledFor"
                                type="date"
                                required
                                defaultValue={today}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Time (optional)</Label>
                            <Input name="scheduledTime" type="time" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Owner</Label>
                            <Select name="assignee" defaultValue="none">
                                <SelectTrigger className="h-10">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">— No owner —</SelectItem>
                                    {activeTeam.map((m) => (
                                        <SelectItem key={m.id} value={m.name}>
                                            {m.name} ({m.role})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <Button type="submit">Add post</Button>
                    </div>
                </form>
            </NewSection>

            {/* Filters */}
            <form
                method="get"
                className="flex flex-col gap-2 rounded-lg border bg-card p-3 md:flex-row md:items-end md:gap-3"
            >
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
                    <Input
                        name="client"
                        defaultValue={sp.client ?? ""}
                        placeholder="filter by client name"
                    />
                </div>
                <Button type="submit" variant="outline">
                    Filter
                </Button>
            </form>

            {/* List */}
            <div className="rounded-lg border bg-card">
                <div className="border-b p-4 text-sm font-medium">
                    Posts ({filtered.length} of {posts.length})
                </div>
                {filtered.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">
                        No posts match the current filters.
                    </p>
                ) : (
                    <ul className="divide-y">
                        {filtered.map((p) => (
                            <li
                                key={p.id}
                                className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
                            >
                                <div className="min-w-0 flex-1">
                                    <Link
                                        href={`/content/${p.id}`}
                                        className="font-medium hover:underline"
                                    >
                                        {p.title}
                                    </Link>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {p.clientName} · {p.platform} · {p.type} ·{" "}
                                        {p.scheduledFor}
                                        {p.scheduledTime ? ` ${p.scheduledTime}` : ""}
                                        {p.assignee ? ` · @${p.assignee}` : ""}
                                    </p>
                                </div>
                                <Badge variant={STATUS_VARIANT[p.status]}>
                                    {p.status}
                                </Badge>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
