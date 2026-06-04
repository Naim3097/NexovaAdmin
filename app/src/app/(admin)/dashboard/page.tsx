import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listLeads } from "@/lib/data/leads";
import { listSubmissions } from "@/lib/data/onboarding";
import { listProjects } from "@/lib/data/projects";
import { computeTotals, listInvoices } from "@/lib/data/invoices";
import { listContentPosts } from "@/lib/data/content";
import { listCampaigns, totalsFor } from "@/lib/data/campaigns";
import { listActivityFiltered } from "@/lib/activity";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
    const [leads, submissions, projects, invoices, content, campaigns, recentActivity] =
        await Promise.all([
            listLeads(),
            listSubmissions(),
            listProjects(),
            listInvoices(),
            listContentPosts(),
            listCampaigns(),
            listActivityFiltered({ limit: 8 }),
        ]);

    // eslint-disable-next-line react-hooks/purity -- server component, runs per request
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const leadsThisWeek = leads.filter(
        (l) => Date.parse(l.createdAt) >= oneWeekAgo,
    ).length;
    const wonLeads = leads.filter((l) => l.status === "won").length;
    const openPipelineValue = leads
        .filter((l) => l.status !== "lost" && l.status !== "won")
        .reduce((sum, l) => sum + (l.estValueMyr || 0), 0);
    const activeProjects = projects.filter(
        (p) => p.status !== "delivered" && p.status !== "on_hold",
    ).length;
    const draftOnboardings = submissions.filter((s) => s.status === "draft").length;

    const today = new Date().toISOString().slice(0, 10);
    const monthPrefix = today.slice(0, 7);
    const arOpen = invoices
        .filter((i) => i.status === "sent" || i.status === "overdue")
        .reduce((sum, i) => sum + computeTotals(i).total, 0);
    const paidMtd = invoices
        .filter((i) => i.status === "paid" && (i.paidAt ?? "").startsWith(monthPrefix))
        .reduce((sum, i) => sum + computeTotals(i).total, 0);
    const overdueCount = invoices.filter(
        (i) => i.status === "sent" && i.dueDate < today,
    ).length;

    // eslint-disable-next-line react-hooks/purity -- server component, runs per request
    const inSevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
    const contentDueSoon = content.filter(
        (c) =>
            (c.status === "draft" ||
                c.status === "review" ||
                c.status === "scheduled") &&
            c.scheduledFor >= today &&
            c.scheduledFor <= inSevenDays,
    ).length;

    // Campaign / ad spend (manual entries)
    const monthStart = `${monthPrefix}-01`;
    const adSpendMtd = campaigns.reduce(
        (sum, c) => sum + totalsFor(c.metrics, monthStart, today).spendMyr,
        0,
    );
    const activeCampaigns = campaigns.filter((c) => c.status === "live").length;
    const wonRevenueFromCampaigns = leads
        .filter(
            (l) =>
                l.status === "won" &&
                l.sourceCampaignId &&
                (l.updatedAt ?? "").startsWith(monthPrefix),
        )
        .reduce((sum, l) => sum + (l.estValueMyr || 0), 0);
    const roasMtd = adSpendMtd > 0 ? wonRevenueFromCampaigns / adSpendMtd : 0;

    const fmtMyr = (n: number) =>
        n.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        });

    const kpis: Array<{ label: string; value: string; href: string }> = [
        { label: "Leads this week", value: String(leadsThisWeek), href: "/leads" },
        { label: "Won leads", value: String(wonLeads), href: "/pipeline" },
        {
            label: "Open pipeline (MYR)",
            value: fmtMyr(openPipelineValue),
            href: "/pipeline",
        },
        {
            label: "Active projects",
            value: String(activeProjects),
            href: "/projects",
        },
        {
            label: "Onboardings open",
            value: String(draftOnboardings),
            href: "/onboarding",
        },
        {
            label: "AR open (MYR)",
            value: fmtMyr(arOpen),
            href: "/invoices",
        },
        {
            label: "Paid MTD (MYR)",
            value: fmtMyr(paidMtd),
            href: "/invoices",
        },
        {
            label: "Overdue invoices",
            value: String(overdueCount),
            href: "/invoices",
        },
        {
            label: "Content due 7d",
            value: String(contentDueSoon),
            href: "/content/calendar",
        },
        {
            label: "Active campaigns",
            value: String(activeCampaigns),
            href: "/campaigns",
        },
        {
            label: "Ad spend MTD (MYR)",
            value: fmtMyr(adSpendMtd),
            href: "/campaigns",
        },
        {
            label: "ROAS MTD",
            value: adSpendMtd > 0 ? `${roasMtd.toFixed(2)}x` : "—",
            href: "/campaigns",
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold sm:text-3xl">Dashboard</h1>
                <p className="text-sm text-muted-foreground">
                    Live overview of leads, deals, projects, and revenue.
                </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {kpis.map((k) => (
                    <Link key={k.label} href={k.href} className="block">
                        <Card className="h-full transition-colors hover:bg-muted/40">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-medium text-muted-foreground">
                                    {k.label}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-semibold">{k.value}</div>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Recent activity</CardTitle>
                    <Link
                        href="/activity"
                        className="text-xs text-muted-foreground hover:underline"
                    >
                        View all →
                    </Link>
                </CardHeader>
                <CardContent>
                    {recentActivity.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Nothing has happened yet.
                        </p>
                    ) : (
                        <ul className="divide-y text-sm">
                            {recentActivity.map((e) => (
                                <li
                                    key={e.id}
                                    className="flex items-start justify-between gap-3 py-2"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant="outline">
                                                {e.kind}
                                            </Badge>
                                            <Link
                                                href={e.href}
                                                className="truncate hover:underline"
                                            >
                                                {e.title}
                                            </Link>
                                        </div>
                                        {e.detail ? (
                                            <p className="truncate text-xs text-muted-foreground">
                                                {e.detail}
                                            </p>
                                        ) : null}
                                    </div>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                        {new Date(e.at).toLocaleString(undefined, {
                                            month: "short",
                                            day: "numeric",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Recent leads</CardTitle>
                </CardHeader>
                <CardContent>
                    {leads.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No leads yet —{" "}
                            <Link href="/leads" className="underline">
                                add one
                            </Link>
                            .
                        </p>
                    ) : (
                        <ul className="divide-y text-sm">
                            {leads.slice(0, 5).map((l) => (
                                <li
                                    key={l.id}
                                    className="flex items-center justify-between py-2"
                                >
                                    <Link href={`/leads/${l.id}`} className="hover:underline">
                                        {l.name}
                                        {l.company ? (
                                            <span className="text-muted-foreground">
                                                {" "}
                                                · {l.company}
                                            </span>
                                        ) : null}
                                    </Link>
                                    <span className="text-xs text-muted-foreground">
                                        {l.status}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
