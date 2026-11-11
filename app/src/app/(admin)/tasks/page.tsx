import Link from "next/link";
import { listSprintTasks, type SprintTask } from "@/lib/data/sprint-tasks";
import { listTeamMembers } from "@/lib/data/team";
import { NewButton, NewSection, newFormHref } from "@/components/new-button";
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
import {
    createSprintTaskAction,
    deleteSprintTaskAction,
    toggleSprintTaskAction,
    updateSprintTaskAction,
} from "@/lib/sprint-tasks/actions";
import { AiDump } from "./ai-dump";

export const dynamic = "force-dynamic";

const UNASSIGNED = "— No owner —";

function deadlineMeta(deadline: string, today: string, done: boolean) {
    if (done) return { label: deadline, cls: "text-muted-foreground" };
    if (deadline < today) return { label: `Overdue · ${deadline}`, cls: "font-medium text-destructive" };
    if (deadline === today) return { label: `Due today`, cls: "font-medium text-amber-600" };
    // tomorrow?
    const tomorrow = new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10);
    if (deadline === tomorrow) return { label: `Due tomorrow`, cls: "font-medium text-amber-600" };
    return { label: `Due ${deadline}`, cls: "text-muted-foreground" };
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ as?: string; new?: string }> }) {
    const sp = await searchParams;
    const [tasks, team] = await Promise.all([
        listSprintTasks(),
        listTeamMembers(),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const newHref = newFormHref("/tasks", { as: sp.as });
    const activeTeam = team.filter((m) => m.active);

    // Group by PIC (open tasks drive the bars; done shown muted within group).
    const groups = new Map<string, SprintTask[]>();
    for (const t of tasks) {
        const key = t.pic.trim() || UNASSIGNED;
        const arr = groups.get(key) ?? [];
        arr.push(t);
        groups.set(key, arr);
    }
    // Order: named PICs alphabetically, Unassigned last.
    const picKeys = [...groups.keys()].sort((a, b) => {
        if (a === UNASSIGNED) return 1;
        if (b === UNASSIGNED) return -1;
        return a.localeCompare(b);
    });

    const openCount = tasks.filter((t) => t.status === "open").length;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">To-dos</h1>
                    <p className="text-sm text-muted-foreground">
                        Quick one-off jobs grouped by owner · {openCount} open · no deadline means 3 days, and the bot pings the owner a day before.
                    </p>
                </div>
                <NewButton href={newHref}>+ New to-do</NewButton>
            </div>

            {/* Dump zone (AI parse + manual quick-add), folded until the button above opens it */}
            <NewSection open={sp.new === "1"} title="New to-do">
                <div className="grid gap-4 md:grid-cols-2">
                    <AiDump />

                    <form action={createSprintTaskAction} className="space-y-2">
                        <Label className="text-sm">Add one to-do</Label>
                        <Input name="title" required placeholder="What needs doing?" />
                        <div className="grid grid-cols-2 gap-2">
                            <Select name="pic" defaultValue="none">
                                <SelectTrigger className="h-10">
                                    <SelectValue placeholder="Owner" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No owner</SelectItem>
                                    {activeTeam.map((m) => (
                                        <SelectItem key={m.id} value={m.name}>
                                            {m.name} ({m.role})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Input name="deadline" type="date" />
                        </div>
                        <div className="flex justify-end">
                            <Button type="submit">Add to-do</Button>
                        </div>
                    </form>
                </div>
            </NewSection>

            {/* Per-owner to-do bars */}
            {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No to-dos yet —{" "}
                    <Link href={newHref} className="underline">
                        add the first one
                    </Link>
                    .
                </p>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {picKeys.map((pic) => {
                        const items = (groups.get(pic) ?? []).sort((a, b) => {
                            if (a.status !== b.status) return a.status === "open" ? -1 : 1;
                            return a.deadline.localeCompare(b.deadline);
                        });
                        const openInGroup = items.filter((t) => t.status === "open").length;
                        return (
                            <section
                                key={pic}
                                className="rounded-lg border bg-card"
                            >
                                <div className="flex items-center justify-between border-b p-3">
                                    <h2 className="text-sm font-medium">{pic}</h2>
                                    <span className="text-xs text-muted-foreground">
                                        {openInGroup} open
                                    </span>
                                </div>
                                <ul className="divide-y">
                                    {items.map((t) => {
                                        const done = t.status === "done";
                                        const dm = deadlineMeta(t.deadline, today, done);
                                        return (
                                            <li key={t.id} className="p-3">
                                                <div className="flex items-start gap-2">
                                                    <form action={toggleSprintTaskAction}>
                                                        <input type="hidden" name="id" value={t.id} />
                                                        <button
                                                            type="submit"
                                                            aria-label={done ? "Mark open" : "Mark done"}
                                                            className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border text-xs ${
                                                                done
                                                                    ? "border-emerald-500 bg-emerald-500 text-white"
                                                                    : "border-input hover:bg-accent"
                                                            }`}
                                                        >
                                                            {done ? "✓" : ""}
                                                        </button>
                                                    </form>
                                                    <div className="min-w-0 flex-1">
                                                        <p className={`text-sm ${done ? "text-muted-foreground line-through" : "font-medium"}`}>
                                                            {t.title}
                                                        </p>
                                                        <p className={`text-xs ${dm.cls}`}>{dm.label}</p>
                                                        <details className="mt-1">
                                                            <summary className="cursor-pointer text-[11px] text-muted-foreground">
                                                                Edit
                                                            </summary>
                                                            <form
                                                                action={updateSprintTaskAction}
                                                                className="mt-2 space-y-2"
                                                            >
                                                                <input type="hidden" name="id" value={t.id} />
                                                                <Input
                                                                    name="title"
                                                                    defaultValue={t.title}
                                                                    className="h-8"
                                                                />
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    <Select
                                                                        name="pic"
                                                                        defaultValue={t.pic || "none"}
                                                                    >
                                                                        <SelectTrigger className="h-8">
                                                                            <SelectValue />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            <SelectItem value="none">No owner</SelectItem>
                                                                            {activeTeam.map((m) => (
                                                                                <SelectItem key={m.id} value={m.name}>
                                                                                    {m.name}
                                                                                </SelectItem>
                                                                            ))}
                                                                        </SelectContent>
                                                                    </Select>
                                                                    <Input
                                                                        name="deadline"
                                                                        type="date"
                                                                        defaultValue={t.deadline}
                                                                        className="h-8"
                                                                    />
                                                                </div>
                                                                <div className="flex justify-between">
                                                                    <Button type="submit" size="sm" variant="outline">
                                                                        Save
                                                                    </Button>
                                                                </div>
                                                            </form>
                                                            <form action={deleteSprintTaskAction} className="mt-1">
                                                                <input type="hidden" name="id" value={t.id} />
                                                                <Button
                                                                    type="submit"
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="h-7 px-2 text-xs text-muted-foreground"
                                                                >
                                                                    Delete to-do
                                                                </Button>
                                                            </form>
                                                        </details>
                                                    </div>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
