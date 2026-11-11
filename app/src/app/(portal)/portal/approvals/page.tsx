import Link from "next/link";
import { listContracts } from "@/lib/data/contracts";
import { listWorks } from "@/lib/data/works";
import { listContentPosts } from "@/lib/data/content";
import { todayKey } from "@/lib/works/helpers";
import {
    contractsOf,
    isDevBypass,
    portalHref,
    linkedContentIds,
    postsWaitingFor,
    recentlyReviewed,
    resolveActingClient,
    tasksWaitingFor,
} from "@/lib/portal/resolve-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TaskApprovalCard } from "./task-approval-card";

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
function fmtWhen(iso: string | null) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-MY", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

export default async function PortalApprovalsPage({
    searchParams,
}: {
    searchParams: Promise<{ client?: string }>;
}) {
    const { client: clientParam } = await searchParams;
    const acting = await resolveActingClient(clientParam);
    if (!acting) {
        return (
            <div className="space-y-2">
                <h1 className="text-2xl font-semibold">Approvals</h1>
                <p className="text-sm text-muted-foreground">
                    This account isn&apos;t linked to a client workspace yet.
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
    const today = todayKey();
    const [contracts, works, posts] = await Promise.all([
        listContracts(),
        listWorks(),
        listContentPosts(),
    ]);

    const myContracts = contractsOf(contracts, client);
    const contractName = new Map(myContracts.map((c) => [c.id, c.name]));
    const waitingTasks = tasksWaitingFor(works, myContracts);
    const waitingPosts = postsWaitingFor(posts, client, linkedContentIds(waitingTasks));
    const waitingCount = waitingTasks.length + waitingPosts.length;
    const reviewed = recentlyReviewed(works, myContracts, 10);

    return (
        <div className="space-y-6">
            <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {client.name}
                </p>
                <h1 className="text-2xl font-semibold">Approvals</h1>
                <p className="text-sm text-muted-foreground">
                    {waitingCount > 0
                        ? `${waitingCount} item${waitingCount === 1 ? "" : "s"} waiting for you.`
                        : "Nothing waiting for you — your team is on it."}
                </p>
            </div>

            {waitingCount > 0 ? (
                <section className="space-y-3">
                    <h2 className="text-sm font-medium">Your turn</h2>
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
                                        <span className="font-medium">{p.title}</span>
                                        <span className="block text-xs text-muted-foreground">
                                            Content · {fmtMonth(p.planMonth)} · your
                                            review
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-xs text-primary">
                                        Review →
                                    </span>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </section>
            ) : null}

            <section className="space-y-3">
                <h2 className="text-sm font-medium">Recently reviewed</h2>
                {reviewed.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No decisions yet.
                    </p>
                ) : (
                    <Card>
                        <CardContent className="divide-y p-0">
                            {reviewed.map((w) => {
                                const approved = w.review.decision === "approved";
                                return (
                                    <div
                                        key={w.id}
                                        className="flex items-start justify-between gap-3 px-4 py-3 text-sm"
                                    >
                                        <div className="min-w-0 space-y-0.5">
                                            <p className="font-medium">{w.title}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {[
                                                    contractName.get(w.contractId),
                                                    fmtWhen(w.review.at),
                                                    w.review.by
                                                        ? `by ${w.review.by}`
                                                        : "",
                                                ]
                                                    .filter(Boolean)
                                                    .join(" · ")}
                                            </p>
                                            {w.review.note ? (
                                                <p className="text-xs">
                                                    &ldquo;{w.review.note}&rdquo;
                                                </p>
                                            ) : null}
                                        </div>
                                        <Badge
                                            variant={approved ? "default" : "outline"}
                                            className="shrink-0"
                                        >
                                            {approved
                                                ? "Approved"
                                                : "Changes"}
                                        </Badge>
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>
                )}
            </section>
        </div>
    );
}
