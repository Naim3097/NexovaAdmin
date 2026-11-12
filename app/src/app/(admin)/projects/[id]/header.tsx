/**
 * Project page header: name, the one stage chip, who/when, the health strip
 * ("15/77 tasks · 4 overdue · 4 in review · next milestone … · next invoice …"),
 * the everyday actions (Agreement, Mark signed / Approve, New task, which
 * opens the add dialog on this project for its account manager, management
 * and the people already on it) and the tab row.
 * Always visible above the tabs. Tasks are visible to their owners as soon as
 * they exist, so there is nothing to "brief".
 * An internal project gets no Contract tab and no "missing info" chip (it has
 * no contract to sign and no invoices).
 */
import Link from "next/link";
import { computeTotals } from "@/lib/data/invoices";
import { nextDue } from "@/lib/works/helpers";
import { emptyFilter, type WorkFilter } from "@/lib/works/filter";
import { acceptHandoverAction, setStageAction } from "@/lib/contracts/actions";
import { CONTRACT_ENDING_SOON_DAYS } from "@/lib/contracts/helpers";
import { fmtMyrShort } from "@/lib/format";
import { ActingAs } from "@/app/(admin)/works/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PendingButton } from "@/components/pending-button";
import { NewTaskButton } from "@/components/new-task-dialog";
import { cn } from "@/lib/utils";
import { StageBadge, requirementsLabel } from "../ui";
import { TABS, type ContractView } from "./shared";

const TAB_LINK = "rounded-md border px-2.5 py-1";
const TAB_ACTIVE = "border-primary bg-primary/10 font-medium text-primary";

export function ContractHeader({ v }: { v: ContractView }) {
    const { c, client, today, cWorks, p, overdueCount, urgent, linkedInvoices, ended, endsIn, tab, tabHref, href, asField, requirements, handover, isHandoverTarget } = v;
    const inReview = cWorks.filter((w) => w.status === "pending_approval").length;
    const nextMilestone = nextDue(cWorks.filter((w) => w.milestone));
    // Earliest unpaid invoice on the project (void ones are already out).
    const nextInvoice = [...linkedInvoices].filter((i) => i.status !== "paid").sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    const invoiceOverdue = Boolean(nextInvoice) && (nextInvoice.status === "overdue" || (nextInvoice.status === "sent" && nextInvoice.dueDate < today));
    /** The Tasks list view, filtered to exactly this. */
    const listOf = (extra: Partial<WorkFilter>) => href({ view: "list", wm: undefined, cm: undefined }, { ...emptyFilter(), ...extra });
    const reqs = requirementsLabel(requirements);

    return (
        <header className="rounded-lg border bg-card p-4 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <Link href={`/projects${v.asQ}`} className="text-sm text-muted-foreground hover:underline">
                    Back to projects
                </Link>
                <div className="text-right">
                    <ActingAs members={v.activeTeam} current={v.actor} linkedMember={v.linked?.name ?? null} makeHref={(n) => tabHref(tab, { as: n })} />
                </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold md:text-3xl">{c.name}</h1>
                <StageBadge stage={c.stage} status={c.status} internal={v.internal} />
                {v.internal ? <Badge variant="outline">internal</Badge> : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
                {c.code} ·{" "}
                {reqs ? (
                    <Link href={tabHref("plan", {}, "#requirements")} className="hover:underline">
                        {reqs}
                    </Link>
                ) : (
                    <Link href={tabHref("plan", {}, "#requirements")} className="text-amber-700 underline dark:text-amber-400">
                        no scope set
                    </Link>
                )}
                {c.valueMyr ? (
                    <>
                        {" · "}
                        <Link href={tabHref("money")} className="tabular-nums hover:underline">
                            {fmtMyrShort(c.valueMyr)}
                        </Link>
                    </>
                ) : null}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
                <Link href={tabHref("client")} className={cn("font-medium text-foreground underline", !client && "no-underline")}>
                    {c.clientName}
                </Link>
                {" · "}
                <span className="text-foreground">{c.accountManager || "no account manager"}</span>
                {" · "}
                <span className="tabular-nums">
                    {c.startDate || "—"}
                    {c.endDate ? ` → ${c.endDate}` : " → open-ended"}
                </span>
                {ended !== null ? <span className="text-red-600 dark:text-red-400"> · ended {ended}d ago</span> : null}
                {endsIn !== null && endsIn <= CONTRACT_ENDING_SOON_DAYS ? <span className="text-amber-700 dark:text-amber-400"> · ends in {endsIn}d</span> : null}
            </p>

            {/* Health strip */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                <Link href={listOf({})}>
                    <Badge variant="outline" className="tabular-nums">
                        {p.done}/{p.total} tasks
                    </Badge>
                </Link>
                <Link href={listOf({ overdue: true })}>
                    <Badge variant={overdueCount > 0 ? "destructive" : "outline"} className="tabular-nums">
                        {overdueCount} overdue
                    </Badge>
                </Link>
                <Link href={listOf({ status: "pending_approval" })}>
                    <Badge variant="outline" className="tabular-nums">
                        {inReview} in review
                    </Badge>
                </Link>
                {nextMilestone ? (
                    <Link href={`/works/${nextMilestone.id}${v.asQ}`}>
                        <Badge variant="outline" className="border-amber-500/40 tabular-nums text-amber-700 dark:text-amber-400">
                            ◆ next milestone {nextMilestone.dueDate} · {nextMilestone.title}
                        </Badge>
                    </Link>
                ) : null}
                {nextInvoice ? (
                    <Link href={`/invoices/${nextInvoice.id}`}>
                        <Badge variant={invoiceOverdue ? "destructive" : "outline"} className="tabular-nums">
                            next invoice {nextInvoice.number} · {fmtMyrShort(computeTotals(nextInvoice).total)} · due {nextInvoice.dueDate}
                            {invoiceOverdue ? " · overdue" : ""}
                        </Badge>
                    </Link>
                ) : null}
                {urgent.length > 0 && !v.internal ? (
                    <Link href={tabHref("money", {}, "#terms")}>
                        <Badge className="bg-amber-500/15 tabular-nums text-amber-700 dark:text-amber-400">missing info · {urgent.length}</Badge>
                    </Link>
                ) : null}
                {handover ? (
                    <Link href={tabHref("setup", {}, "#account-manager")} title={`${handover.by || c.accountManager} asked ${handover.to} to take over · ${handover.at.slice(0, 10)}`}>
                        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">transfer to {handover.to} pending</Badge>
                    </Link>
                ) : null}
            </div>

            {/* Tabs + the everyday actions */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                <nav aria-label="Project sections" className="flex flex-wrap items-center gap-1 text-xs">
                    {TABS.filter((t) => !v.internal || t.key !== "money").map((t) => (
                        <Link key={t.key} href={tabHref(t.key)} aria-current={tab === t.key ? "page" : undefined} className={cn(TAB_LINK, tab === t.key ? TAB_ACTIVE : "hover:bg-accent")}>
                            {t.label}
                        </Link>
                    ))}
                </nav>
                <div className="flex flex-wrap items-center gap-2">
                    {handover && isHandoverTarget ? (
                        <form action={acceptHandoverAction} title={`Become account manager of ${c.name} — asked by ${handover.by || c.accountManager}`}>
                            <input type="hidden" name="id" value={c.id} />
                            {asField}
                            <PendingButton size="sm" pendingLabel="Accepting…">
                                Accept transfer
                            </PendingButton>
                        </form>
                    ) : null}
                    {!v.internal ? (
                        <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/projects/${c.id}/document${v.asQ}`} />}>
                            Agreement
                        </Button>
                    ) : null}
                    {!v.signed ? (
                        <form action={setStageAction} title={v.internal ? "Management approves the brief: tasks are generated from the scope" : "The client signed: tasks are generated from the scope"}>
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="stage" value="signed" />
                            {asField}
                            <PendingButton size="sm" pendingLabel={v.internal ? "Approving…" : "Signing…"} disabled={requirements.length === 0}>
                                {v.internal ? "Approve" : "Mark signed"}
                            </PendingButton>
                        </form>
                    ) : null}
                    {/* Tasks are added here, on the project: its AM, management and the people already on it. */}
                    {v.canAddTask ? <NewTaskButton project={v.newTaskProject} members={v.memberNames} today={today} asParam={v.asParam} /> : null}
                </div>
            </div>
        </header>
    );
}
