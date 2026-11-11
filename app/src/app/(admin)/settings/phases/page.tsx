import Link from "next/link";
import { listPhaseTemplates } from "@/lib/data/phase-templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    createPhaseTemplateAction,
    seedStarterPhaseTemplatesAction,
    setDefaultPhaseTemplateAction,
} from "@/lib/phase-templates/actions";

export const dynamic = "force-dynamic";

export default async function SettingsPhasesPage() {
    const templates = await listPhaseTemplates();
    const def = templates.find((t) => t.isDefault) ?? null;
    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/settings"
                    className="text-xs text-muted-foreground hover:underline"
                >
                    Settings
                </Link>
                <h1 className="mt-1 text-2xl font-semibold md:text-3xl">
                    Phase templates
                </h1>
                <p className="text-sm text-muted-foreground">
                    {templates.length} template{templates.length === 1 ? "" : "s"}; new contracts start from{" "}
                    {def ? (
                        <>
                            the{" "}
                            <span className="font-medium text-foreground">
                                {def.name}
                            </span>{" "}
                            phases
                        </>
                    ) : (
                        "the built-in Kickoff / Foundation / Production / Review set"
                    )}
                    .
                </p>
            </div>

            <form
                action={createPhaseTemplateAction}
                className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
            >
                <h2 className="text-sm font-medium">Add template</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-sm">Name</Label>
                        <Input name="name" required placeholder="Website build" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Description</Label>
                        <Input
                            name="description"
                            placeholder="A fixed-scope site: discovery, design, build, launch."
                        />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-sm">
                            Phases (one per line, in order)
                        </Label>
                        <Textarea
                            name="phases"
                            rows={5}
                            placeholder={
                                "Discovery — Requirements, sitemap, content inventory\nDesign — Wireframes, visual design, client sign-off\nBuild\nQA & launch — Testing, fixes, go-live and handover"
                            }
                        />
                        <p className="text-xs text-muted-foreground">
                            Write{" "}
                            <span className="font-mono">Name — summary</span> or
                            just the name; months are set on each contract.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            name="isDefault"
                            className="size-4 rounded border-input"
                        />
                        Use for new contracts (default)
                    </label>
                    <Button type="submit">Add template</Button>
                </div>
            </form>

            <div className="rounded-lg border bg-card">
                <div className="border-b p-4 text-sm font-medium">Templates</div>
                {templates.length === 0 ? (
                    <div className="flex flex-col items-start gap-3 p-6">
                        <p className="text-sm text-muted-foreground">
                            No templates yet — seed the three starters (Social
                            retainer, Website build, Brand launch) or add your
                            own above.
                        </p>
                        <form action={seedStarterPhaseTemplatesAction}>
                            <Button type="submit" variant="outline" size="sm">
                                Seed starters
                            </Button>
                        </form>
                    </div>
                ) : (
                    <ul className="divide-y">
                        {templates.map((t) => (
                            <li
                                key={t.id}
                                className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between"
                            >
                                <div className="min-w-0 flex-1 space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Link
                                            href={`/settings/phases/${t.id}`}
                                            className="font-medium hover:underline"
                                        >
                                            {t.name}
                                        </Link>
                                        {t.isDefault ? <Badge>Default</Badge> : null}
                                    </div>
                                    {t.description ? (
                                        <p className="text-xs text-muted-foreground">
                                            {t.description}
                                        </p>
                                    ) : null}
                                    <div className="flex flex-wrap gap-1.5">
                                        {t.phases.length === 0 ? (
                                            <span className="text-xs text-muted-foreground">
                                                No phases
                                            </span>
                                        ) : (
                                            t.phases.map((ph, i) => (
                                                <Badge
                                                    key={ph.key}
                                                    variant="outline"
                                                    title={ph.summary || undefined}
                                                >
                                                    <span className="font-mono text-[10px] text-muted-foreground">
                                                        {i + 1}
                                                    </span>
                                                    {ph.name}
                                                </Badge>
                                            ))
                                        )}
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    {t.isDefault ? null : (
                                        <form action={setDefaultPhaseTemplateAction}>
                                            <input type="hidden" name="id" value={t.id} />
                                            <Button type="submit" variant="ghost" size="sm">
                                                Make default
                                            </Button>
                                        </form>
                                    )}
                                    <Link
                                        href={`/settings/phases/${t.id}`}
                                        className="text-sm underline underline-offset-4"
                                    >
                                        Edit
                                    </Link>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
