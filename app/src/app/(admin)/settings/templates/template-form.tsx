/**
 * The one form both Templates pages use: name, months, description, the
 * deliverable rows and the phase rows (the same editors New project has).
 * Server component; the caller wraps it in a <form action=…> and adds its own
 * buttons.
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DeliverableRows } from "@/app/(admin)/projects/deliverable-rows";
import { PhaseRows } from "@/app/(admin)/projects/phase-rows";
import type { ProjectTemplate } from "@/lib/data/project-templates";
import { MAX_TEMPLATE_MONTHS, MIN_TEMPLATE_MONTHS } from "@/lib/data/project-templates";
import { DEFAULT_TEMPLATE_PHASES } from "@/lib/contracts/phases";
import { cn } from "@/lib/utils";

export function TemplateFields({ t, error }: { t?: ProjectTemplate | null; error?: string }) {
    return (
        <>
            <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-1.5 md:col-span-3">
                    <Label className="text-sm">Name</Label>
                    <Input name="name" required defaultValue={t?.name ?? ""} placeholder="Growth" aria-invalid={error === "name" || undefined} />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-sm">Months</Label>
                    <Input name="months" type="number" min={MIN_TEMPLATE_MONTHS} max={MAX_TEMPLATE_MONTHS} step={1} required defaultValue={t?.months ?? 3} />
                    <p className="text-[11px] text-muted-foreground">The project runs start + this many months.</p>
                </div>
                <div className="space-y-1.5 md:col-span-4">
                    <Label className="text-sm">One line on what it is for</Label>
                    <Input name="description" defaultValue={t?.description ?? ""} placeholder="Content and search together, with a site to land on." />
                </div>
            </div>

            <div className={cn("rounded-lg border p-3 md:p-4", error === "requirements" && "border-destructive/60")}>
                <p className="text-sm font-medium">Deliverables</p>
                <p className="text-xs text-muted-foreground">One row per thing delivered: what it is, how many, a week / a month / once, and the channel. At least one row is needed.</p>
                <DeliverableRows initial={t?.requirements ?? []} className="mt-3" />
            </div>

            <div className="rounded-lg border p-3 md:p-4">
                <p className="text-sm font-medium">Phases</p>
                <p className="text-xs text-muted-foreground">The timeline a project made from this template starts with; month 1 is its first month. May be empty.</p>
                <PhaseRows initial={t?.phases ?? DEFAULT_TEMPLATE_PHASES} termMonths={t?.months} className="mt-3" />
            </div>
        </>
    );
}
