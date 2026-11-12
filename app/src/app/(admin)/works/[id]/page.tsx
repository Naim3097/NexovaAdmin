import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getActingMember, getCurrentTeamMember, requireTeamAccess } from "@/lib/auth";
import { getWorkById } from "@/lib/data/works";
import { getContractById } from "@/lib/data/contracts";
import { listTeamMembers } from "@/lib/data/team";
import { APPROVERS, APPROVER_LABEL, SEATS, SEAT_LABEL } from "@/lib/data/planners";
import { HOUR_STEP, fmtHours, shareHours, taskHours } from "@/lib/capacity/helpers";
import { isAdjusted, monthLabel, pendingFrom, splitTotal, todayKey } from "@/lib/works/helpers";
import {
    completeWorkAction,
    deleteWorkAction,
    reopenWorkAction,
    reviewWorkAction,
    setDueAction,
    setSplitAction,
    startWorkAction,
    submitWorkAction,
    updateWorkAction,
} from "@/lib/works/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HistoryPanel } from "@/components/history-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PendingButton } from "@/components/pending-button";
import { SaveButton } from "@/components/save-button";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ActingAs, ApproverBadge, DueLabel, TaskStatusBadge, TypeBadge } from "../ui";

export const dynamic = "force-dynamic";

const LINKED_PATH = { content: "/content", campaign: "/campaigns", seo: "/seo" } as const;
const LINKED_LABEL = { content: "Open the post", campaign: "Open the campaign", seo: "Open the article" } as const;

/** "2026-11-02 14:05" from an ISO stamp. */
function stamp(iso: string | null): string {
    return iso ? iso.slice(0, 16).replace("T", " ") : "";
}

export default async function WorkDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ as?: string }>;
}) {
    await requireTeamAccess();
    const { id } = await params;
    const sp = await searchParams;
    const [w, team, linked, member] = await Promise.all([
        getWorkById(id),
        listTeamMembers(),
        getCurrentTeamMember(),
        getActingMember((sp.as ?? "").trim() || undefined),
    ]);
    if (!w) notFound();
    const contract = await getContractById(w.contractId);

    const today = todayKey();
    const activeTeam = team.filter((m) => m.active);
    // The acting member: the linked login wins; otherwise the `?as=` pick (DEV_AUTH_BYPASS), else the acting-as cookie.
    const as = linked ? "" : (sp.as ?? "").trim();
    const actor = member?.name ?? as;
    const asField = as ? <input type="hidden" name="as" value={as} /> : null;
    const asQ = as ? `?as=${encodeURIComponent(as)}` : "";

    // Every team member may open every task; My tasks is the personal slice.
    const isAm = !actor || actor === w.accountManager;
    const mine = Boolean(actor) && w.split.some((s) => s.member === actor);
    const open = w.status !== "completed";
    const total = splitTotal(w.split);
    const adjusted = isAdjusted(w);
    const myHours = mine ? shareHours(w, actor) : 0;

    // Four split rows: the current shares, then empty rows.
    const rows = [0, 1, 2, 3].map((i) => w.split[i] ?? null);
    // Active team, plus anyone already holding a share who has since gone inactive.
    const memberOptions = [
        ...activeTeam.map((m) => ({ name: m.name, role: m.role as string })),
        ...w.split
            .map((s) => s.member)
            .filter((n) => n && !activeTeam.some((m) => m.name === n))
            .map((n) => ({ name: n, role: "inactive" })),
    ];

    return (
        <div className="space-y-6">
            <div>
                <Link href={`/works${asQ}`} className="text-sm text-muted-foreground hover:underline">
                    Back to deliverables
                </Link>
                <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <h1 className="text-2xl font-semibold md:text-3xl">
                        {w.title}
                        {w.milestone ? (
                            <span title="Milestone" className="ml-2 text-amber-500">
                                ◆
                            </span>
                        ) : null}
                    </h1>
                    <div className="flex flex-wrap items-center gap-2">
                        <TypeBadge type={w.type} />
                        <TaskStatusBadge status={w.status} />
                        <ApproverBadge approver={w.approver} />
                        {w.milestone ? (
                            <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">
                                Milestone
                            </Badge>
                        ) : null}
                    </div>
                </div>
                <p className="text-sm text-muted-foreground">
                    {w.clientName}
                    {" · "}
                    <Link href={`/projects/${w.contractId}#works`} className="underline">
                        {contract ? `${contract.code} · ${contract.name}` : "account"}
                    </Link>
                    {" · "}
                    {monthLabel(w.month)}
                    {w.phaseName ? ` · ${w.phaseName}` : ""}
                    {w.channel ? ` · ${w.channel}` : ""}
                    {" · "}Account manager <span className="font-medium text-foreground">{w.accountManager || "—"}</span>
                    {" · "}
                    <span className="font-medium text-foreground tabular-nums" title="Planned working hours across everyone on it">
                        {fmtHours(taskHours(w))}
                    </span>{" "}
                    planned
                </p>
                {w.plannerLineId || w.addendumVersion > 0 ? (
                    <p className="text-xs text-muted-foreground">
                        {w.plannerLineId ? "From a proposal line" : ""}
                        {w.plannerLineId && w.addendumVersion > 0 ? " · " : ""}
                        {w.addendumVersion > 0 ? `added by addendum v${w.addendumVersion}` : ""}
                    </p>
                ) : null}
                {w.notes ? <p className="mt-1 whitespace-pre-line text-sm">{w.notes}</p> : null}
                <div className="mt-2">
                    <ActingAs
                        members={activeTeam}
                        current={actor}
                        linkedMember={linked?.name ?? null}
                        makeHref={(n) => `/works/${w.id}?as=${encodeURIComponent(n)}`}
                    />
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                {/* Who */}
                <section className="rounded-lg border bg-card p-4 md:p-6">
                    <h2 className="text-sm font-medium">Who</h2>
                    <p className="text-xs text-muted-foreground">Responsibility split across the team. Must add up to 100%.</p>
                    <form action={setSplitAction} className="mt-3 space-y-2">
                        <input type="hidden" name="id" value={w.id} />
                        {asField}
                        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_4.5rem_5rem] gap-2 text-[11px] text-muted-foreground">
                            <span>Seat</span>
                            <span>Person</span>
                            <span>%</span>
                            <span>hours</span>
                        </div>
                        {rows.map((row, i) => {
                            const n = i + 1;
                            return (
                                <div key={n} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_4.5rem_5rem] gap-2">
                                    <Select name={`seat_${n}`} defaultValue={row?.seat ?? "none"}>
                                        <SelectTrigger size="sm" className="w-full text-xs">
                                            <SelectValue placeholder="Seat" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">— seat —</SelectItem>
                                            {SEATS.map((s) => (
                                                <SelectItem key={s} value={s}>
                                                    {SEAT_LABEL[s]}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Select name={`member_${n}`} defaultValue={row?.member || "none"}>
                                        <SelectTrigger size="sm" className="w-full text-xs">
                                            <SelectValue placeholder="Person" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">— unassigned —</SelectItem>
                                            {memberOptions.map((m) => (
                                                <SelectItem key={m.name} value={m.name}>
                                                    {m.name} ({m.role})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Input
                                        name={`pct_${n}`}
                                        type="number"
                                        min={0}
                                        max={100}
                                        step={1}
                                        defaultValue={row ? row.pct : ""}
                                        placeholder="%"
                                        className="h-8 text-xs"
                                    />
                                    <Input
                                        name={`hours_${n}`}
                                        type="number"
                                        min={0}
                                        step={HOUR_STEP}
                                        defaultValue={row?.hours ? row.hours : ""}
                                        placeholder="h"
                                        aria-label="hours"
                                        title="Working time this person plans for the task"
                                        className="h-8 text-xs"
                                    />
                                </div>
                            );
                        })}
                        <p className="text-[11px] text-muted-foreground">
                            Hours: working time only — not waiting or approval. Prefilled from your profile; change it if this one ran longer.
                        </p>
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            <span className={cn("text-xs", total === 100 ? "text-muted-foreground" : "font-medium text-red-600 dark:text-red-400")}>
                                Current total {total}%{total === 100 ? "" : " — must add up to 100%"}
                            </span>
                            <SaveButton label="Save split" />
                        </div>
                    </form>
                    <p className="mt-3 text-[11px] text-muted-foreground">Everyone named here sees the task under My tasks as soon as it is saved.</p>
                </section>

                {/* When */}
                <section className="rounded-lg border bg-card p-4 md:p-6">
                    <h2 className="text-sm font-medium">When</h2>
                    <p className="text-xs text-muted-foreground">
                        {monthLabel(w.month)}
                        {w.phaseName ? ` · ${w.phaseName}` : ""}. The account manager sets the date; the planner date stays for reference.
                    </p>
                    <div className="mt-3">
                        <DueLabel due={w.dueDate} status={w.status} today={today} adjusted={adjusted} defaultDue={w.defaultDueDate} />
                    </div>
                    {adjusted ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                            planner date {w.defaultDueDate}
                            {w.adjustedBy ? ` · moved by ${w.adjustedBy}` : ""}
                            {w.adjustedAt ? ` on ${stamp(w.adjustedAt)}` : ""}
                        </p>
                    ) : null}
                    <form action={setDueAction} className="mt-3 space-y-2">
                        <input type="hidden" name="id" value={w.id} />
                        {asField}
                        <div className="space-y-1">
                            <Label className="text-xs">Due date</Label>
                            <Input name="dueDate" type="date" defaultValue={w.dueDate} required className="h-9" />
                        </div>
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            <input type="checkbox" name="shiftLater" value="1" defaultChecked className="size-3.5" />
                            move later tasks this month too
                        </label>
                        <Button type="submit" size="sm" variant="outline">
                            Set date
                        </Button>
                    </form>
                </section>

                {/* Status */}
                <section className="rounded-lg border bg-card p-4 md:p-6">
                    <div className="flex items-center justify-between gap-2">
                        <h2 className="text-sm font-medium">Status</h2>
                        <TaskStatusBadge status={w.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Anyone with a share moves it to In progress and submits it; the account manager (or the client through them)
                        completes it.
                    </p>
                    {open ? (
                        <p className="mt-1 text-xs">
                            Pending from <span className="font-medium">{pendingFrom(w) || "—"}</span>
                        </p>
                    ) : null}

                    <div className="mt-3 space-y-3">
                        {w.status === "not_started" ? (
                            <form action={startWorkAction}>
                                <input type="hidden" name="id" value={w.id} />
                                {asField}
                                <Button type="submit" size="sm" variant={mine ? "default" : "outline"}>
                                    Start
                                </Button>
                            </form>
                        ) : null}
                        {w.status === "not_started" || w.status === "in_progress" ? (
                            <form action={submitWorkAction} className="space-y-2">
                                <input type="hidden" name="id" value={w.id} />
                                {asField}
                                <Input name="url" type="url" placeholder="link to the work" className="h-9" />
                                <Input name="note" placeholder={w.approver === "none" ? "note" : "note for the approver"} className="h-9" />
                                <Button type="submit" size="sm" variant={mine && w.status === "in_progress" ? "default" : "outline"}>
                                    {w.approver === "none" ? "Mark done" : "Submit for approval"}
                                </Button>
                            </form>
                        ) : null}
                        {mine && total === 100 ? (
                            /* Only my hours are editable; every other share is re-posted as it stands. */
                            <form action={setSplitAction} className="rounded-md border border-dashed p-2">
                                <input type="hidden" name="id" value={w.id} />
                                {asField}
                                <div className="flex flex-wrap items-center gap-2">
                                    {w.split.map((s, i) => {
                                        const n = i + 1;
                                        return (
                                            <Fragment key={n}>
                                                <input type="hidden" name={`seat_${n}`} value={s.seat} />
                                                <input type="hidden" name={`member_${n}`} value={s.member} />
                                                <input type="hidden" name={`pct_${n}`} value={s.pct} />
                                                {s.member === actor ? (
                                                    <label className="flex items-center gap-1.5 text-xs">
                                                        Took
                                                        <Input
                                                            name={`hours_${n}`}
                                                            type="number"
                                                            min={0}
                                                            step={HOUR_STEP}
                                                            defaultValue={s.hours ? s.hours : ""}
                                                            className="h-8 w-20 text-xs"
                                                        />
                                                        h
                                                    </label>
                                                ) : (
                                                    <input type="hidden" name={`hours_${n}`} value={s.hours} />
                                                )}
                                            </Fragment>
                                        );
                                    })}
                                    <PendingButton size="sm" variant="outline" pendingLabel="Saving…">
                                        Update my hours
                                    </PendingButton>
                                </div>
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                    Your working time on this task ({fmtHours(myHours)} now), prefilled from your profile — change it if it ran longer.
                                    Not a timesheet: waiting and approval do not count.
                                </p>
                            </form>
                        ) : null}
                        {w.status === "pending_approval" ? (
                            <form action={reviewWorkAction} className="space-y-2">
                                <input type="hidden" name="id" value={w.id} />
                                {asField}
                                <Textarea name="note" rows={2} placeholder={w.approver === "client" ? "the client's feedback" : "note"} />
                                <div className="flex flex-wrap gap-2">
                                    <Button type="submit" name="decision" value="approve" size="sm" variant={isAm ? "default" : "outline"}>
                                        {w.approver === "client"
                                            ? `Client approved (via ${w.accountManager || "AM"})`
                                            : `Approve as ${w.accountManager || "account manager"}`}
                                    </Button>
                                    <Button type="submit" name="decision" value="changes" size="sm" variant="outline">
                                        Request changes
                                    </Button>
                                </div>
                            </form>
                        ) : null}
                        <div className="flex flex-wrap gap-2 border-t pt-3">
                            {w.status !== "not_started" ? (
                                <form action={reopenWorkAction}>
                                    <input type="hidden" name="id" value={w.id} />
                                    {asField}
                                    <Button type="submit" size="sm" variant="ghost">
                                        Reopen
                                    </Button>
                                </form>
                            ) : null}
                            {open ? (
                                <form action={completeWorkAction}>
                                    <input type="hidden" name="id" value={w.id} />
                                    {asField}
                                    <Button
                                        type="submit"
                                        size="sm"
                                        variant="ghost"
                                        className="text-muted-foreground"
                                        title="Account manager: mark done regardless of where it is"
                                    >
                                        Force complete
                                    </Button>
                                </form>
                            ) : null}
                        </div>
                    </div>

                    {w.startedAt || w.submittedAt || w.review.decision || w.completedAt ? (
                        <ul className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
                            {w.startedAt ? <li>Started {stamp(w.startedAt)}</li> : null}
                            {w.submittedAt ? (
                                <li>
                                    Submitted {stamp(w.submittedAt)}
                                    {w.submission.url ? (
                                        <>
                                            {" · "}
                                            <a href={w.submission.url} target="_blank" rel="noreferrer" className="underline">
                                                link
                                            </a>
                                        </>
                                    ) : null}
                                    {w.submission.note ? ` — ${w.submission.note}` : ""}
                                </li>
                            ) : null}
                            {w.review.decision ? (
                                <li className={w.review.decision === "changes" ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}>
                                    {w.review.decision === "approved" ? "Approved" : "Changes requested"} by {w.review.by || "—"}
                                    {w.review.at ? ` on ${stamp(w.review.at)}` : ""}
                                    {w.review.note ? ` — ${w.review.note}` : ""}
                                </li>
                            ) : null}
                            {w.completedAt ? <li>Completed {stamp(w.completedAt)}</li> : null}
                        </ul>
                    ) : null}
                </section>
            </div>

            {/* Where the work is done */}
            <section className="rounded-lg border bg-card p-4 md:p-6">
                <h2 className="text-sm font-medium">Where the work is done</h2>
                {w.linked ? (
                    <p className="mt-1 text-sm">
                        <Link href={`${LINKED_PATH[w.linked.kind]}/${w.linked.id}`} className="font-medium underline">
                            {LINKED_LABEL[w.linked.kind]}
                        </Link>
                        <span className="text-muted-foreground"> — this task tracks it under the account; drafting, review and publishing happen there.</span>
                    </p>
                ) : (
                    <p className="mt-1 text-sm text-muted-foreground">This task is the work item itself.</p>
                )}
            </section>

            {/* Details + danger zone */}
            <details className="rounded-lg border bg-card p-4 md:p-6">
                <summary className="cursor-pointer text-sm font-medium">Details</summary>
                <form action={updateWorkAction} className="mt-3 grid gap-3 md:grid-cols-3">
                    <input type="hidden" name="id" value={w.id} />
                    {asField}
                    <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-xs">Title</Label>
                        <Input name="title" defaultValue={w.title} required />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Channel</Label>
                        <Input name="channel" defaultValue={w.channel} placeholder="Instagram, Google Ads, Website…" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Month</Label>
                        <Input name="month" type="month" defaultValue={w.month} />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Phase</Label>
                        <Input name="phaseName" defaultValue={w.phaseName} placeholder="Kickoff, Production…" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Approval</Label>
                        <Select name="approver" defaultValue={w.approver}>
                            <SelectTrigger className="h-10 w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {APPROVERS.map((a) => (
                                    <SelectItem key={a} value={a}>
                                        {APPROVER_LABEL[a]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <label className="flex items-center gap-2 text-sm md:col-span-3">
                        {/* The checkbox comes first so a tick wins; the hidden "0" lets an untick save. */}
                        <input type="checkbox" name="milestone" value="1" defaultChecked={w.milestone} className="size-4" />
                        <input type="hidden" name="milestone" value="0" />
                        Milestone — shown as ◆ on the timeline
                    </label>
                    <div className="space-y-1.5 md:col-span-3">
                        <Label className="text-xs">Notes</Label>
                        <Textarea name="notes" rows={2} defaultValue={w.notes} />
                    </div>
                    <div className="flex items-center justify-end md:col-span-3">
                        <SaveButton />
                    </div>
                </form>
                <form action={deleteWorkAction} className="mt-2">
                    <input type="hidden" name="id" value={w.id} />
                    {asField}
                    <Button type="submit" variant="ghost" size="sm" className="text-destructive">
                        Delete task
                    </Button>
                </form>
            </details>

            <HistoryPanel entity="work" entityId={w.id} />
        </div>
    );
}
