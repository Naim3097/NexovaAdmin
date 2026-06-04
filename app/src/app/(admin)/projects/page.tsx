import Link from "next/link";
import { listProjects } from "@/lib/data/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProjectAction } from "@/lib/projects/actions";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
    const projects = await listProjects();
    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">Projects</h1>
                    <p className="text-sm text-muted-foreground">
                        Active builds. Created from onboarding or added directly.
                    </p>
                </div>
                <Link
                    href="/projects/board"
                    className="text-sm font-medium underline"
                >
                    Open board view →
                </Link>
            </div>

            <form
                action={createProjectAction}
                className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-[1fr_1fr_auto] md:items-end md:p-6"
            >
                <div className="space-y-1.5">
                    <Label className="text-sm">Project name</Label>
                    <Input name="name" required placeholder="e.g. Lean.x website v2" />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-sm">Client</Label>
                    <Input name="clientName" list="clients-datalist" required placeholder="Lean.x Sdn Bhd" />
                </div>
                <Button type="submit">Add project</Button>
            </form>

            <div className="rounded-lg border bg-card">
                <div className="border-b p-4 text-sm font-medium">
                    All projects ({projects.length})
                </div>
                {projects.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">
                        No projects yet. Add one above or convert a submitted onboarding.
                    </p>
                ) : (
                    <ul className="divide-y">
                        {projects.map((p) => {
                            const open = p.tasks.filter((t) => !t.done).length;
                            const total = p.tasks.length;
                            return (
                                <li
                                    key={p.id}
                                    className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
                                >
                                    <div className="min-w-0 flex-1">
                                        <Link
                                            href={`/projects/${p.id}`}
                                            className="font-medium hover:underline"
                                        >
                                            {p.name}
                                        </Link>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {p.clientName} ·{" "}
                                            {total > 0
                                                ? `${total - open}/${total} tasks done`
                                                : "no tasks"}
                                        </p>
                                    </div>
                                    <Badge variant="secondary">
                                        {p.status.replace(/_/g, " ")}
                                    </Badge>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
