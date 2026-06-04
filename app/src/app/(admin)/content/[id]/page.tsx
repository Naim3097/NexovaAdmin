import Link from "next/link";
import { notFound } from "next/navigation";
import {
    CONTENT_PLATFORMS,
    CONTENT_STATUSES,
    CONTENT_TYPES,
    getContentPostById,
} from "@/lib/data/content";
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
    const [projects, team] = await Promise.all([
        listProjects(),
        listTeamMembers(),
    ]);
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
