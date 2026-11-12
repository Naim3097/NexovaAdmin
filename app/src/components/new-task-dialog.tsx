"use client";
/**
 * "New task" on a project page: the one place a task is added by hand. The
 * project is fixed (its name shows in the dialog); the dialog asks for the
 * task type, a title, the due date (a week out on a working day, never
 * before the project starts) and the owner, which starts as the project
 * crew's person on the type's default seat ("open seat" allowed). Saves with
 * createTaskAction, which checks the same who-may-add rule, then a toast and
 * a refresh: the task lands in the project's Tasks tab, in To do.
 */
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_SPLIT, LINE_TYPES, LINE_TYPE_LABEL, SEAT_LABEL, type LineType, type Seat } from "@/lib/planners/vocab";
import { isOffDay, nearestWorkingDay } from "@/lib/capacity/helpers";
import { createTaskAction } from "@/lib/works/quick-actions";

const SEL = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";

/** The project the dialog adds to. */
export type NewTaskProject = {
    id: string;
    code: string;
    name: string;
    clientName: string;
    /** YYYY-MM-DD or "": no due date before it. */
    startDate: string;
    /** Seat → person from the project crew, the AM seat already falling back to the account manager. */
    crew: Partial<Record<Seat, string>>;
};

function addDays(ymd: string, n: number): string {
    const d = new Date(`${ymd}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return "";
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

/** The first working day on or after `ymd`. */
function workingDayFrom(ymd: string): string {
    let d = ymd;
    for (let i = 0; i < 14 && isOffDay(d); i += 1) d = addDays(d, 1);
    return d;
}

/** A week out on a working day; never before the project starts. */
function defaultDue(today: string, startDate: string): string {
    const week = addDays(today, 7);
    const due = week ? nearestWorkingDay(week) : "";
    return startDate && (!due || due < startDate) ? workingDayFrom(startDate) : due;
}

export function NewTaskButton({
    project,
    members,
    today,
    asParam,
    variant = "default",
}: {
    project: NewTaskProject;
    /** Active team names, for the owner pick. */
    members: string[];
    today: string;
    /** `?as=` under the dev bypass, so the server knows who is acting. */
    asParam?: string;
    variant?: "default" | "outline";
}) {
    const router = useRouter();
    const uid = useId();
    const [open, setOpen] = useState(false);
    const [pending, start] = useTransition();
    const [type, setType] = useState<LineType>("static");
    const [title, setTitle] = useState("");
    const [due, setDue] = useState(() => defaultDue(today, project.startDate));
    // null follows the crew default; a string is the person picked here ("" = open seat).
    const [owner, setOwner] = useState<string | null>(null);

    const seat = DEFAULT_SPLIT[type][0]?.seat;
    const crewPick = seat ? (project.crew[seat] ?? "") : "";
    // Only someone on the active team can be offered; anyone else leaves the seat open.
    const defaultOwner = members.includes(crewPick) ? crewPick : "";
    const ownerValue = owner ?? defaultOwner;
    const beforeStart = Boolean(project.startDate) && Boolean(due) && due < project.startDate;

    const onOpenChange = (next: boolean) => {
        // Each open starts on the crew default and a fresh due date.
        if (next) {
            setOwner(null);
            setDue(defaultDue(today, project.startDate));
        }
        setOpen(next);
    };

    const submit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        start(async () => {
            const r = await createTaskAction({ contractId: project.id, type, title, dueDate: due, owner: ownerValue, as: asParam });
            if (!r.ok) {
                toast.error(r.reason);
                return;
            }
            toast.success(`Added to To do: ${r.title}`, {
                description: `${project.name} · ${LINE_TYPE_LABEL[type]} · due ${due}${ownerValue ? ` · ${ownerValue}` : " · open seat"}`,
            });
            setTitle("");
            setOwner(null);
            setOpen(false);
            router.refresh();
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger render={<Button size="sm" variant={variant} />}>
                <Plus />
                New task
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>New task</DialogTitle>
                    <DialogDescription>
                        On <span className="font-medium text-foreground">{project.name}</span> · {project.clientName} · {project.code}. An extra on top of the
                        deliverables; it starts in To do.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="grid gap-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor={`${uid}-type`} className="text-xs">
                                Type
                            </Label>
                            <select
                                id={`${uid}-type`}
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
                            <Label htmlFor={`${uid}-due`} className="text-xs">
                                Due date
                            </Label>
                            <Input
                                id={`${uid}-due`}
                                type="date"
                                required
                                min={project.startDate || undefined}
                                value={due}
                                onChange={(e) => setDue(e.target.value)}
                                className="h-9"
                            />
                        </div>
                    </div>
                    {beforeStart ? <p className="text-[11px] text-red-600 dark:text-red-400">The account starts {project.startDate}; pick that day or later.</p> : null}
                    <div className="space-y-1.5">
                        <Label htmlFor={`${uid}-title`} className="text-xs">
                            Title
                        </Label>
                        <Input
                            id={`${uid}-title`}
                            required
                            maxLength={200}
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Extra reel for the launch"
                            className="h-9"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor={`${uid}-owner`} className="text-xs">
                            Owner
                        </Label>
                        <select id={`${uid}-owner`} value={ownerValue} onChange={(e) => setOwner(e.target.value)} className={SEL}>
                            <option value="">— open seat —</option>
                            {members.map((m) => (
                                <option key={m} value={m}>
                                    {m}
                                    {m === defaultOwner ? " (account crew)" : ""}
                                </option>
                            ))}
                        </select>
                        <p className="text-[11px] text-muted-foreground">
                            {seat ? `${SEAT_LABEL[seat]} seat. ` : ""}
                            {defaultOwner ? `Starts as ${defaultOwner} from the account crew.` : "Nobody on the account crew holds this seat yet."}
                        </p>
                    </div>
                    <div className="flex justify-end gap-2 border-t pt-3">
                        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" size="sm" disabled={pending || !title.trim() || !due || beforeStart}>
                            {pending ? "Adding…" : "Add task"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
