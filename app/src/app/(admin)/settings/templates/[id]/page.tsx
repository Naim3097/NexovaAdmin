/**
 * One project template: edit its months, deliverables and phases, start a
 * project from it, or delete it. Projects already made from it keep their own
 * copy, so a change here only affects the next one.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getActingMember } from "@/lib/auth";
import { getProjectTemplateById } from "@/lib/data/project-templates";
import { isAdmin } from "@/lib/roles";
import { requirementsLabel } from "@/lib/contracts/requirements";
import { templatePhasesLabel } from "@/lib/contracts/phases";
import { Button } from "@/components/ui/button";
import { PendingButton } from "@/components/pending-button";
import { deleteProjectTemplateAction, updateProjectTemplateAction } from "@/lib/project-templates/actions";
import { TemplateFields } from "../template-form";

export const dynamic = "force-dynamic";

type SP = { error?: string; saved?: string };

export default async function ProjectTemplatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
    const { id } = await params;
    const [sp, t, me] = await Promise.all([searchParams, getProjectTemplateById(id), getActingMember()]);
    if (!t) notFound();
    // Everyone edits; only admins delete.
    const admin = isAdmin(me);

    return (
        <div className="space-y-6">
            <div>
                <Link href="/settings/templates" className="text-xs text-muted-foreground hover:underline">
                    Templates
                </Link>
                <h1 className="mt-1 text-2xl font-semibold md:text-3xl">{t.name}</h1>
                <p className="text-sm text-muted-foreground">
                    {t.months} month{t.months === 1 ? "" : "s"} · {requirementsLabel(t.requirements) || "no deliverables"} ·{" "}
                    {templatePhasesLabel(t.phases) || "no phases"}. Used as the start of a new project; the project is then edited on its own.
                </p>
            </div>

            {sp.error ? (
                <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {sp.error === "name" ? "Give the template a name." : "Add at least one deliverable with a count above zero."}
                </p>
            ) : sp.saved ? (
                <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">Saved.</p>
            ) : null}

            <form key={t.updatedAt} action={updateProjectTemplateAction} className="space-y-4 rounded-lg border bg-card p-4 md:p-6">
                <input type="hidden" name="id" value={t.id} />
                <TemplateFields t={t} error={sp.error} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button variant="outline" nativeButton={false} render={<Link href={`/projects/new?template=${t.id}`} />}>
                        New project from this
                    </Button>
                    <PendingButton pendingLabel="Saving…">Save changes</PendingButton>
                </div>
            </form>

            {admin ? (
                <form action={deleteProjectTemplateAction} className="rounded-lg border border-destructive/40 bg-card p-4 md:p-6">
                    <input type="hidden" name="id" value={t.id} />
                    <h2 className="text-sm font-medium text-destructive">Delete template</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Projects already made from it are not touched.</p>
                    <Button type="submit" variant="destructive" size="sm" className="mt-3">
                        Delete {t.name}
                    </Button>
                </form>
            ) : (
                <p className="text-xs text-muted-foreground">Only admins delete a template.</p>
            )}
        </div>
    );
}
