import Link from "next/link";
import { notFound } from "next/navigation";
import {
    CONTENT_DRAFT_STAGES,
    CONTENT_PLATFORMS,
    CONTENT_TYPES,
    getContentPostById,
    listContentPosts,
    visualsUsed,
} from "@/lib/data/content";
import { listClients } from "@/lib/data/clients";
import { listTeamMembers } from "@/lib/data/team";
import { ReviewTimeline } from "@/components/review-timeline";
import { StatusLights } from "@/components/status-lights";
import { TypeVisualsFields } from "@/components/type-visuals-fields";
import { DraftUploader } from "./draft-uploader";
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
    updateContentPostAction,
} from "@/lib/content/actions";

export const dynamic = "force-dynamic";

export default async function ContentDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const post = await getContentPostById(id);
    if (!post) notFound();
    const [team, clients, allPosts] = await Promise.all([
        listTeamMembers(),
        listClients(),
        listContentPosts(),
    ]);
    const client = clients.find(
        (c) =>
            c.name.trim().toLowerCase() === post.clientName.trim().toLowerCase(),
    );
    const revisionLimit = client?.contentRevisionLimit ?? 3;
    // Per-visual quota context for the Type/Visuals control (exclude this post).
    const quotaMonth =
        post.planMonth || new Date().toISOString().slice(0, 7);
    const usedByOthers = visualsUsed(
        allPosts.filter((p) => p.id !== post.id),
        post.clientName,
        quotaMonth,
    );
    const activeTeam = team.filter((m) => m.active);
    const assigneeOptions =
        post.assignee && !activeTeam.some((m) => m.name === post.assignee)
            ? [
                  { id: post.assignee, name: post.assignee, role: "legacy" },
                  ...activeTeam.map((m) => ({ id: m.id, name: m.name, role: m.role })),
              ]
            : activeTeam.map((m) => ({ id: m.id, name: m.name, role: m.role }));

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/content/board"
                    className="text-sm text-muted-foreground hover:underline"
                >
                    ← Back to board
                </Link>
                <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <h1 className="text-2xl font-semibold md:text-3xl">
                        {post.title}
                    </h1>
                    <StatusLights post={post} showCaption />
                </div>
                <p className="text-sm text-muted-foreground">
                    {post.clientName} · {post.platform} · {post.type}
                    {post.draftNumber ? ` · ${post.draftNumber}` : ""}
                </p>
            </div>

            {/* ① Concept (internal — headline, idea, copy) */}
            <form
                action={updateContentPostAction}
                className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
            >
                <input type="hidden" name="id" value={post.id} />
                <h2 className="text-sm font-medium">Concept</h2>
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
                        placeholder="The caption / copy the client will see"
                    />
                </div>
                <div className="flex justify-end">
                    <Button type="submit">Save concept</Button>
                </div>
            </form>

            {/* ② Details (minimal) */}
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
                    <TypeVisualsFields
                        types={CONTENT_TYPES}
                        defaultType={post.type}
                        defaultVisualCount={post.visualCount}
                        quota={client?.monthlyContentQuota ?? 0}
                        usedByOthers={usedByOthers}
                    />
                    <div className="space-y-1.5">
                        <Label className="text-sm">Scheduled for</Label>
                        <Input
                            name="scheduledFor"
                            type="date"
                            defaultValue={post.scheduledFor}
                        />
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
                </div>
                <div className="flex justify-end">
                    <Button type="submit" variant="outline">
                        Save details
                    </Button>
                </div>
            </form>

            {/* ③ Client review */}
            <section className="space-y-4 rounded-lg border bg-card p-4 md:p-6">
                <h2 className="text-sm font-medium">Client review</h2>

                {/* The client's brief */}
                <div className="rounded-md border bg-muted/40 p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                        Client direction
                    </p>
                    {post.direction ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm">
                            {post.direction}
                        </p>
                    ) : (
                        <p className="mt-1 text-sm text-muted-foreground">
                            No direction provided.
                        </p>
                    )}
                    {post.references.length > 0 ? (
                        <ul className="mt-2 space-y-1">
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
                    ) : null}
                </div>

                {/* Shared timeline (drafts + feedback + revision count) */}
                <ReviewTimeline post={post} revisionLimit={revisionLimit} />

                {/* Submit a new draft */}
                {post.reviewStatus === "approved" ? (
                    <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                        Approved — no further drafts needed.
                    </p>
                ) : (
                    <DraftUploader
                        postId={post.id}
                        stages={CONTENT_DRAFT_STAGES}
                    />
                )}
            </section>

            {/* Delete */}
            <section className="flex items-center justify-end rounded-lg border bg-card p-4 md:p-6">
                <form action={deleteContentPostAction}>
                    <input type="hidden" name="id" value={post.id} />
                    <Button type="submit" variant="destructive">
                        Delete
                    </Button>
                </form>
            </section>
        </div>
    );
}
