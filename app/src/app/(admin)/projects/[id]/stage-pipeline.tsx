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
import { TEAM_ROLES, type TeamMember } from "@/lib/data/team";
import { SERVICE_CATEGORIES } from "@/lib/dev-store/services";
import type { ProjectStage } from "@/lib/data/projects";
import {
    addStageAction,
    advanceStageAction,
    moveStageAction,
    removeStageAction,
    setProjectServiceAction,
    updateStageAction,
} from "@/lib/projects/actions";

const STATE_DOT: Record<ProjectStage["state"], string> = {
    done: "bg-green-500",
    active: "bg-primary",
    pending: "bg-muted-foreground/30",
};

function ServicePicker({
    projectId,
    current,
    label,
}: {
    projectId: string;
    current: string;
    label: string;
}) {
    return (
        <form action={setProjectServiceAction} className="flex items-end gap-2">
            <input type="hidden" name="id" value={projectId} />
            <div className="space-y-1">
                <Label className="text-xs">Service / workflow</Label>
                <Select name="serviceCategory" defaultValue={current || "website"}>
                    <SelectTrigger className="h-9 w-44">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {SERVICE_CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>
                                {c}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <Button type="submit" variant="outline" size="sm">
                {label}
            </Button>
        </form>
    );
}

export function StagePipeline({
    projectId,
    serviceCategory,
    stages,
    team,
}: {
    projectId: string;
    serviceCategory: string;
    stages: ProjectStage[];
    team: TeamMember[];
}) {
    const hasStages = stages.length > 0;
    const activeIdx = stages.findIndex((s) => s.state === "active");
    const doneCount = stages.filter((s) => s.state === "done").length;

    return (
        <section className="rounded-lg border bg-card p-4 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="text-sm font-medium">Delivery pipeline</h2>
                    {hasStages ? (
                        <p className="text-xs text-muted-foreground">
                            {doneCount}/{stages.length} stages done
                            {serviceCategory ? ` · ${serviceCategory}` : ""}
                        </p>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            Pick a service to generate the standard flow.
                        </p>
                    )}
                </div>
                {hasStages && activeIdx !== -1 ? (
                    <form action={advanceStageAction}>
                        <input type="hidden" name="id" value={projectId} />
                        <Button type="submit" size="sm">
                            Complete “{stages[activeIdx].label}” →
                        </Button>
                    </form>
                ) : null}
            </div>

            {!hasStages ? (
                <div className="mt-4">
                    <ServicePicker
                        projectId={projectId}
                        current={serviceCategory}
                        label="Generate pipeline"
                    />
                </div>
            ) : (
                <>
                    {/* Visual flow guide */}
                    <ol className="mt-4 space-y-1.5">
                        {stages.map((s, idx) => (
                            <li
                                key={s.id}
                                className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
                                    s.state === "active"
                                        ? "border-primary/40 bg-primary/5"
                                        : ""
                                }`}
                            >
                                <span
                                    className={`size-2.5 shrink-0 rounded-full ${STATE_DOT[s.state]}`}
                                    aria-hidden
                                />
                                <span className="w-5 shrink-0 text-xs text-muted-foreground">
                                    {idx + 1}
                                </span>
                                <span
                                    className={`flex-1 text-sm ${
                                        s.state === "done"
                                            ? "text-muted-foreground line-through"
                                            : "font-medium"
                                    }`}
                                >
                                    {s.label}
                                </span>
                                <Badge variant="outline" className="shrink-0">
                                    {s.ownerRole}
                                </Badge>
                                <span className="hidden w-32 shrink-0 truncate text-right text-xs text-muted-foreground sm:block">
                                    {s.assignee ? `@${s.assignee}` : "—"}
                                </span>
                            </li>
                        ))}
                    </ol>

                    {/* Customise */}
                    <details className="mt-4 rounded-md border bg-muted/30">
                        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">
                            Customise pipeline (PIC, stages, order)
                        </summary>
                        <div className="space-y-3 border-t p-3">
                            {stages.map((s, idx) => (
                                <div
                                    key={s.id}
                                    className="flex flex-wrap items-end gap-2 rounded-md border bg-background p-2"
                                >
                                    <form
                                        action={updateStageAction}
                                        className="flex flex-wrap items-end gap-2"
                                    >
                                        <input type="hidden" name="id" value={projectId} />
                                        <input type="hidden" name="stageId" value={s.id} />
                                        <div className="space-y-1">
                                            <Label className="text-[11px]">Stage</Label>
                                            <Input
                                                name="label"
                                                defaultValue={s.label}
                                                className="h-8 w-40"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[11px]">Owner</Label>
                                            <Select name="ownerRole" defaultValue={s.ownerRole}>
                                                <SelectTrigger className="h-8 w-28">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {TEAM_ROLES.map((r) => (
                                                        <SelectItem key={r} value={r}>
                                                            {r}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[11px]">PIC</Label>
                                            <Select
                                                name="assignee"
                                                defaultValue={s.assignee || "none"}
                                            >
                                                <SelectTrigger className="h-8 w-40">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">
                                                        — Unassigned —
                                                    </SelectItem>
                                                    {team.map((m) => (
                                                        <SelectItem key={m.id} value={m.name}>
                                                            {m.name} ({m.role})
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <Button type="submit" size="sm" variant="outline">
                                            Save
                                        </Button>
                                    </form>
                                    <div className="flex items-end gap-1">
                                        <StageMini
                                            projectId={projectId}
                                            stageId={s.id}
                                            dir="up"
                                            disabled={idx === 0}
                                        />
                                        <StageMini
                                            projectId={projectId}
                                            stageId={s.id}
                                            dir="down"
                                            disabled={idx === stages.length - 1}
                                        />
                                        <form action={removeStageAction}>
                                            <input type="hidden" name="id" value={projectId} />
                                            <input type="hidden" name="stageId" value={s.id} />
                                            <Button
                                                type="submit"
                                                size="sm"
                                                variant="ghost"
                                                className="h-8 px-2 text-xs text-muted-foreground"
                                            >
                                                Remove
                                            </Button>
                                        </form>
                                    </div>
                                </div>
                            ))}

                            {/* Add stage */}
                            <form
                                action={addStageAction}
                                className="flex flex-wrap items-end gap-2 border-t pt-3"
                            >
                                <input type="hidden" name="id" value={projectId} />
                                <div className="space-y-1">
                                    <Label className="text-[11px]">New stage</Label>
                                    <Input
                                        name="label"
                                        required
                                        placeholder="e.g. Content upload"
                                        className="h-8 w-44"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[11px]">Owner</Label>
                                    <Select name="ownerRole" defaultValue="PM">
                                        <SelectTrigger className="h-8 w-28">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {TEAM_ROLES.map((r) => (
                                                <SelectItem key={r} value={r}>
                                                    {r}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <Button type="submit" size="sm">
                                    Add stage
                                </Button>
                            </form>

                            {/* Change service (regenerates) */}
                            <div className="border-t pt-3">
                                <ServicePicker
                                    projectId={projectId}
                                    current={serviceCategory}
                                    label="Regenerate from service"
                                />
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                    Replaces all stages with the chosen service&apos;s
                                    template.
                                </p>
                            </div>
                        </div>
                    </details>
                </>
            )}
        </section>
    );
}

function StageMini({
    projectId,
    stageId,
    dir,
    disabled,
}: {
    projectId: string;
    stageId: string;
    dir: "up" | "down";
    disabled: boolean;
}) {
    return (
        <form action={moveStageAction}>
            <input type="hidden" name="id" value={projectId} />
            <input type="hidden" name="stageId" value={stageId} />
            <input type="hidden" name="dir" value={dir} />
            <Button
                type="submit"
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-xs"
                disabled={disabled}
            >
                {dir === "up" ? "↑" : "↓"}
            </Button>
        </form>
    );
}
