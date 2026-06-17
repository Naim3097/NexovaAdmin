import { FileImage, MessageSquare, CheckCircle2 } from "lucide-react";
import type { ContentPost } from "@/lib/data/content";
import { AssetPreview } from "@/components/asset-preview";

/**
 * Shared review history — the same Draft 1 → feedback → Draft 2 … timeline shown
 * to BOTH the agency and the client, so everyone sees the same conversation and
 * the same revision count. Drafts and feedback are interleaved by time.
 */
type Node =
    | { kind: "draft"; at: string; draft: ContentPost["drafts"][number] }
    | { kind: "feedback"; at: string; fb: ContentPost["feedback"][number] };

export function ReviewTimeline({
    post,
    revisionLimit,
}: {
    post: ContentPost;
    revisionLimit: number;
}) {
    const nodes: Node[] = [
        ...post.drafts.map((d) => ({
            kind: "draft" as const,
            at: d.submittedAt,
            draft: d,
        })),
        ...post.feedback.map((f) => ({
            kind: "feedback" as const,
            at: f.createdAt,
            fb: f,
        })),
    ].sort((a, b) => (a.at < b.at ? -1 : 1));

    const over = post.revisionsUsed > revisionLimit;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                    History
                </p>
                <p className="text-xs text-muted-foreground">
                    Revisions:{" "}
                    <span className={over ? "font-semibold text-amber-600" : ""}>
                        {post.revisionsUsed}
                    </span>{" "}
                    of {revisionLimit}
                    {over ? " (extra)" : ""}
                </p>
            </div>

            {nodes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    Nothing yet — the first draft will appear here.
                </p>
            ) : (
                <ol className="space-y-4">
                    {nodes.map((n, i) =>
                        n.kind === "draft" ? (
                            <li key={`d${i}`} className="flex gap-3">
                                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                    <FileImage className="size-3.5" />
                                </span>
                                <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <span className="text-sm font-medium">
                                            {n.draft.draftNumber || "Draft"}
                                        </span>
                                        <span className="text-[11px] text-muted-foreground">
                                            {new Date(
                                                n.draft.submittedAt,
                                            ).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <AssetPreview
                                        media={n.draft.media}
                                        fallbackUrl={n.draft.fileUrl}
                                    />
                                </div>
                            </li>
                        ) : (
                            <li key={`f${i}`} className="flex gap-3">
                                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                    <MessageSquare className="size-3.5" />
                                </span>
                                <div className="min-w-0 flex-1 space-y-0.5">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <span className="text-sm font-medium capitalize">
                                            {n.fb.author === "client"
                                                ? "Client"
                                                : "Agency"}{" "}
                                            requested changes
                                            {n.fb.cycle
                                                ? ` · revision ${n.fb.cycle}`
                                                : ""}
                                        </span>
                                        <span className="text-[11px] text-muted-foreground">
                                            {new Date(
                                                n.fb.createdAt,
                                            ).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                                        {n.fb.body}
                                    </p>
                                </div>
                            </li>
                        ),
                    )}

                    {post.reviewStatus === "approved" ? (
                        <li className="flex gap-3">
                            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-green-600/10 text-green-600">
                                <CheckCircle2 className="size-3.5" />
                            </span>
                            <div className="flex-1">
                                <span className="text-sm font-medium text-green-700">
                                    Approved
                                    {post.approvedBy ? ` by ${post.approvedBy}` : ""}
                                </span>
                            </div>
                        </li>
                    ) : null}
                </ol>
            )}
        </div>
    );
}
