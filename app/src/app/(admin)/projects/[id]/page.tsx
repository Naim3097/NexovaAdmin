import Link from "next/link";
import { notFound } from "next/navigation";
import {
    PROJECT_PHASES,
    PROJECT_STATUSES,
    getProjectById,
    type ProjectPhase,
} from "@/lib/data/projects";
import { listTeamMembers } from "@/lib/data/team";
import {
    computeTotals,
    listInvoicesForProject,
} from "@/lib/data/invoices";
import { Badge } from "@/components/ui/badge";
import { HistoryPanel } from "@/components/history-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    addProjectDeliverableAction,
    addProjectTaskAction,
    approveDeliverableAction,
    clearSignoffAction,
    deleteDeliverableAction,
    deleteProjectAction,
    deleteProjectTaskAction,
    revokeProjectPortalTokenAction,
    rotateProjectPortalTokenAction,
    setProjectStatusAction,
    signoffProjectAction,
    toggleProjectTaskAction,
    unapproveDeliverableAction,
    updateProjectAction,
} from "@/lib/projects/actions";
import { StagePipeline } from "./stage-pipeline";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const proj = await getProjectById(id);
    if (!proj) notFound();

    const open = proj.tasks.filter((t) => !t.done).length;
    const total = proj.tasks.length;
    const team = await listTeamMembers();
    const activeTeam = team.filter((m) => m.active);
    const invoices = await listInvoicesForProject(proj.id);
    const billed = invoices.reduce((sum, i) => sum + computeTotals(i).total, 0);
    const paid = invoices
        .filter((i) => i.status === "paid")
        .reduce((sum, i) => sum + computeTotals(i).total, 0);

    const activeStage = proj.stages.find((s) => s.state === "active");
    const approvedDeliverables = proj.deliverables.filter((d) => d.approvedAt);
    const pendingDeliverables = proj.deliverables.filter((d) => !d.approvedAt);

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/projects"
                    className="text-sm text-muted-foreground hover:underline"
                >
                    ← Back to projects
                </Link>
                <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <h1 className="text-2xl font-semibold md:text-3xl">{proj.name}</h1>
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{proj.status.replace(/_/g, " ")}</Badge>
                        {activeStage ? (
                            <Badge variant="outline">stage: {activeStage.label}</Badge>
                        ) : null}
                        {proj.signoff.signedAt ? (
                            <Badge>signed off</Badge>
                        ) : null}
                    </div>
                </div>
                <p className="text-sm text-muted-foreground">{proj.clientName}</p>
            </div>

            {/* Delivery pipeline (flow guide) */}
            <StagePipeline
                projectId={proj.id}
                serviceCategory={proj.serviceCategory}
                stages={proj.stages}
                team={activeTeam}
            />

            {/* Status changer */}
            <section className="rounded-lg border bg-card p-4 md:p-6">
                <h2 className="text-sm font-medium">Move to status</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                    {PROJECT_STATUSES.map((s) => (
                        <form key={s} action={setProjectStatusAction}>
                            <input type="hidden" name="id" value={proj.id} />
                            <input type="hidden" name="status" value={s} />
                            <Button
                                type="submit"
                                size="sm"
                                variant={proj.status === s ? "default" : "outline"}
                                disabled={proj.status === s}
                            >
                                {s.replace(/_/g, " ")}
                            </Button>
                        </form>
                    ))}
                </div>
            </section>

            {/* Tasks */}
            <section className="rounded-lg border bg-card p-4 md:p-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-medium">
                        Tasks{" "}
                        {total > 0 ? (
                            <span className="text-muted-foreground">
                                ({total - open}/{total} done)
                            </span>
                        ) : null}
                    </h2>
                </div>

                <form
                    action={addProjectTaskAction}
                    className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_auto_auto]"
                >
                    <input type="hidden" name="id" value={proj.id} />
                    <Input
                        name="title"
                        required
                        placeholder="e.g. Send wireframes for review"
                    />
                    <Select name="phase" defaultValue={proj.phase}>
                        <SelectTrigger className="h-11 md:w-44">
                            <SelectValue placeholder="Phase" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">— No phase —</SelectItem>
                            {PROJECT_PHASES.map((p) => (
                                <SelectItem key={p} value={p}>
                                    {p.replace(/_/g, " ")}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select name="assignee" defaultValue="none">
                        <SelectTrigger className="h-11 md:w-56">
                            <SelectValue placeholder="Assignee" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">— Unassigned —</SelectItem>
                            {activeTeam.map((m) => (
                                <SelectItem key={m.id} value={m.name}>
                                    {m.name} ({m.role})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button type="submit">Add task</Button>
                </form>

                {proj.tasks.length === 0 ? (
                    <p className="mt-4 text-sm text-muted-foreground">
                        No tasks yet.
                    </p>
                ) : (
                    <ul className="mt-4 divide-y">
                        {proj.tasks.map((t) => (
                            <li
                                key={t.id}
                                className="flex items-center gap-3 py-2 text-sm"
                            >
                                <form action={toggleProjectTaskAction}>
                                    <input type="hidden" name="id" value={proj.id} />
                                    <input type="hidden" name="taskId" value={t.id} />
                                    <Button
                                        type="submit"
                                        size="sm"
                                        variant={t.done ? "default" : "outline"}
                                        className="h-7 px-2 text-xs"
                                    >
                                        {t.done ? "Done" : "Mark done"}
                                    </Button>
                                </form>
                                <span
                                    className={`flex-1 ${t.done
                                        ? "text-muted-foreground line-through"
                                        : ""
                                        }`}
                                >
                                    {t.title}
                                    {t.phase ? (
                                        <span className="ml-2 inline-block rounded border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                                            {t.phase.replace(/_/g, " ")}
                                        </span>
                                    ) : null}
                                    {t.assignee ? (
                                        <span className="ml-2 text-xs text-muted-foreground">
                                            @{t.assignee}
                                        </span>
                                    ) : null}
                                </span>
                                <form action={deleteProjectTaskAction}>
                                    <input type="hidden" name="id" value={proj.id} />
                                    <input type="hidden" name="taskId" value={t.id} />
                                    <Button
                                        type="submit"
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-2 text-xs text-muted-foreground"
                                    >
                                        Remove
                                    </Button>
                                </form>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Invoices */}
            <section className="rounded-lg border bg-card p-4 md:p-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-medium">
                        Invoices{" "}
                        {invoices.length > 0 ? (
                            <span className="text-muted-foreground">
                                (paid MYR{" "}
                                {paid.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}{" "}
                                of{" "}
                                {billed.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}
                                )
                            </span>
                        ) : null}
                    </h2>
                    <Link
                        href="/invoices"
                        className="text-xs underline text-muted-foreground"
                    >
                        New invoice →
                    </Link>
                </div>
                {invoices.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                        No invoices linked to this project yet.
                    </p>
                ) : (
                    <ul className="mt-3 divide-y text-sm">
                        {invoices.map((i) => {
                            const t = computeTotals(i);
                            return (
                                <li
                                    key={i.id}
                                    className="flex items-center justify-between py-2"
                                >
                                    <Link
                                        href={`/invoices/${i.id}`}
                                        className="hover:underline"
                                    >
                                        {i.number}{" "}
                                        <span className="text-muted-foreground">
                                            · due {i.dueDate}
                                        </span>
                                    </Link>
                                    <div className="flex items-center gap-3">
                                        <span>
                                            MYR{" "}
                                            {t.total.toLocaleString(undefined, {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })}
                                        </span>
                                        <Badge variant="secondary">{i.status}</Badge>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            {/* Deliverables */}
            <section className="rounded-lg border bg-card p-4 md:p-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-medium">
                        Deliverables{" "}
                        {proj.deliverables.length > 0 ? (
                            <span className="text-muted-foreground">
                                ({approvedDeliverables.length}/
                                {proj.deliverables.length} approved)
                            </span>
                        ) : null}
                    </h2>
                </div>

                <form
                    action={addProjectDeliverableAction}
                    className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto_auto]"
                >
                    <input type="hidden" name="id" value={proj.id} />
                    <Input
                        name="title"
                        required
                        placeholder="e.g. Homepage v2 wireframes"
                    />
                    <Input
                        name="url"
                        type="url"
                        placeholder="Figma / drive / repo link"
                    />
                    <Select name="phase" defaultValue={proj.phase}>
                        <SelectTrigger className="h-11 md:w-44">
                            <SelectValue placeholder="Phase" />
                        </SelectTrigger>
                        <SelectContent>
                            {PROJECT_PHASES.map((p) => (
                                <SelectItem key={p} value={p}>
                                    {p.replace(/_/g, " ")}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button type="submit">Add</Button>
                </form>

                {proj.deliverables.length === 0 ? (
                    <p className="mt-4 text-sm text-muted-foreground">
                        No deliverables logged. Add design files, builds, or
                        anything that needs client signoff.
                    </p>
                ) : (
                    <div className="mt-4 space-y-4">
                        {pendingDeliverables.length > 0 ? (
                            <div>
                                <p className="text-xs font-semibold uppercase text-muted-foreground">
                                    Awaiting client approval
                                </p>
                                <ul className="mt-2 divide-y rounded-md border">
                                    {pendingDeliverables.map((d) => (
                                        <DeliverableRow
                                            key={d.id}
                                            projectId={proj.id}
                                            deliverable={d}
                                        />
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                        {approvedDeliverables.length > 0 ? (
                            <div>
                                <p className="text-xs font-semibold uppercase text-muted-foreground">
                                    Approved
                                </p>
                                <ul className="mt-2 divide-y rounded-md border">
                                    {approvedDeliverables.map((d) => (
                                        <DeliverableRow
                                            key={d.id}
                                            projectId={proj.id}
                                            deliverable={d}
                                        />
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                    </div>
                )}
            </section>

            {/* Signoff */}
            <section className="rounded-lg border bg-card p-4 md:p-6">
                <h2 className="text-sm font-medium">Final signoff</h2>
                {proj.signoff.signedAt ? (
                    <div className="mt-3 space-y-3 rounded-md border bg-muted/30 p-4 text-sm">
                        <p>
                            <span className="font-medium">Signed off by</span>{" "}
                            {proj.signoff.signedBy} on{" "}
                            {new Date(proj.signoff.signedAt).toLocaleString()}.
                        </p>
                        {proj.signoff.notes ? (
                            <p className="whitespace-pre-wrap text-muted-foreground">
                                {proj.signoff.notes}
                            </p>
                        ) : null}
                        <form action={clearSignoffAction}>
                            <input type="hidden" name="id" value={proj.id} />
                            <Button type="submit" size="sm" variant="ghost">
                                Clear signoff
                            </Button>
                        </form>
                    </div>
                ) : (
                    <form
                        action={signoffProjectAction}
                        className="mt-3 space-y-3"
                    >
                        <input type="hidden" name="id" value={proj.id} />
                        <p className="text-xs text-muted-foreground">
                            Marks the project as <strong>delivered</strong> and
                            phase <strong>closed</strong>. Use this once the
                            client has confirmed in writing.
                        </p>
                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label className="text-sm">Signed by</Label>
                                <Input
                                    name="signedBy"
                                    required
                                    placeholder="Client name / email / channel"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-sm">Notes</Label>
                                <Input
                                    name="notes"
                                    placeholder="e.g. confirmed via WhatsApp on..."
                                />
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <Button type="submit">Mark as signed off</Button>
                        </div>
                    </form>
                )}
            </section>

            {/* Edit details */}
            <form
                action={updateProjectAction}
                className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
            >
                <input type="hidden" name="id" value={proj.id} />
                <h2 className="text-sm font-medium">Details</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-sm">Project name</Label>
                        <Input name="name" defaultValue={proj.name} required />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Client</Label>
                        <Input
                            name="clientName"
                            defaultValue={proj.clientName}
                            required
                        />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-sm">Internal notes</Label>
                    <Textarea name="notes" defaultValue={proj.notes} rows={4} />
                </div>
                <div className="flex justify-end">
                    <Button type="submit">Save changes</Button>
                </div>
            </form>

            {/* Client portal share */}
            <section className="space-y-3 rounded-lg border bg-card p-4 md:p-6">
                <div>
                    <h2 className="text-sm font-medium">Client portal</h2>
                    <p className="text-xs text-muted-foreground">
                        Share a read-only link so the client can see project
                        progress, approved deliverables, and sign-off status.
                        No login required — anyone with the link can view.
                    </p>
                </div>
                {proj.portalToken ? (
                    <>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Portal URL</Label>
                            <Input
                                readOnly
                                value={`/p/${proj.portalToken}`}
                                className="font-mono text-xs"
                            />
                            <p className="text-xs text-muted-foreground">
                                Prefix with your domain when sharing (e.g.
                                https://app.nexovadmin.com/p/{proj.portalToken.slice(0, 8)}…).
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <a
                                href={`/p/${proj.portalToken}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex h-9 items-center rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent"
                            >
                                Open portal →
                            </a>
                            <form action={rotateProjectPortalTokenAction}>
                                <input
                                    type="hidden"
                                    name="id"
                                    value={proj.id}
                                />
                                <Button
                                    type="submit"
                                    size="sm"
                                    variant="outline"
                                >
                                    Regenerate link
                                </Button>
                            </form>
                            <form action={revokeProjectPortalTokenAction}>
                                <input
                                    type="hidden"
                                    name="id"
                                    value={proj.id}
                                />
                                <Button
                                    type="submit"
                                    size="sm"
                                    variant="destructive"
                                >
                                    Revoke
                                </Button>
                            </form>
                        </div>
                    </>
                ) : (
                    <form action={rotateProjectPortalTokenAction}>
                        <input type="hidden" name="id" value={proj.id} />
                        <Button type="submit" size="sm">
                            Generate portal link
                        </Button>
                    </form>
                )}
            </section>

            {/* Source + delete */}
            <section className="flex flex-col gap-3 rounded-lg border bg-card p-4 md:flex-row md:items-center md:justify-between md:p-6">
                <div className="text-sm">
                    {proj.onboardingSubmissionId ? (
                        <>
                            Source:{" "}
                            <Link
                                href={`/onboarding/${proj.onboardingSubmissionId}`}
                                className="underline"
                            >
                                onboarding submission
                            </Link>
                        </>
                    ) : (
                        <span className="text-muted-foreground">
                            Created directly (no onboarding link).
                        </span>
                    )}
                </div>
                <form action={deleteProjectAction}>
                    <input type="hidden" name="id" value={proj.id} />
                    <Button type="submit" variant="destructive">
                        Delete project
                    </Button>
                </form>
            </section>

            <HistoryPanel entity="project" entityId={proj.id} />

            <p className="text-xs text-muted-foreground">
                Created {new Date(proj.createdAt).toLocaleString()} · Last updated{" "}
                {new Date(proj.updatedAt).toLocaleString()}
            </p>
        </div>
    );
}

function DeliverableRow({
    projectId,
    deliverable,
}: {
    projectId: string;
    deliverable: {
        id: string;
        title: string;
        url: string;
        notes: string;
        phase: ProjectPhase;
        approvedAt: string | null;
        approvedBy: string;
    };
}) {
    const d = deliverable;
    return (
        <li className="flex flex-col gap-2 p-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    {d.url ? (
                        <a
                            href={d.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium underline"
                        >
                            {d.title}
                        </a>
                    ) : (
                        <span className="font-medium">{d.title}</span>
                    )}
                    <Badge variant="outline">{d.phase.replace(/_/g, " ")}</Badge>
                    {d.approvedAt ? (
                        <Badge>approved</Badge>
                    ) : (
                        <Badge variant="secondary">pending</Badge>
                    )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    {d.approvedAt ? (
                        <>
                            Approved by {d.approvedBy} on{" "}
                            {new Date(d.approvedAt).toLocaleDateString()}
                        </>
                    ) : (
                        <>Awaiting approval</>
                    )}
                    {d.notes ? <> · {d.notes}</> : null}
                </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {d.approvedAt ? (
                    <form action={unapproveDeliverableAction}>
                        <input type="hidden" name="id" value={projectId} />
                        <input
                            type="hidden"
                            name="deliverableId"
                            value={d.id}
                        />
                        <Button type="submit" size="sm" variant="ghost">
                            Unapprove
                        </Button>
                    </form>
                ) : (
                    <form
                        action={approveDeliverableAction}
                        className="flex items-center gap-2"
                    >
                        <input type="hidden" name="id" value={projectId} />
                        <input
                            type="hidden"
                            name="deliverableId"
                            value={d.id}
                        />
                        <Input
                            name="approvedBy"
                            placeholder="Approved by"
                            className="h-9 w-40"
                        />
                        <Button type="submit" size="sm">
                            Approve
                        </Button>
                    </form>
                )}
                <form action={deleteDeliverableAction}>
                    <input type="hidden" name="id" value={projectId} />
                    <input
                        type="hidden"
                        name="deliverableId"
                        value={d.id}
                    />
                    <Button
                        type="submit"
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground"
                    >
                        Remove
                    </Button>
                </form>
            </div>
        </li>
    );
}
