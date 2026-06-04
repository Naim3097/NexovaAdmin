import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
    PROJECT_STATUSES,
    listProjects,
    type ProjectStatus,
} from "@/lib/data/projects";
import { Button } from "@/components/ui/button";
import { setProjectStatusAction } from "@/lib/projects/actions";

export const dynamic = "force-dynamic";

const COLUMN_LABELS: Record<ProjectStatus, string> = {
    kickoff: "Kickoff",
    in_progress: "In progress",
    review: "Review",
    delivered: "Delivered",
    on_hold: "On hold",
};

function nextStatus(current: ProjectStatus): ProjectStatus | null {
    const order: ProjectStatus[] = [
        "kickoff",
        "in_progress",
        "review",
        "delivered",
    ];
    const i = order.indexOf(current);
    if (i === -1 || i === order.length - 1) return null;
    return order[i + 1];
}

export default async function ProjectBoardPage() {
    const projects = await listProjects();
    const grouped: Record<ProjectStatus, typeof projects> = {
        kickoff: [],
        in_progress: [],
        review: [],
        delivered: [],
        on_hold: [],
    };
    for (const p of projects) grouped[p.status].push(p);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">
                        Project board
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Use the Advance button on a card to move it through the
                        board.
                    </p>
                </div>
                <Link href="/projects" className="text-sm font-medium underline">
                    List view
                </Link>
            </div>

            <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
                <div className="grid min-w-[900px] grid-cols-5 gap-3 md:min-w-0">
                    {PROJECT_STATUSES.map((s) => (
                        <div key={s} className="rounded-lg border bg-muted/30 p-3">
                            <div className="mb-3 flex items-center justify-between">
                                <h2 className="text-sm font-medium">
                                    {COLUMN_LABELS[s]}
                                </h2>
                                <span className="text-xs text-muted-foreground">
                                    {grouped[s].length}
                                </span>
                            </div>
                            <ul className="space-y-2">
                                {grouped[s].map((p) => {
                                    const next = nextStatus(p.status);
                                    const open = p.tasks.filter((t) => !t.done).length;
                                    const total = p.tasks.length;
                                    return (
                                        <li
                                            key={p.id}
                                            className="rounded-md border bg-background p-3 text-sm shadow-sm"
                                        >
                                            <Link
                                                href={`/projects/${p.id}`}
                                                className="font-medium hover:underline"
                                            >
                                                {p.name}
                                            </Link>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {p.clientName}
                                            </p>
                                            {total > 0 ? (
                                                <p className="mt-1 text-xs">
                                                    {total - open}/{total} done
                                                </p>
                                            ) : null}
                                            {next ? (
                                                <form
                                                    action={setProjectStatusAction}
                                                    className="mt-2"
                                                >
                                                    <input type="hidden" name="id" value={p.id} />
                                                    <input
                                                        type="hidden"
                                                        name="status"
                                                        value={next}
                                                    />
                                                    <Button
                                                        type="submit"
                                                        size="sm"
                                                        className="h-7 w-full text-xs"
                                                        title={`Advance to ${COLUMN_LABELS[next]}`}
                                                    >
                                                        {COLUMN_LABELS[next]}
                                                        <ArrowRight className="size-3.5" />
                                                    </Button>
                                                </form>
                                            ) : null}
                                            {p.status !== "on_hold" &&
                                                p.status !== "delivered" ? (
                                                <form
                                                    action={setProjectStatusAction}
                                                    className="mt-1"
                                                >
                                                    <input type="hidden" name="id" value={p.id} />
                                                    <input
                                                        type="hidden"
                                                        name="status"
                                                        value="on_hold"
                                                    />
                                                    <Button
                                                        type="submit"
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 w-full text-xs text-muted-foreground"
                                                    >
                                                        Hold
                                                    </Button>
                                                </form>
                                            ) : null}
                                        </li>
                                    );
                                })}
                                {grouped[s].length === 0 ? (
                                    <li className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                                        Empty
                                    </li>
                                ) : null}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
