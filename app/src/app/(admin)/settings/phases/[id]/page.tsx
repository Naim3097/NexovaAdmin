import Link from "next/link";
import { notFound } from "next/navigation";
import {
    getDefaultPhaseTemplate,
    getPhaseTemplateById,
} from "@/lib/data/phase-templates";
import type { PlannerPhase } from "@/lib/data/planners";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    deletePhaseTemplateAction,
    setDefaultPhaseTemplateAction,
    updatePhaseTemplateAction,
} from "@/lib/phase-templates/actions";

export const dynamic = "force-dynamic";

/** The textarea form the action parses back: "Name — summary" per line. */
function phasesToText(phases: PlannerPhase[]): string {
    return phases
        .map((ph) => (ph.summary ? `${ph.name} — ${ph.summary}` : ph.name))
        .join("\n");
}

export default async function PhaseTemplateDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const [t, def] = await Promise.all([
        getPhaseTemplateById(id),
        getDefaultPhaseTemplate(),
    ]);
    if (!t) notFound();

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/settings/phases"
                    className="text-xs text-muted-foreground hover:underline"
                >
                    Phase templates
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-semibold md:text-3xl">
                        {t.name}
                    </h1>
                    {t.isDefault ? <Badge>Default</Badge> : null}
                </div>
                <p className="text-sm text-muted-foreground">
                    {t.phases.length} phase{t.phases.length === 1 ? "" : "s"} ·{" "}
                    {t.isDefault
                        ? "new contracts start from these."
                        : "applied when a contract is created, or from its Phases section."}
                </p>
            </div>

            <form
                key={t.updatedAt}
                action={updatePhaseTemplateAction}
                className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
            >
                <input type="hidden" name="id" value={t.id} />
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-sm">Name</Label>
                        <Input name="name" defaultValue={t.name} required />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Description</Label>
                        <Input name="description" defaultValue={t.description} />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-sm">
                        Phases (one per line, in order)
                    </Label>
                    <Textarea
                        name="phases"
                        rows={Math.max(4, t.phases.length + 1)}
                        defaultValue={phasesToText(t.phases)}
                        placeholder={"Discovery — Requirements, sitemap, content inventory\nDesign\nBuild"}
                    />
                    <p className="text-xs text-muted-foreground">
                        Write <span className="font-mono">Name — summary</span>{" "}
                        or just the name; contracts already using this template keep their own copy.
                    </p>
                </div>
                <div className="flex justify-end">
                    <Button type="submit">Save</Button>
                </div>
            </form>

            <form
                action={setDefaultPhaseTemplateAction}
                className="flex flex-col gap-3 rounded-lg border bg-card p-4 md:flex-row md:items-center md:justify-between"
            >
                <input type="hidden" name="id" value={t.id} />
                {t.isDefault ? (
                    <input type="hidden" name="isDefault" value="0" />
                ) : null}
                <div>
                    <p className="text-sm font-medium">Default for new contracts</p>
                    <p className="text-xs text-muted-foreground">
                        {t.isDefault
                            ? "New contracts start from this template; clear it to fall back to the built-in Kickoff / Foundation / Production / Review set."
                            : def
                              ? `New contracts currently start from "${def.name}".`
                              : "New contracts currently start from the built-in Kickoff / Foundation / Production / Review set."}
                    </p>
                </div>
                <Button type="submit" variant="outline" size="sm" className="shrink-0">
                    {t.isDefault ? "Clear default" : "Make default"}
                </Button>
            </form>

            <form
                action={deletePhaseTemplateAction}
                className="rounded-lg border border-destructive/40 bg-destructive/5 p-4"
            >
                <input type="hidden" name="id" value={t.id} />
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <p className="text-sm font-medium text-destructive">
                            Delete template
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Removes the template only; contracts keep the phases they already have.
                        </p>
                    </div>
                    <Button type="submit" variant="destructive">
                        Delete
                    </Button>
                </div>
            </form>
        </div>
    );
}
