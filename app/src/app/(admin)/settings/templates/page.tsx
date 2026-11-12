/**
 * Settings → Templates. The saved starting points for projects: months,
 * deliverables, phases. "New project" offers them next to Custom.
 */
import Link from "next/link";
import { listProjectTemplates } from "@/lib/data/project-templates";
import { requirementsLabel } from "@/lib/contracts/requirements";
import { templatePhasesLabel } from "@/lib/contracts/phases";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PendingButton } from "@/components/pending-button";
import { createProjectTemplateAction, seedStarterProjectTemplatesAction } from "@/lib/project-templates/actions";
import { TemplateFields } from "./template-form";

export const dynamic = "force-dynamic";

type SP = { error?: string };

export default async function SettingsTemplatesPage({ searchParams }: { searchParams: Promise<SP> }) {
    const sp = await searchParams;
    const templates = await listProjectTemplates();

    return (
        <div className="space-y-6">
            <div>
                <Link href="/settings" className="text-xs text-muted-foreground hover:underline">
                    Settings
                </Link>
                <h1 className="mt-1 text-2xl font-semibold md:text-3xl">Templates</h1>
                <p className="text-sm text-muted-foreground">
                    {templates.length} template{templates.length === 1 ? "" : "s"}. A template is a saved start for a project: how many months, what gets
                    delivered, which phases. New project offers Custom or a template; everything stays editable on the project. Changing a template
                    never touches projects already made from it.
                </p>
            </div>

            {sp.error ? (
                <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {sp.error === "name" ? "Give the template a name." : "Add at least one deliverable with a count above zero."}
                </p>
            ) : null}

            <div className="rounded-lg border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4 text-sm font-medium">
                    <span>Templates</span>
                    {templates.length === 0 ? (
                        <form action={seedStarterProjectTemplatesAction}>
                            <PendingButton size="sm" variant="outline" pendingLabel="Adding…">
                                Add Starter, Growth, Scale
                            </PendingButton>
                        </form>
                    ) : null}
                </div>
                {templates.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">No templates yet. Add the three starters, or write your own below.</p>
                ) : (
                    <ul className="divide-y">
                        {templates.map((t) => (
                            <li key={t.id} className="flex flex-col gap-2 p-4 md:flex-row md:items-start md:justify-between">
                                <div className="min-w-0 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Link href={`/settings/templates/${t.id}`} className="font-medium hover:underline">
                                            {t.name}
                                        </Link>
                                        <Badge variant="outline">
                                            {t.months} month{t.months === 1 ? "" : "s"}
                                        </Badge>
                                    </div>
                                    {t.description ? <p className="text-xs text-muted-foreground">{t.description}</p> : null}
                                    <p className="text-xs">{requirementsLabel(t.requirements) || <span className="text-muted-foreground">no deliverables</span>}</p>
                                    <p className="text-xs text-muted-foreground" title="Phases">
                                        {templatePhasesLabel(t.phases) || "no phases"}
                                    </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/projects/new?template=${t.id}`} />}>
                                        New project from this
                                    </Button>
                                    <Link href={`/settings/templates/${t.id}`} className="text-sm underline underline-offset-4">
                                        Edit
                                    </Link>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <form action={createProjectTemplateAction} className="space-y-4 rounded-lg border bg-card p-4 md:p-6">
                <h2 className="text-sm font-medium">+ New template</h2>
                <TemplateFields error={sp.error} />
                <div className="flex justify-end">
                    <PendingButton pendingLabel="Saving…">Save template</PendingButton>
                </div>
            </form>
        </div>
    );
}
