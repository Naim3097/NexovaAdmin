import Link from "next/link";
import { getCurrentTeamMember } from "@/lib/auth";
import { listContentPosts } from "@/lib/data/content";
import { listProjects } from "@/lib/data/projects";
import { listTeamMembers } from "@/lib/data/team";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function MyWorkPage({
    searchParams,
}: {
    searchParams: Promise<{ member?: string }>;
}) {
    const sp = await searchParams;
    const selected = (sp.member ?? "").trim();

    const [team, projects, content, currentMember] = await Promise.all([
        listTeamMembers(),
        listProjects(),
        listContentPosts(),
        getCurrentTeamMember(),
    ]);
    const activeTeam = team.filter((m) => m.active);

    const today = new Date().toISOString().slice(0, 10);
    // eslint-disable-next-line react-hooks/purity -- server component, runs per request
    const inSevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

    // Build per-member workload
    const tasksByAssignee = new Map<
        string,
        Array<{
            projectId: string;
            projectName: string;
            clientName: string;
            taskId: string;
            title: string;
        }>
    >();
    for (const p of projects) {
        for (const t of p.tasks) {
            if (t.done) continue;
            if (!t.assignee) continue;
            const arr = tasksByAssignee.get(t.assignee) ?? [];
            arr.push({
                projectId: p.id,
                projectName: p.name,
                clientName: p.clientName,
                taskId: t.id,
                title: t.title,
            });
            tasksByAssignee.set(t.assignee, arr);
        }
    }

    const contentByAssignee = new Map<string, typeof content>();
    for (const c of content) {
        if (!c.assignee) continue;
        if (c.status === "posted" || c.status === "archived") continue;
        const arr = contentByAssignee.get(c.assignee) ?? [];
        arr.push(c);
        contentByAssignee.set(c.assignee, arr);
    }

    if (!selected) {
        // Workload summary across team
        const rows = activeTeam.map((m) => {
            const tasks = tasksByAssignee.get(m.name) ?? [];
            const posts = contentByAssignee.get(m.name) ?? [];
            const dueSoon = posts.filter(
                (p) => p.scheduledFor >= today && p.scheduledFor <= inSevenDays,
            ).length;
            return {
                ...m,
                openTasks: tasks.length,
                openPosts: posts.length,
                dueSoon,
            };
        });

        return (
            <div className="space-y-6">
                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold md:text-3xl">My work</h1>
                        <p className="text-sm text-muted-foreground">
                            Pick a team member to see open tasks and content.
                        </p>
                    </div>
                    {currentMember ? (
                        <Link
                            href={`/my-work?member=${encodeURIComponent(currentMember.name)}`}
                        >
                            <Button size="sm">View my work →</Button>
                        </Link>
                    ) : null}
                </div>

                <div className="rounded-lg border bg-card">
                    <div className="border-b p-4 text-sm font-medium">
                        Team workload
                    </div>
                    {rows.length === 0 ? (
                        <p className="p-6 text-sm text-muted-foreground">
                            No active members yet.{" "}
                            <Link href="/team" className="underline">
                                Add some
                            </Link>
                            .
                        </p>
                    ) : (
                        <ul className="divide-y">
                            {rows.map((r) => (
                                <li
                                    key={r.id}
                                    className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium">
                                            {r.name}{" "}
                                            <span className="text-xs text-muted-foreground">
                                                ({r.role})
                                            </span>
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {r.openTasks} open task
                                            {r.openTasks === 1 ? "" : "s"} ·{" "}
                                            {r.openPosts} open post
                                            {r.openPosts === 1 ? "" : "s"} ·{" "}
                                            {r.dueSoon} due in 7d
                                        </p>
                                    </div>
                                    <Link
                                        href={`/my-work?member=${encodeURIComponent(r.name)}`}
                                    >
                                        <Button variant="outline" size="sm">
                                            View work →
                                        </Button>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        );
    }

    // Selected member view
    const memberTasks = tasksByAssignee.get(selected) ?? [];
    const memberPosts = (contentByAssignee.get(selected) ?? []).slice().sort(
        (a, b) => a.scheduledFor.localeCompare(b.scheduledFor),
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <Link
                        href="/my-work"
                        className="text-xs text-muted-foreground hover:underline"
                    >
                        ← All members
                    </Link>
                    <h1 className="mt-1 text-2xl font-semibold md:text-3xl">
                        {selected}&apos;s work
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {memberTasks.length} open task
                        {memberTasks.length === 1 ? "" : "s"} ·{" "}
                        {memberPosts.length} open content post
                        {memberPosts.length === 1 ? "" : "s"}
                    </p>
                </div>
            </div>

            <section className="rounded-lg border bg-card">
                <div className="border-b p-4 text-sm font-medium">Open tasks</div>
                {memberTasks.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">
                        No open tasks assigned.
                    </p>
                ) : (
                    <ul className="divide-y">
                        {memberTasks.map((t) => (
                            <li
                                key={t.taskId}
                                className="flex flex-col gap-1 p-4 md:flex-row md:items-center md:justify-between"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="font-medium">{t.title}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {t.clientName} ·{" "}
                                        <Link
                                            href={`/projects/${t.projectId}`}
                                            className="underline"
                                        >
                                            {t.projectName}
                                        </Link>
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="rounded-lg border bg-card">
                <div className="border-b p-4 text-sm font-medium">
                    Open content
                </div>
                {memberPosts.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">
                        No open content posts assigned.
                    </p>
                ) : (
                    <ul className="divide-y">
                        {memberPosts.map((p) => (
                            <li
                                key={p.id}
                                className="flex flex-col gap-1 p-4 md:flex-row md:items-center md:justify-between"
                            >
                                <div className="min-w-0 flex-1">
                                    <Link
                                        href={`/content/${p.id}`}
                                        className="font-medium hover:underline"
                                    >
                                        {p.title}
                                    </Link>
                                    <p className="text-xs text-muted-foreground">
                                        {p.clientName} · {p.platform} · {p.type} ·{" "}
                                        {p.scheduledFor}
                                        {p.scheduledTime ? ` ${p.scheduledTime}` : ""}
                                    </p>
                                </div>
                                <Badge variant="secondary">{p.status}</Badge>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
