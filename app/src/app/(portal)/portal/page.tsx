import Link from "next/link";
import { CONTRACT_STAGE_LABEL, listContracts } from "@/lib/data/contracts";
import { listWorks, type Work } from "@/lib/data/works";
import { isOpen, nextDue, progress, todayKey } from "@/lib/works/helpers";
import { computeTotals, listInvoices } from "@/lib/data/invoices";
import { listContentPosts } from "@/lib/data/content";
import { listSubmissions } from "@/lib/data/onboarding";
import { listPublishedReports } from "@/lib/data/report-insights";
import {
    contractsOf,
    isDevBypass,
    portalHref,
    linkedContentIds,
    postsWaitingFor,
    resolveActingClient,
    tasksWaitingFor,
} from "@/lib/portal/resolve-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskApprovalCard } from "./approvals/task-approval-card";
import { fmtMyr } from "@/lib/format";

export const dynamic = "force-dynamic";

function fmtMonth(ym: string) {
    if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-MY", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    });
}
function fmtDate(ymd: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
    return new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-MY", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    });
}

/** Next open milestone by due date, else the next open task. */
function nextUp(tasks: Work[]): Work | undefined {
    return (
        tasks
            .filter((w) => isOpen(w) && w.milestone && w.dueDate)
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ??
        nextDue(tasks)
    );
}

export default async function PortalHomePage({
    searchParams,
}: {
    searchParams: Promise<{ client?: string }>;
}) {
    const { client: clientParam } = await searchParams;
    const acting = await resolveActingClient(clientParam);
    if (!acting) {
        return (
            <div className="space-y-2">
                <h1 className="text-2xl font-semibold">Welcome</h1>
                <p className="text-sm text-muted-foreground">
                    This account isn&apos;t linked to a client workspace yet —
                    contact your account manager.
                </p>
                {isDevBypass() ? (
                    <p className="text-xs text-muted-foreground">
                        Dev preview: add{" "}
                        <code>?client=&lt;client name&gt;</code> to the URL to
                        act as a client.
                    </p>
                ) : null}
            </div>
        );
    }

    const { client, preview } = acting;
    const clientField = preview ? client.name : null;
    const href = (path: string) => portalHref(path, acting);
    const name = client.name.trim().toLowerCase();
    const today = todayKey();
    const [contracts, works, invoices, posts, submissions, reports] =
        await Promise.all([
            listContracts(),
            listWorks(),
            listInvoices(),
            listContentPosts(),
            listSubmissions(),
            listPublishedReports(client.name),
        ]);

    const myContracts = contractsOf(contracts, client);
    const contractName = new Map(myContracts.map((c) => [c.id, c.name]));
    const waitingTasks = tasksWaitingFor(works, myContracts);
    const waitingPosts = postsWaitingFor(posts, client, linkedContentIds(waitingTasks));
    const pendingForms = submissions.filter(
        (s) =>
            s.clientName.trim().toLowerCase() === name &&
            s.status !== "submitted",
    );
    const waitingCount =
        waitingTasks.length + waitingPosts.length + pendingForms.length;

    // Live projects only — completed and cancelled ones are history, not a
    // home-screen card.
    const liveContracts = myContracts
        .filter((c) => c.status === "active" || c.status === "draft")
        .map((c) => {
            const tasks = works.filter((w) => w.contractId === c.id);
            const phases = c.phases.map((ph) => {
                const inPhase = tasks.filter(
                    (w) => w.phaseKey === ph.key || w.phaseName === ph.name,
                );
                return { key: ph.key, name: ph.name, pct: progress(inPhase).pct };
            });
            return {
                contract: c,
                progress: progress(tasks),
                phases,
                nowPhase: nextDue(tasks)?.phaseName ?? "",
                next: nextUp(tasks),
            };
        });

    const openInvoices = invoices.filter(
        (i) =>
            i.clientName.trim().toLowerCase() === name &&
            (i.status === "sent" || i.status === "overdue"),
    );
    const openTotal = openInvoices.reduce(
        (sum, i) => sum + computeTotals(i).total,
        0,
    );
    const latestReport = reports.reduce<(typeof reports)[number] | null>(
        (best, r) => (!best || r.month > best.month ? r : best),
        null,
    );

    return (
        <div className="space-y-6">
            <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {client.name}
                </p>
                <h1 className="text-2xl font-semibold">Welcome</h1>
            </div>

            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-medium">Your turn</h2>
                    {waitingTasks.length + waitingPosts.length > 0 ? (
                        <Link
                            href={href("/portal/approvals")}
                            className="text-xs text-primary"
                        >
                            All approvals →
                        </Link>
                    ) : null}
                </div>

                {waitingCount === 0 ? (
                    <Card>
                        <CardContent className="py-4 text-sm text-muted-foreground">
                            Nothing waiting for you — your team is on it.
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        {waitingTasks.map((t) => (
                            <TaskApprovalCard
                                key={t.id}
                                task={t}
                                contractName={contractName.get(t.contractId) ?? ""}
                                today={today}
                                clientField={clientField}
                            />
                        ))}

                        {waitingPosts.map((p) => (
                            <Link
                                key={p.id}
                                href={href(`/portal/content?month=${p.planMonth}`)}
                                className="block"
                            >
                                <Card className="border-primary/40 bg-primary/5 transition hover:border-primary/60">
                                    <CardContent className="flex items-center justify-between gap-2 py-3 text-sm">
                                        <span>
                                            <span className="font-medium">
                                                {p.title}
                                            </span>
                                            <span className="block text-xs text-muted-foreground">
                                                Content · {fmtMonth(p.planMonth)} ·
                                                your review
                                            </span>
                                        </span>
                                        <span className="shrink-0 text-xs text-primary">
                                            Review →
                                        </span>
                                    </CardContent>
                                </Card>
                            </Link>
                        ))}

                        {pendingForms.length > 0 ? (
                            <Link href={href("/portal/onboarding")} className="block">
                                <Card className="border-primary/40 bg-primary/5">
                                    <CardContent className="py-3 text-sm">
                                        <strong>{pendingForms.length}</strong>{" "}
                                        onboarding form
                                        {pendingForms.length === 1 ? "" : "s"} to
                                        complete →
                                    </CardContent>
                                </Card>
                            </Link>
                        ) : null}
                    </>
                )}
            </section>

            {liveContracts.length > 0 ? (
                <section className="space-y-3">
                    <h2 className="text-sm font-medium">Your projects</h2>
                    {liveContracts.map(
                        ({ contract: c, progress: p, phases, nowPhase, next }) => (
                            <Card key={c.id}>
                                <CardHeader className="pb-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <CardTitle className="text-sm">
                                            {c.name}
                                        </CardTitle>
                                        <Badge variant="outline">
                                            {CONTRACT_STAGE_LABEL[c.stage]}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm">
                                    {p.total > 0 ? (
                                        <>
                                            {phases.length > 0 ? (
                                                <div
                                                    className="flex gap-1"
                                                    aria-label={`Phases: ${phases.map((ph) => ph.name).join(", ")}`}
                                                >
                                                    {phases.map((ph) => (
                                                        <div
                                                            key={ph.key}
                                                            title={`${ph.name} · ${ph.pct}%`}
                                                            className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                                                        >
                                                            <div
                                                                className="h-full rounded-full bg-primary"
                                                                style={{ width: `${ph.pct}%` }}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                                    <div
                                                        className="h-full rounded-full bg-primary"
                                                        style={{ width: `${p.pct}%` }}
                                                    />
                                                </div>
                                            )}
                                            <p className="text-xs text-muted-foreground">
                                                {p.done}/{p.total} tasks done
                                                {p.done === p.total
                                                    ? " · all done"
                                                    : ""}
                                            </p>
                                            {nowPhase ? (
                                                <p className="text-xs">
                                                    <span className="text-muted-foreground">
                                                        Now:
                                                    </span>{" "}
                                                    {nowPhase}
                                                </p>
                                            ) : null}
                                            {next ? (
                                                <p className="text-xs">
                                                    <span className="text-muted-foreground">
                                                        {next.milestone
                                                            ? "Next milestone:"
                                                            : "Next up:"}
                                                    </span>{" "}
                                                    {next.title} ·{" "}
                                                    {fmtDate(next.dueDate)}
                                                </p>
                                            ) : null}
                                        </>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">
                                            Kicking off soon.
                                        </p>
                                    )}
                                </CardContent>
                            </Card>
                        ),
                    )}
                </section>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
                <Link href={href("/portal/billing")} className="block">
                    <Card className="h-full">
                        <CardHeader className="pb-1">
                            <CardTitle className="text-sm">Billing</CardTitle>
                        </CardHeader>
                        <CardContent className="text-xs text-muted-foreground">
                            {openInvoices.length > 0
                                ? `${fmtMyr(openTotal)} open (${openInvoices.length})`
                                : "Nothing outstanding"}
                        </CardContent>
                    </Card>
                </Link>
                <Link
                    href={href(
                        latestReport
                            ? `/portal/reports/${latestReport.month}`
                            : "/portal/reports",
                    )}
                    className="block"
                >
                    <Card className="h-full">
                        <CardHeader className="pb-1">
                            <CardTitle className="text-sm">Latest report</CardTitle>
                        </CardHeader>
                        <CardContent className="text-xs text-muted-foreground">
                            {latestReport
                                ? `${fmtMonth(latestReport.month)} →`
                                : "None published yet"}
                        </CardContent>
                    </Card>
                </Link>
            </div>
        </div>
    );
}
