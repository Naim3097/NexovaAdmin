import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { AssetPreview } from "@/components/asset-preview";
import { DraftViewer } from "@/components/draft-viewer";
import { CopyButton } from "@/components/copy-button";
import { StatusLights } from "@/components/status-lights";
import {
    portalApproveAction,
    portalRequestChangesAction,
} from "@/lib/portal/actions";
import type { ContentPost } from "@/lib/data/content";

function latestMedia(post: ContentPost) {
    return post.drafts[post.drafts.length - 1]?.media ?? [];
}

/**
 * The ONE content card.
 *  - Agency board: pass `href` → compact link to /content/[id] (latest asset).
 *  - Client portal: pass `clientReview` → a compact DRAFT SLIDER (one version at
 *    a time, navigable), a bounded + copyable caption, and inline Approve /
 *    Request-changes when it's the client's turn. Stays a fixed height regardless
 *    of how many drafts/revisions.
 */
export function ContentCard({
    post,
    href,
    clientReview = false,
    revisionLimit = 3,
    extraRevisionPrice = 0,
}: {
    post: ContentPost;
    href?: string;
    /** Deprecated — kept so existing callers compile; the card now shows lights. */
    statusLabel?: string;
    statusVariant?: "default" | "secondary" | "outline" | "destructive";
    clientReview?: boolean;
    revisionLimit?: number;
    extraRevisionPrice?: number;
}) {
    const awaiting = post.reviewStatus === "awaiting_client";
    const atLimit = post.revisionsUsed >= revisionLimit;

    const inner = (
        <Card className={href ? "h-full transition hover:border-primary/50" : "h-full"}>
            <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm">{post.title}</CardTitle>
                    <StatusLights post={post} showCaption />
                </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                {clientReview ? (
                    <>
                        {/* Compact, navigable draft slider — bounded height */}
                        <DraftViewer
                            drafts={post.drafts}
                            feedback={post.feedback}
                            revisionLimit={revisionLimit}
                            revisionsUsed={post.revisionsUsed}
                        />

                        {/* Caption — formatting preserved + one-tap copy */}
                        {post.copywriting ? (
                            <div>
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-medium text-muted-foreground">
                                        Caption
                                    </p>
                                    <CopyButton
                                        text={post.copywriting}
                                        label="Copy caption"
                                    />
                                </div>
                                <p className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-2 text-sm">
                                    {post.copywriting}
                                </p>
                            </div>
                        ) : null}

                        {/* Actions */}
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
                ) : (
                    <>
                        {latestMedia(post).length > 0 || post.currentFileUrl ? (
                            <AssetPreview
                                media={latestMedia(post)}
                                fallbackUrl={post.currentFileUrl}
                            />
                        ) : null}
                        {post.direction ? (
                            <p className="line-clamp-2 text-xs text-muted-foreground">
                                {post.direction}
                            </p>
                        ) : null}
                    </>
                )}
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
