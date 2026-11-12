"use client";
/**
 * The board's To do "+": the one place a task is added by hand. A small
 * dialog asks for the project (signed or running ones, internal included),
 * the task type, a title, the due date and, optionally, the owner, which
 * starts as the project crew's person on the type's default seat. Saves with
 * createTaskAction, then a toast and a refresh: the card lands in To do.
 *
 * `?new=<project id>` (a project page's "Add task") opens it on that project;
 * the param is dropped once the dialog closes, so a reload does not reopen it.
 */
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_SPLIT, LINE_TYPES, LINE_TYPE_LABEL, SEAT_LABEL, type LineType, type Seat } from "@/lib/planners/vocab";
import { nearestWorkingDay } from "@/lib/capacity/helpers";
import { createTaskAction } from "@/lib/works/quick-actions";

const SEL = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";

/** One project the dialog offers. */
export type NewTaskProject = {
    id: string;
    code: string;
    name: string;
    clientName: string;
    internal: boolean;
    /** Seat → person from the project crew, the AM seat already falling back to the account manager. */
    crew: Partial<Record<Seat, string>>;
};

/** What the page hands the board so its To do column can add tasks. */
export type NewTaskSetup = {
    projects: NewTaskProject[];
    /** Active team names, for the owner pick. */
    members: string[];
    /** The project the dialog starts on (`?new=`, else the Client filter's first project). */
    defaultProjectId?: string;
    /** Open on load: the page came from a project's "Add task" (`?new=`). */
    openOnLoad?: boolean;
    today: string;
};

/** A week out, moved onto a working day. */
function defaultDue(today: string): string {
    const d = new Date(`${today}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return "";
    d.setUTCDate(d.getUTCDate() + 7);
    return nearestWorkingDay(d.toISOString().slice(0, 10));
}

/** Projects grouped by client, clients A–Z, for the optgroups. */
function byClient(projects: NewTaskProject[]): Array<[string, NewTaskProject[]]> {
    const groups = new Map<string, NewTaskProject[]>();
    for (const p of projects) groups.set(p.clientName, [...(groups.get(p.clientName) ?? []), p]);
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function NewTaskButton({ setup, asParam }: { setup: NewTaskSetup; asParam?: string }) {
    const router = useRouter();
    const { projects, members, today } = setup;
    const [open, setOpen] = useState(Boolean(setup.openOnLoad) && projects.length > 0);
    const [pending, start] = useTransition();
    const firstId = projects.some((p) => p.id === setup.defaultProjectId) ? setup.defaultProjectId! : (projects[0]?.id ?? "");
    const [projectId, setProjectId] = useState(firstId);
    const [type, setType] = useState<LineType>("static");
    const [title, setTitle] = useState("");
    const [due, setDue] = useState(() => defaultDue(today));
    // null follows the crew default; a string is the person picked here ("" = open seat).
    const [owner, setOwner] = useState<string | null>(null);

    const project = projects.find((p) => p.id === projectId);
    const groups = useMemo(() => byClient(projects), [projects]);
    const seat = DEFAULT_SPLIT[type][0]?.seat;
    const crewPick = seat && project ? (project.crew[seat] ?? "") : "";
    // Only someone on the active team can be offered; anyone else leaves the seat open.
    const defaultOwner = members.includes(crewPick) ? crewPick : "";
    const ownerValue = owner ?? defaultOwner;

    /** Drop `?new=` so a reload or the next refresh does not reopen the dialog. */
    const dropNewParam = () => {
        const url = new URL(window.location.href);
        if (!url.searchParams.has("new")) return false;
        url.searchParams.delete("new");
        router.replace(`${url.pathname}${url.search}`, { scroll: false });
        return true;
    };

    const onOpenChange = (next: boolean) => {
        // Each open starts on the page's project (the Client filter's, or `?new=`) when it names one; otherwise on the last pick.
        if (next) {
            const pick = setup.defaultProjectId && projects.some((p) => p.id === setup.defaultProjectId) ? setup.defaultProjectId : projectId;
            setProjectId(projects.some((p) => p.id === pick) ? pick : (projects[0]?.id ?? ""));
            setOwner(null);
        }
        setOpen(next);
        if (!next) dropNewParam();
    };

    const submit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!project) return;
        start(async () => {
            const r = await createTaskAction({ contractId: project.id, type, title, dueDate: due, owner: ownerValue, as: asParam });
            if (!r.ok) {
                toast.error(r.reason);
                return;
            }
            toast.success(`Added to To do: ${r.title}`, {
                description: `${project.clientName} · ${project.name} · due ${due}${ownerValue ? ` · ${ownerValue}` : " · open seat"}`,
            });
            setTitle("");
            setOwner(null);
            setOpen(false);
            if (!dropNewParam()) router.refresh();
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger
                render={<Button size="icon-xs" variant="ghost" className="ml-auto" aria-label="New task" title="New task" />}
            >
                <Plus />
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>New task</DialogTitle>
                    <DialogDescription>An extra on top of the deliverables. It starts in To do.</DialogDescription>
                </DialogHeader>
                {projects.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No signed or running project to add to. A project takes tasks once it is signed.</p>
                ) : (
                    <form onSubmit={submit} className="grid gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="new-task-project" className="text-xs">
                                Project
                            </Label>
                            <select
                                id="new-task-project"
                                value={projectId}
                                onChange={(e) => {
                                    setProjectId(e.target.value);
                                    setOwner(null);
                                }}
                                className={SEL}
                            >
                                {groups.map(([client, list]) => (
                                    <optgroup key={client} label={list.some((p) => p.internal) ? `${client} · internal` : client}>
                                        {list.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.name} · {p.code}
                                            </option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="new-task-type" className="text-xs">
                                    Type
                                </Label>
                                <select
                                    id="new-task-type"
                                    value={type}
                                    onChange={(e) => {
                                        setType(e.target.value as LineType);
                                        setOwner(null);
                                    }}
                                    className={SEL}
                                >
                                    {LINE_TYPES.map((t) => (
                                        <option key={t} value={t}>
                                            {LINE_TYPE_LABEL[t]}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="new-task-due" className="text-xs">
                                    Due date
                                </Label>
                                <Input id="new-task-due" type="date" required value={due} onChange={(e) => setDue(e.target.value)} className="h-9" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="new-task-title" className="text-xs">
                                Title
                            </Label>
                            <Input
                                id="new-task-title"
                                required
                                maxLength={200}
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="e.g. Extra reel for the launch"
                                className="h-9"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="new-task-owner" className="text-xs">
                                Owner <span className="font-normal text-muted-foreground">· optional</span>
                            </Label>
                            <select id="new-task-owner" value={ownerValue} onChange={(e) => setOwner(e.target.value)} className={SEL}>
                                <option value="">— open seat —</option>
                                {members.map((m) => (
                                    <option key={m} value={m}>
                                        {m}
                                        {m === defaultOwner ? " (project crew)" : ""}
                                    </option>
                                ))}
                            </select>
                            <p className="text-[11px] text-muted-foreground">
                                {seat ? `${SEAT_LABEL[seat]} seat. ` : ""}
                                {defaultOwner ? `Starts as ${defaultOwner} from the project crew.` : "Nobody on the project crew holds this seat yet."}
                            </p>
                        </div>
                        <div className="flex justify-end gap-2 border-t pt-3">
                            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => onOpenChange(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" size="sm" disabled={pending || !project || !title.trim() || !due}>
                                {pending ? "Adding…" : "Add task"}
                            </Button>
                        </div>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
