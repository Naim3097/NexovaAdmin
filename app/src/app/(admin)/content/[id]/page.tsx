import Link from "next/link";
import { notFound } from "next/navigation";
import {
    CONTENT_ASSET_TYPES,
    CONTENT_DRAFT_STAGES,
    CONTENT_PLATFORMS,
    CONTENT_STATUSES,
    CONTENT_TYPES,
    getContentPostById,
} from "@/lib/data/content";
import { listClients } from "@/lib/data/clients";
import { AssetPreview } from "@/components/asset-preview";
import { listProjects } from "@/lib/data/projects";
import { listTeamMembers } from "@/lib/data/team";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    deleteContentPostAction,
    setContentStatusAction,
    submitDraftAction,
    updateContentPostAction,
} from "@/lib/content/actions";

export const dynamic = "force-dynamic";

const REVIEW_STATUS_LABEL: Record<string, string> = {
    none: "Not in review",
    awaiting_client: "Awaiting client",
    changes_requested: "Changes requested",
    approved: "Approved",
};

export default async function ContentDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const post = await getContentPostById(id);
    if (!post) notFound();
    const [projects, team, clients] = await Promise.all([
        listProjects(),
        listTeamMembers(),
        listClients(),
    ]);
    const client = clients.find(
        (c) => c.name.trim().toLowerCase() === post.clientName.trim().toLowerCase(),
    );
    const revisionLimit = client?.contentRevisionLimit ?? 3;
    const activeTeam = team.filter((m) => m.active);
    const assigneeOptions = post.assignee && !activeTeam.some((m) => m.name === post.assignee)
        ? [{ id: post.assignee, name: post.assignee, role: "legacy" }, ...activeTeam.map((m) => ({ id: m.id, name: m.name, role: m.role }))]
        : activeTeam.map((m) => ({ id: m.id, name: m.name, role: m.role }));

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/content"
                    className="text-sm text-muted-foreground hover:underline"
                >
                    Back to content
                </Link>
                <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <h1 className="text-2xl font-semibold md:text-3xl">
                        {post.title}
                    </h1>
                    <Badge variant="secondary">{post.status}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                    {post.clientName} · {post.platform} · {post.type} ·{" "}
                    {post.scheduledFor}
                    {post.scheduledTime ? ` ${post.scheduledTime}` : ""}
                    {post.projectId ? (
                        <>
                            {" · "}
                            <Link
                                href={`/projects/${post.projectId}`}
                                className="underline"
                            >
                                project
                            </Link>
                        </>
                    ) : null}
                </p>
            </div>

            {/* Client direction (read-only — the client's brief) */}
            <section className="rounded-lg border bg-card p-4 md:p-6">
                <h2 className="text-sm font-medium">Client direction</h2>
                {post.direction ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm">
                        {post.direction}
                    </p>
                ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                        No direction provided by the client.
                    </p>
                )}
                {post.references.length > 0 ? (
                    <div className="mt-3">
                        <p className="text-xs font-medium text-muted-foreground">
                            References
                        </p>
                        <ul className="mt-1 space-y-1">
                            {post.references.map((url, i) => (
                                <li key={i}>
                                    <a
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="break-all text-xs text-primary hover:underline"
                                    >
                                        {url}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : null}
            </section>

            {/* Status pills */}
            <section className="rounded-lg border bg-card p-4 md:p-6">
                <h2 className="text-sm font-medium">Move to status</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                    {CONTENT_STATUSES.map((s) => (
                        <form key={s} action={setContentStatusAction}>
                            <input type="hidden" name="id" value={post.id} />
                            <input type="hidden" name="status" value={s} />
                            <Button
                                type="submit"
                                size="sm"
                                variant={post.status === s ? "default" : "outline"}
                                disabled={post.status === s}
                            >
                                {s}
                            </Button>
                        </form>
                    ))}
                </div>
                {post.postedAt ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                        Posted on {new Date(post.postedAt).toLocaleString()}
                    </p>
                ) : null}
            </section>

            {/* Client review loop */}
            <section className="space-y-4 rounded-lg border bg-card p-4 md:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-medium">Client review</h2>
                    <div className="flex items-center gap-2">
                        <Badge
                            variant={
                                post.reviewStatus === "approved"
                                    ? "default"
                                    : post.reviewStatus === "changes_requested"
                                        ? "destructive"
                                        : post.reviewStatus === "awaiting_client"
                                            ? "secondary"
                                            : "outline"
                            }
                        >
                            {REVIEW_STATUS_LABEL[post.reviewStatus] ??
                                post.reviewStatus}
                        </Badge>
                        {post.draftNumber ? (
                            <Badge variant="outline">{post.draftNumber}</Badge>
                        ) : null}
                    </div>
                </div>
                <p className="text-xs text-muted-foreground">
                    {post.revisionsUsed} of {revisionLimit} client revision
                    cycle(s) used.
                    {post.approvedAt
                        ? ` Approved ${new Date(post.approvedAt).toLocaleDateString()}${post.approvedBy ? ` by ${post.approvedBy}` : ""}.`
                        : ""}
                </p>

                {/* Draft history */}
                <div>
                    <h3 className="text-xs font-medium text-muted-foreground">
                        Draft history
                    </h3>
                    {post.drafts.length === 0 ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                            No drafts submitted yet.
                        </p>
                    ) : (
                        <ul className="mt-2 divide-y rounded-md border">
                            {[...post.drafts].reverse().map((d) => (
                                <li key={d.id} className="p-3">
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <span className="text-sm font-medium">
                                            {d.draftNumber}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {new Date(
                                                d.submittedAt,
                                            ).toLocaleString()}
                                            {d.submittedBy
                                                ? ` · ${d.submittedBy}`
                                                : ""}
                                        </span>
                                    </div>
                                    {d.caption ? (
                                        <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                                            {d.caption}
                                        </p>
                                    ) : null}
                                    <div className="mt-2">
                                        <AssetPreview
                                            media={d.media}
                                            fallbackUrl={d.fileUrl}
                                        />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Feedback thread */}
                {post.feedback.length > 0 ? (
                    <div>
                        <h3 className="text-xs font-medium text-muted-foreground">
                            Feedback
                        </h3>
                        <ul className="mt-2 space-y-2">
                            {[...post.feedback].reverse().map((f) => (
                                <li
                                    key={f.id}
                                    className="rounded-md border bg-background p-3"
                                >
                                    <div className="flex items-baseline justify-between gap-2">
                                        <span className="text-xs font-medium capitalize">
                                            {f.author}
                                            {f.cycle ? ` · cycle ${f.cycle}` : ""}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {new Date(
                                                f.createdAt,
                                            ).toLocaleString()}
                                        </span>
                                    </div>
                                    <p className="mt-1 whitespace-pre-wrap text-sm">
                                        {f.body}
                                    </p>
                                    {f.fileUrl ? (
                                        <a
                                            href={f.fileUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-1 block break-all text-xs text-primary hover:underline"
                                        >
                                            {f.fileUrl}
                                        </a>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : null}

                {/* Submit a new draft */}
                {post.reviewStatus === "approved" ? (
                    <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                        This content is approved. No further drafts needed.
                    </p>
                ) : (
                    <form
                        action={submitDraftAction}
                        className="space-y-3 border-t pt-4"
                    >
                        <input type="hidden" name="id" value={post.id} />
                        <h3 className="text-xs font-medium text-muted-foreground">
                            Submit a draft for client review
                        </h3>
                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label className="text-sm">Draft stage</Label>
                                <Select name="draftNumber" defaultValue="Draft 1">
                                    <SelectTrigger className="h-10">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CONTENT_DRAFT_STAGES.map((s) => (
                                            <SelectItem key={s} value={s}>
                                                {s}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-sm">Asset type</Label>
                                <Select name="assetType" defaultValue="image">
                                    <SelectTrigger className="h-10">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CONTENT_ASSET_TYPES.map((t) => (
                                            <SelectItem key={t} value={t}>
                                                {t}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">
                                Asset file(s) — select multiple for a carousel
                            </Label>
                            <Input
                                name="files"
                                type="file"
                                multiple
                                required
                                accept="image/*,video/*"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Caption / notes</Label>
                            <Textarea
                                name="caption"
                                rows={3}
                                placeholder="Caption or context for this draft…"
                            />
                        </div>
                        <div className="flex justify-end">
                            <Button type="submit">Send draft to client</Button>
                        </div>
                    </form>
                )}
            </section>

            {/* Edit */}
            <form
                action={updateContentPostAction}
                className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
            >
                <input type="hidden" name="id" value={post.id} />
                <h2 className="text-sm font-medium">Details</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-sm">Title</Label>
                        <Input name="title" defaultValue={post.title} required />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Client</Label>
                        <Input
                            name="clientName"
                            defaultValue={post.clientName}
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Project</Label>
                        <Select
                            name="projectId"
                            defaultValue={post.projectId ?? "none"}
                        >
                            <SelectTrigger className="h-10">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">— None —</SelectItem>
                                {projects.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                        {p.name} ({p.clientName})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Assignee</Label>
                        <Select
                            name="assignee"
                            defaultValue={post.assignee || "none"}
                        >
                            <SelectTrigger className="h-10">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">— Unassigned —</SelectItem>
                                {assigneeOptions.map((m) => (
                                    <SelectItem key={m.id} value={m.name}>
                                        {m.name} ({m.role})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Platform</Label>
                        <Select name="platform" defaultValue={post.platform}>
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
                        <Select name="type" defaultValue={post.type}>
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
                            defaultValue={post.scheduledFor}
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Time</Label>
                        <Input
                            name="scheduledTime"
                            type="time"
                            defaultValue={post.scheduledTime}
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label className="text-sm">Caption</Label>
                    <Textarea name="caption" defaultValue={post.caption} rows={6} />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-sm">Hashtags</Label>
                    <Input
                        name="hashtags"
                        defaultValue={post.hashtags}
                        placeholder="#nexova #malaysia #marketing"
                    />
                </div>
                <div className="rounded-md border border-dashed p-4">
                    <p className="text-xs font-medium text-muted-foreground">
                        Concept (internal — headline, idea, copy)
                    </p>
                    <div className="mt-3 space-y-3">
                        <div className="space-y-1.5">
                            <Label className="text-sm">Visual headline</Label>
                            <Input
                                name="visualHeadline"
                                defaultValue={post.visualHeadline}
                                placeholder="The hook / headline on the visual"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Visual idea</Label>
                            <Textarea
                                name="visualIdea"
                                defaultValue={post.visualIdea}
                                rows={3}
                                placeholder="The concept / art direction for the asset"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Copywriting</Label>
                            <Textarea
                                name="copywriting"
                                defaultValue={post.copywriting}
                                rows={4}
                                placeholder="Caption / body copy draft"
                            />
                        </div>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label className="text-sm">Internal notes</Label>
                    <Textarea name="notes" defaultValue={post.notes} rows={3} />
                </div>

                <div className="flex justify-end">
                    <Button type="submit">Save changes</Button>
                </div>
            </form>

            <section className="flex items-center justify-end rounded-lg border bg-card p-4 md:p-6">
                <form action={deleteContentPostAction}>
                    <input type="hidden" name="id" value={post.id} />
                    <Button type="submit" variant="destructive">
                        Delete post
                    </Button>
                </form>
            </section>

            <p className="text-xs text-muted-foreground">
                Created {new Date(post.createdAt).toLocaleString()} · Last updated{" "}
                {new Date(post.updatedAt).toLocaleString()}
            </p>
        </div>
    );
}
