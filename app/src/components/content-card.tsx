import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AssetPreview } from "@/components/asset-preview";
import type { ContentPost } from "@/lib/data/content";

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

function latestMedia(post: ContentPost) {
    return post.drafts[post.drafts.length - 1]?.media ?? [];
}

/**
 * Card preview of a content item — shared by the agency board and the client
 * portal. Pass `href` to make it a link (agency → /content/[id]).
 */
export function ContentCard({
    post,
    href,
    statusLabel,
    statusVariant = "outline",
}: {
    post: ContentPost;
    href?: string;
    statusLabel: string;
    statusVariant?: BadgeVariant;
}) {
    const media = latestMedia(post);
    const body = (
        <Card className={href ? "h-full transition hover:border-primary/50" : "h-full"}>
            <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm">{post.title}</CardTitle>
                    <Badge variant={statusVariant}>{statusLabel}</Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
                {media.length > 0 || post.currentFileUrl ? (
                    <AssetPreview media={media} fallbackUrl={post.currentFileUrl} />
                ) : null}
                {post.direction ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                        {post.direction}
                    </p>
                ) : null}
                {post.draftNumber ? (
                    <p className="text-[11px] text-muted-foreground">
                        {post.draftNumber}
                    </p>
                ) : null}
            </CardContent>
        </Card>
    );
    return href ? (
        <Link href={href} className="block">
            {body}
        </Link>
    ) : (
        body
    );
}
