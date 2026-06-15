import { notFound } from "next/navigation";
import { getClientByPortalToken } from "@/lib/data/clients";
import { listContentPosts, type ContentPost } from "@/lib/data/content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AssetPreview } from "@/components/asset-preview";
import {
    portalApproveAction,
    portalCreateRequestAction,
    portalRequestChangesAction,
} from "@/lib/content/portal-actions";

export const dynamic = "force-dynamic";

function DraftPreview({ post }: { post: ContentPost }) {
    const media = post.drafts[post.drafts.length - 1]?.media ?? [];
    return (
        <div className="space-y-2">
            <AssetPreview media={media} fallbackUrl={post.currentFileUrl} />
            {post.caption ? (
                <p className="whitespace-pre-wrap text-sm">{post.caption}</p>
            ) : null}
        </div>
    );
}

function Thread({ post }: { post: ContentPost }) {
    if (post.feedback.length === 0) return null;
    return (
        <div className="space-y-2 rounded-md border bg-muted/40 p-3">
            <p className="text-xs font-medium text-muted-foreground">
                Conversation
            </p>
            {post.feedback.map((f) => (
                <div key={f.id} className="text-sm">
                    <span className="font-medium capitalize">{f.author}</span>
                    <span className="text-xs text-muted-foreground">
                        {" "}
                        · {new Date(f.createdAt).toLocaleDateString()}
                    </span>
                    <p className="whitespace-pre-wrap">{f.body}</p>
                </div>
            ))}
        </div>
    );
}

export default async function ClientContentPortal({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const client = await getClientByPortalToken(token);
    if (!client) notFound();

    const mine = (await listContentPosts()).filter(
        (c) =>
            c.clientName.trim().toLowerCase() ===
            client.name.trim().toLowerCase(),
    );

    const needsReview = mine.filter((c) => c.reviewStatus === "awaiting_client");
    const withAgency = mine.filter(
        (c) => c.reviewStatus === "changes_requested",
    );
    const approved = mine.filter((c) => c.reviewStatus === "approved");
    const limit = client.contentRevisionLimit;

    return (
        <div className="space-y-8">
            <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {client.name}
                </p>
                <h1 className="mt-1 text-2xl font-semibold md:text-3xl">
                    Content review
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Approve content or request changes. You have up to {limit}{" "}
                    revision cycle(s) per item.
                </p>
            </div>

            {/* Needs your review */}
            <section className="space-y-4">
                <h2 className="text-sm font-medium">
                    Needs your review ({needsReview.length})
                </h2>
                {needsReview.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Nothing waiting on you right now.
                    </p>
                ) : (
                    needsReview.map((post) => {
                        const used = post.revisionsUsed;
                        const atLimit = used >= limit;
                        return (
                            <div
                                key={post.id}
                                className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <h3 className="font-medium">{post.title}</h3>
                                    {post.draftNumber ? (
                                        <Badge variant="secondary">
                                            {post.draftNumber}
                                        </Badge>
                                    ) : null}
                                </div>

                                <DraftPreview post={post} />
                                <Thread post={post} />

                                <p className="text-xs text-muted-foreground">
                                    {used} of {limit} revision cycle(s) used.
                                </p>

                                <div className="flex flex-col gap-4 border-t pt-4 md:flex-row md:items-start">
                                    {/* Approve */}
                                    <form action={portalApproveAction}>
                                        <input
                                            type="hidden"
                                            name="token"
                                            value={token}
                                        />
                                        <input
                                            type="hidden"
                                            name="id"
                                            value={post.id}
                                        />
                                        <Button type="submit">Approve</Button>
                                    </form>

                                    {/* Request changes */}
                                    <form
                                        action={portalRequestChangesAction}
                                        className="flex-1 space-y-2"
                                    >
                                        <input
                                            type="hidden"
                                            name="token"
                                            value={token}
                                        />
                                        <input
                                            type="hidden"
                                            name="id"
                                            value={post.id}
                                        />
                                        <Label className="text-sm">
                                            Request changes
                                        </Label>
                                        <Textarea
                                            name="body"
                                            rows={3}
                                            required
                                            disabled={atLimit}
                                            placeholder={
                                                atLimit
                                                    ? "Revision limit reached — contact us for more."
                                                    : "What would you like changed?"
                                            }
                                        />
                                        <Input
                                            name="fileUrl"
                                            type="url"
                                            disabled={atLimit}
                                            placeholder="Optional reference link"
                                        />
                                        <Button
                                            type="submit"
                                            variant="outline"
                                            disabled={atLimit}
                                        >
                                            Send feedback
                                        </Button>
                                    </form>
                                </div>
                            </div>
                        );
                    })
                )}
            </section>

            {/* With the team */}
            {withAgency.length > 0 ? (
                <section className="space-y-3">
                    <h2 className="text-sm font-medium">
                        With our team ({withAgency.length})
                    </h2>
                    <ul className="divide-y rounded-lg border bg-card">
                        {withAgency.map((post) => (
                            <li
                                key={post.id}
                                className="flex items-center justify-between p-3"
                            >
                                <span className="text-sm">{post.title}</span>
                                <Badge variant="outline">
                                    Changes requested
                                </Badge>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {/* Approved */}
            {approved.length > 0 ? (
                <section className="space-y-3">
                    <h2 className="text-sm font-medium">
                        Approved ({approved.length})
                    </h2>
                    <ul className="divide-y rounded-lg border bg-card">
                        {approved.map((post) => (
                            <li
                                key={post.id}
                                className="flex items-center justify-between gap-3 p-3"
                            >
                                <span className="text-sm">{post.title}</span>
                                <div className="flex items-center gap-2">
                                    {post.currentFileUrl ? (
                                        <a
                                            href={post.currentFileUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-primary hover:underline"
                                        >
                                            View
                                        </a>
                                    ) : null}
                                    <Badge>Approved</Badge>
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {/* Request new content */}
            <section className="space-y-3 rounded-lg border bg-card p-4 md:p-6">
                <div>
                    <h2 className="text-sm font-medium">Request new content</h2>
                    <p className="text-xs text-muted-foreground">
                        Need something extra? Tell us and we&apos;ll pick it up.
                    </p>
                </div>
                <form action={portalCreateRequestAction} className="space-y-3">
                    <input type="hidden" name="token" value={token} />
                    <div className="space-y-1.5">
                        <Label className="text-sm">What do you need?</Label>
                        <Input
                            name="title"
                            required
                            placeholder="e.g. Raya promo carousel"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Details</Label>
                        <Textarea
                            name="instructions"
                            rows={3}
                            placeholder="Any context, references, or deadlines…"
                        />
                    </div>
                    <div className="flex justify-end">
                        <Button type="submit">Submit request</Button>
                    </div>
                </form>
            </section>
        </div>
    );
}
