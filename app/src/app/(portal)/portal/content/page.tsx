import Link from "next/link";
import { getCurrentClient } from "@/lib/auth";
import { listContentPosts, visualsUsed } from "@/lib/data/content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContentCard } from "@/components/content-card";
import { RequestContentForm } from "./request-content-form";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
    none: "In production",
    awaiting_client: "Your review",
    changes_requested: "We're on it",
    approved: "Approved",
};
const STATUS_VARIANT: Record<
    string,
    "default" | "secondary" | "outline" | "destructive"
> = {
    none: "outline",
    awaiting_client: "secondary",
    changes_requested: "outline",
    approved: "default",
};

function currentMonth() {
    return new Date().toISOString().slice(0, 7);
}
function fmtMonth(m: string) {
    const [y, mo] = m.split("-").map(Number);
    return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
    });
}

// Awaiting-client items first, then the rest by newest.
function reviewOrder(s: string) {
    return s === "awaiting_client" ? 0 : s === "changes_requested" ? 1 : 2;
}

export default async function PortalContentPage({
    searchParams,
}: {
    searchParams: Promise<{ month?: string }>;
}) {
    const client = await getCurrentClient();
    if (!client) {
        return (
            <div className="space-y-2">
                <h1 className="text-2xl font-semibold">Content</h1>
                <p className="text-sm text-muted-foreground">
                    This account isn&apos;t linked to a client workspace yet.
                </p>
            </div>
        );
    }

    const { month: monthParam } = await searchParams;
    const mine = (await listContentPosts()).filter(
        (p) =>
            p.clientName.trim().toLowerCase() ===
            client.name.trim().toLowerCase(),
    );

    const months = Array.from(
        new Set(
            [currentMonth(), ...mine.map((p) => p.planMonth).filter(Boolean)].filter(
                Boolean,
            ),
        ),
    ).sort((a, b) => (a < b ? 1 : -1));
    const selectedMonth =
        monthParam && months.includes(monthParam) ? monthParam : months[0];

    const monthPosts = mine
        .filter((p) => p.planMonth === selectedMonth)
        .sort((a, b) => {
            const r = reviewOrder(a.reviewStatus) - reviewOrder(b.reviewStatus);
            return r !== 0 ? r : a.createdAt < b.createdAt ? 1 : -1;
        });

    const awaitingCount = mine.filter(
        (p) => p.reviewStatus === "awaiting_client",
    ).length;

    // Quota counts VISUALS (carousel = several, single = 1).
    const usedThisMonth = visualsUsed(mine, client.name, currentMonth());

    const pill = (active: boolean) =>
        `rounded-full border px-3 py-1 text-xs ${active ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`;

    return (
        <div className="space-y-6">
            <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {client.name}
                </p>
                <h1 className="text-2xl font-semibold">Content</h1>
                <p className="text-sm text-muted-foreground">
                    {awaitingCount > 0
                        ? `${awaitingCount} item(s) waiting for your review.`
                        : "Review, approve, or request content."}
                </p>
                {client.monthlyContentQuota > 0 ? (
                    <div className="mt-3 max-w-sm space-y-1">
                        <div className="flex items-baseline justify-between text-xs">
                            <span className="text-muted-foreground">
                                This month&apos;s visuals
                            </span>
                            <span
                                className={
                                    usedThisMonth > client.monthlyContentQuota
                                        ? "font-medium text-destructive"
                                        : "text-muted-foreground"
                                }
                            >
                                {usedThisMonth}/{client.monthlyContentQuota} used
                            </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                                className={`h-full rounded-full ${
                                    usedThisMonth > client.monthlyContentQuota
                                        ? "bg-destructive"
                                        : usedThisMonth >=
                                            client.monthlyContentQuota
                                          ? "bg-amber-400"
                                          : "bg-primary"
                                }`}
                                style={{
                                    width: `${Math.min(100, (usedThisMonth / client.monthlyContentQuota) * 100)}%`,
                                }}
                            />
                        </div>
                    </div>
                ) : null}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Request content</CardTitle>
                </CardHeader>
                <CardContent>
                    <RequestContentForm
                        quota={client.monthlyContentQuota}
                        used={usedThisMonth}
                        extraPrice={client.extraContentPrice}
                    />
                </CardContent>
            </Card>

            {/* Month tabs */}
            <div className="flex flex-wrap gap-2 border-b pb-3">
                {months.map((m) => (
                    <Link
                        key={m}
                        href={`/portal/content?month=${m}`}
                        className={pill(m === selectedMonth)}
                    >
                        {fmtMonth(m)}
                    </Link>
                ))}
            </div>

            {monthPosts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    Nothing for {fmtMonth(selectedMonth)} yet — request something
                    above.
                </p>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    {monthPosts.map((post) => (
                        <ContentCard
                            key={post.id}
                            post={post}
                            clientReview
                            revisionLimit={client.contentRevisionLimit}
                            extraRevisionPrice={client.extraRevisionPrice}
                            statusLabel={STATUS_LABEL[post.reviewStatus]}
                            statusVariant={
                                STATUS_VARIANT[post.reviewStatus] ?? "outline"
                            }
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
