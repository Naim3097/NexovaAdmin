import Link from "next/link";
import { getCurrentClient } from "@/lib/auth";
import { listProjects } from "@/lib/data/projects";
import { computeTotals, listInvoices } from "@/lib/data/invoices";
import { listContentPosts } from "@/lib/data/content";
import { listSubmissions } from "@/lib/data/onboarding";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function fmtMyr(n: number) {
    return `MYR ${n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

export default async function PortalHomePage() {
    const client = await getCurrentClient();
    if (!client) {
        return (
            <div className="space-y-2">
                <h1 className="text-2xl font-semibold">Welcome</h1>
                <p className="text-sm text-muted-foreground">
                    This account isn&apos;t linked to a client workspace yet —
                    contact your account manager.
                </p>
            </div>
        );
    }

    const name = client.name.trim().toLowerCase();
    const month = new Date().toISOString().slice(0, 7);
    const [projects, invoices, posts, submissions] = await Promise.all([
        listProjects(),
        listInvoices(),
        listContentPosts(),
        listSubmissions(),
    ]);

    const myProjects = projects.filter(
        (p) => p.clientName.trim().toLowerCase() === name,
    );
    const openInvoices = invoices.filter(
        (i) =>
            i.clientName.trim().toLowerCase() === name &&
            (i.status === "sent" || i.status === "overdue"),
    );
    const openTotal = openInvoices.reduce(
        (sum, i) => sum + computeTotals(i).total,
        0,
    );
    const monthPosts = posts.filter(
        (p) =>
            p.clientName.trim().toLowerCase() === name && p.planMonth === month,
    );
    const awaitingYou = monthPosts.filter(
        (p) => p.reviewStatus === "awaiting_client",
    ).length;
    const pendingForms = submissions.filter(
        (s) =>
            s.clientName.trim().toLowerCase() === name &&
            s.status !== "submitted",
    );

    return (
        <div className="space-y-4">
            <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {client.name}
                </p>
                <h1 className="text-2xl font-semibold">Welcome</h1>
            </div>

            {awaitingYou > 0 ? (
                <Link href="/portal/content" className="block">
                    <Card className="border-primary/40 bg-primary/5">
                        <CardContent className="py-3 text-sm">
                            <strong>{awaitingYou}</strong> content item
                            {awaitingYou === 1 ? "" : "s"} waiting for your
                            review →
                        </CardContent>
                    </Card>
                </Link>
            ) : null}

            {pendingForms.length > 0 ? (
                <Link href="/portal/onboarding" className="block">
                    <Card className="border-primary/40 bg-primary/5">
                        <CardContent className="py-3 text-sm">
                            <strong>{pendingForms.length}</strong> onboarding
                            form{pendingForms.length === 1 ? "" : "s"} to
                            complete →
                        </CardContent>
                    </Card>
                </Link>
            ) : null}

            {myProjects.length > 0 ? (
                <div className="space-y-3">
                    <h2 className="text-sm font-medium">Your projects</h2>
                    {myProjects.map((p) => {
                        const total = p.stages.length;
                        const done = p.stages.filter(
                            (s) => s.state === "done",
                        ).length;
                        const active = p.stages.find(
                            (s) => s.state === "active",
                        );
                        return (
                            <Card key={p.id}>
                                <CardHeader className="pb-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <CardTitle className="text-sm">
                                            {p.name}
                                        </CardTitle>
                                        <Badge variant="outline">
                                            {p.status.replace(/_/g, " ")}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm">
                                    {total > 0 ? (
                                        <>
                                            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                                <div
                                                    className="h-full rounded-full bg-primary"
                                                    style={{
                                                        width: `${total ? Math.round((done / total) * 100) : 0}%`,
                                                    }}
                                                />
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                {done}/{total} stages done
                                                {active
                                                    ? ` · now: ${active.label}`
                                                    : done === total
                                                      ? " · completed"
                                                      : ""}
                                            </p>
                                        </>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">
                                            Kicking off soon.
                                        </p>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
                <Link href="/portal/content" className="block">
                    <Card className="h-full">
                        <CardHeader className="pb-1">
                            <CardTitle className="text-sm">Content</CardTitle>
                        </CardHeader>
                        <CardContent className="text-xs text-muted-foreground">
                            {monthPosts.length > 0
                                ? `${monthPosts.length} item${monthPosts.length === 1 ? "" : "s"} this month`
                                : "No items this month"}
                        </CardContent>
                    </Card>
                </Link>
                <Link href="/portal/billing" className="block">
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
            </div>
        </div>
    );
}
