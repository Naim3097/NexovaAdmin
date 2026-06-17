import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { AssetPreview } from "@/components/asset-preview";
import { ReviewTimeline } from "@/components/review-timeline";
import {
    portalApproveAction,
    portalRequestChangesAction,
} from "@/lib/portal/actions";
import type { ContentPost } from "@/lib/data/content";

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

function latestMedia(post: ContentPost) {
    return post.drafts[post.drafts.length - 1]?.media ?? [];
}

/**
 * The ONE content card, used everywhere:
 *  - Agency board: pass `href` → it's a compact link to /content/[id].
 *  - Client portal: pass `clientReview` → it shows the asset, copy, the shared
 *    timeline, and (when it's the client's turn) inline Approve / Request-changes.
 */
export function ContentCard({
    post,
    href,
    statusLabel,
    statusVariant = "outline",
    clientReview = false,
    revisionLimit = 3,
    extraRevisionPrice = 0,
}: {
    post: ContentPost;
    href?: string;
    statusLabel: string;
    statusVariant?: BadgeVariant;
    clientReview?: boolean;
    revisionLimit?: number;
    extraRevisionPrice?: number;
}) {
    const media = latestMedia(post);
    const awaiting = post.reviewStatus === "awaiting_client";
    const atLimit = post.revisionsUsed >= revisionLimit;

    const inner = (
        <Card className={href ? "h-full transition hover:border-primary/50" : "h-full"}>
            <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm">{post.title}</CardTitle>
                    <Badge variant={statusVariant}>{statusLabel}</Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                {media.length > 0 || post.currentFileUrl ? (
                    <AssetPreview media={media} fallbackUrl={post.currentFileUrl} />
                ) : null}

                {/* Agency board cards stay compact; client cards get full detail */}
                {clientReview ? (
                    <>
                        {post.copywriting ? (
                            <div>
                                <p className="text-xs font-medium text-muted-foreground">
                                    Caption
                                </p>
                                <p className="whitespace-pre-wrap text-sm">
                                    {post.copywriting}
                                </p>
                            </div>
                        ) : null}

                        <ReviewTimeline post={post} revisionLimit={revisionLimit} />

                        {awaiting ? (
                            <div className="space-y-3 border-t pt-3">
                                <form action={portalApproveAction}>
                                    <input
                                        type="hidden"
                                        name="id"
                                        value={post.id}
                                    />
                                    <Button
                                        type="submit"
                                        size="lg"
                                        className="w-full"
                                    >
                                        ✓ Approve
                                    </Button>
                                </form>

                                <form
                                    action={portalRequestChangesAction}
                                    className="space-y-2"
                                >
                                    <input
                                        type="hidden"
                                        name="id"
                                        value={post.id}
                                    />
                                    {atLimit ? (
                                        <p className="rounded-md border border-amber-400/40 bg-amber-50 p-2 text-xs text-amber-800">
                                            You&apos;ve used your{" "}
                                            {revisionLimit} included revision(s).
                                            Further changes are charged at{" "}
                                            <strong>
                                                MYR{" "}
                                                {extraRevisionPrice.toFixed(2)}
                                            </strong>{" "}
                                            each.
                                        </p>
                                    ) : null}
                                    <Textarea
                                        name="body"
                                        rows={2}
                                        required
                                        placeholder="Request changes…"
                                    />
                                    <Button
                                        type="submit"
                                        variant="outline"
                                        className="w-full"
                                    >
                                        Send change request
                                    </Button>
                                </form>
                            </div>
                        ) : null}
                    </>
                ) : post.direction ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                        {post.direction}
                    </p>
                ) : null}
            </CardContent>
        </Card>
    );

    return href ? (
        <Link href={href} className="block">
            {inner}
        </Link>
    ) : (
        inner
    );
}
