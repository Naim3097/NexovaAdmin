import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronUp, ChevronDown } from "lucide-react";
import { getTemplate } from "@/lib/data/workflows";
import {
    SERVICE_CATEGORIES,
    type ServiceCategory,
} from "@/lib/dev-store/services";
import { TEAM_ROLES } from "@/lib/data/team";
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
    addTemplateStageAction,
    moveTemplateStageAction,
    removeTemplateStageAction,
    renameTemplateAction,
    resetTemplateAction,
    updateTemplateStageAction,
} from "@/lib/workflows/actions";

export const dynamic = "force-dynamic";

export default async function WorkflowEditPage({
    params,
}: {
    params: Promise<{ category: string }>;
}) {
    const { category } = await params;
    if (!(SERVICE_CATEGORIES as readonly string[]).includes(category)) {
        notFound();
    }
    const cat = category as ServiceCategory;
    const tpl = await getTemplate(cat);

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/settings/workflows"
                    className="text-sm text-muted-foreground hover:underline"
                >
                    ← All workflows
                </Link>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <h1 className="text-2xl font-semibold md:text-3xl">
                        {tpl.name}
                    </h1>
                    <form action={resetTemplateAction}>
                        <input type="hidden" name="category" value={cat} />
                        <Button type="submit" variant="outline" size="sm">
                            Reset to default
                        </Button>
                    </form>
                </div>
                <p className="text-sm text-muted-foreground">
                    Service: {cat}. Editing here affects new projects only —
                    existing projects keep their own stages.
                </p>
            </div>

            {/* Name */}
            <form
                action={renameTemplateAction}
                className="flex items-end gap-2 rounded-lg border bg-card p-4"
            >
                <input type="hidden" name="category" value={cat} />
                <div className="flex-1 space-y-1">
                    <Label className="text-xs">Workflow name</Label>
                    <Input name="name" defaultValue={tpl.name} className="h-9" />
                </div>
                <Button type="submit" size="sm" variant="outline">
                    Save name
                </Button>
            </form>

            {/* Stages */}
            <div className="space-y-2">
                {tpl.stages.map((s, idx) => (
                    <div
                        key={`${s.key}-${idx}`}
                        className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3"
                    >
                        <span className="self-center text-xs text-muted-foreground">
                            {idx + 1}
                        </span>
                        <form
                            action={updateTemplateStageAction}
                            className="flex flex-wrap items-end gap-2"
                        >
                            <input type="hidden" name="category" value={cat} />
                            <input type="hidden" name="index" value={idx} />
                            <div className="space-y-1">
                                <Label className="text-[11px]">Stage</Label>
                                <Input
                                    name="label"
                                    defaultValue={s.label}
                                    className="h-8 w-44"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[11px]">Owner role</Label>
                                <Select name="ownerRole" defaultValue={s.ownerRole}>
                                    <SelectTrigger className="h-8 w-32">
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
                            <Button type="submit" size="sm" variant="outline">
                                Save
                            </Button>
                        </form>
                        <div className="flex items-end gap-1">
                            <MoveBtn category={cat} index={idx} dir="up" disabled={idx === 0} />
                            <MoveBtn
                                category={cat}
                                index={idx}
                                dir="down"
                                disabled={idx === tpl.stages.length - 1}
                            />
                            <form action={removeTemplateStageAction}>
                                <input type="hidden" name="category" value={cat} />
                                <input type="hidden" name="index" value={idx} />
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
            </div>

            {/* Add stage */}
            <form
                action={addTemplateStageAction}
                className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-4"
            >
                <input type="hidden" name="category" value={cat} />
                <div className="space-y-1">
                    <Label className="text-xs">New stage</Label>
                    <Input
                        name="label"
                        required
                        placeholder="e.g. QA"
                        className="h-9 w-48"
                    />
                </div>
                <div className="space-y-1">
                    <Label className="text-xs">Owner role</Label>
                    <Select name="ownerRole" defaultValue="PM">
                        <SelectTrigger className="h-9 w-32">
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
        </div>
    );
}

function MoveBtn({
    category,
    index,
    dir,
    disabled,
}: {
    category: string;
    index: number;
    dir: "up" | "down";
    disabled: boolean;
}) {
    return (
        <form action={moveTemplateStageAction}>
            <input type="hidden" name="category" value={category} />
            <input type="hidden" name="index" value={index} />
            <input type="hidden" name="dir" value={dir} />
            <Button
                type="submit"
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-xs"
                disabled={disabled}
                aria-label={dir === "up" ? "Move up" : "Move down"}
            >
                {dir === "up" ? (
                    <ChevronUp className="size-4" />
                ) : (
                    <ChevronDown className="size-4" />
                )}
            </Button>
        </form>
    );
}
