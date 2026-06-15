import Link from "next/link";
import { getCurrentClient } from "@/lib/auth";
import { listContentPosts, type ContentPost } from "@/lib/data/content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { AssetPreview } from "@/components/asset-preview";
import { ContentCard } from "@/components/content-card";
import {
    portalApproveAction,
    portalRequestChangesAction,
} from "@/lib/portal/actions";
import { RequestContentForm } from "./request-content-form";

export const dynamic = "force-dynamic";

const CLIENT_STATUS_LABEL: Record<string, string> = {
    none: "In production",
    awaiting_client: "Ready for your review",
    changes_requested: "We're on your changes",
    approved: "Approved",
};
const CLIENT_STATUS_VARIANT: Record<
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

/** One item awaiting the client — asset + Approve + Request changes. */
function ReviewItem({
    post,
    revisionLimit,
}: {
    post: ContentPost;
    revisionLimit: number;
}) {
    const media = post.drafts[post.drafts.length - 1]?.media ?? [];
    const atLimit = post.revisionsUsed >= revisionLimit;
    const remaining = Math.max(revisionLimit - post.revisionsUsed, 0);

    return (
        <Card className="border-primary/30">
            <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">{post.title}</CardTitle>
                    <Badge>Ready for your review</Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <AssetPreview media={media} fallbackUrl={post.currentFileUrl} />

                {post.caption ? (
                    <div>
                        <p className="text-xs font-medium text-muted-foreground">
                            Caption
                        </p>
                        <p className="whitespace-pre-wrap text-sm">
                            {post.caption}
                        </p>
                    </div>
                ) : null}

                {/* Earlier feedback (so the conversation is visible) */}
                {post.feedback.length > 0 ? (
                    <div className="rounded-md border bg-muted/40 p-3">
                        <p className="text-xs font-medium text-muted-foreground">
                            Your earlier notes
                        </p>
                        <ul className="mt-1 space-y-1 text-sm">
                            {post.feedback.map((f) => (
                                <li key={f.id} className="whitespace-pre-wrap">
                                    “{f.body}”
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : null}

                {/* Approve — the easy, primary action */}
                <form action={portalApproveAction}>
                    <input type="hidden" name="id" value={post.id} />
                    <Button type="submit" className="w-full" size="lg">
                        ✓ Approve this content
                    </Button>
                </form>

                {/* Request changes */}
                {atLimit ? (
                    <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                        You&apos;ve used all your change requests for this item.
                        Approve it, or contact us for more.
                    </p>
                ) : (
                    <form
                        action={portalRequestChangesAction}
                        className="space-y-2"
                    >
                        <input type="hidden" name="id" value={post.id} />
                        <p className="text-xs font-medium text-muted-foreground">
                            Or request changes ({remaining} left)
                        </p>
                        <Textarea
                            name="body"
                            rows={3}
                            required
                            placeholder="What would you like changed?"
                        />
                        <Button type="submit" variant="outline" className="w-full">
                            Send change request
                        </Button>
                    </form>
                )}
            </CardContent>
        </Card>
    );
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
    const mine = (await listContentPosts())
        .filter(
            (p) =>
                p.clientName.trim().toLowerCase() ===
                client.name.trim().toLowerCase(),
        )
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    const needsReview = mine.filter((p) => p.reviewStatus === "awaiting_client");

    const months = Array.from(
        new Set(
            [currentMonth(), ...mine.map((p) => p.planMonth).filter(Boolean)].filter(
                Boolean,
            ),
        ),
    ).sort((a, b) => (a < b ? 1 : -1));
    const selectedMonth =
        monthParam && months.includes(monthParam) ? monthParam : months[0];
    const monthPosts = mine.filter((p) => p.planMonth === selectedMonth);

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
                    Review and approve what we create, or request new content.
                </p>
            </div>

            {/* Needs your review — front and centre */}
            <section className="space-y-3">
                <h2 className="text-sm font-medium">
                    Needs your review ({needsReview.length})
                </h2>
                {needsReview.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Nothing waiting on you right now. 🎉
                    </p>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                        {needsReview.map((post) => (
                            <ReviewItem
                                key={post.id}
                                post={post}
                                revisionLimit={client.contentRevisionLimit}
                            />
                        ))}
                    </div>
                )}
            </section>

            {/* Request content */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        Request new content
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <RequestContentForm />
                </CardContent>
            </Card>

            {/* Everything, by month */}
            <section className="space-y-3">
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
                        Nothing for {fmtMonth(selectedMonth)} yet.
                    </p>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                        {monthPosts.map((post) => (
                            <ContentCard
                                key={post.id}
                                post={post}
                                statusLabel={
                                    CLIENT_STATUS_LABEL[post.reviewStatus]
                                }
                                statusVariant={
                                    CLIENT_STATUS_VARIANT[post.reviewStatus] ??
                                    "outline"
                                }
                            />
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
