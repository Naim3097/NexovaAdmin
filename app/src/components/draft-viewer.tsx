"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AssetPreview } from "@/components/asset-preview";
import type { ContentDraft, ContentFeedback } from "@/lib/data/content";

/**
 * Compact draft slider for the client card. Shows ONE draft at a time (latest by
 * default) with ◀ ▶ to step through versions, plus the client's note on that
 * draft. Keeps each card a bounded height no matter how many drafts/revisions.
 */
export function DraftViewer({
    drafts,
    feedback,
    revisionLimit,
    revisionsUsed,
}: {
    drafts: ContentDraft[];
    feedback: ContentFeedback[];
    revisionLimit: number;
    revisionsUsed: number;
}) {
    const [i, setI] = useState(Math.max(0, drafts.length - 1));

    if (drafts.length === 0) {
        return (
            <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                No draft yet — the first version will appear here.
            </p>
        );
    }

    const idx = Math.min(i, drafts.length - 1);
    const d = drafts[idx];
    const isLatest = idx === drafts.length - 1;
    const notes = feedback.filter((f) => f.draftId === d.id);

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                    {d.draftNumber || `Draft ${idx + 1}`}
                    {isLatest ? (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                            (latest)
                        </span>
                    ) : null}
                </span>
                {drafts.length > 1 ? (
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            aria-label="Previous draft"
                            disabled={idx === 0}
                            onClick={() => setI(idx - 1)}
                            className="flex size-6 items-center justify-center rounded-full border disabled:opacity-30"
                        >
                            <ChevronLeft className="size-3.5" />
                        </button>
                        <span className="w-10 text-center text-[11px] tabular-nums text-muted-foreground">
                            {idx + 1}/{drafts.length}
                        </span>
                        <button
                            type="button"
                            aria-label="Next draft"
                            disabled={idx === drafts.length - 1}
                            onClick={() => setI(idx + 1)}
                            className="flex size-6 items-center justify-center rounded-full border disabled:opacity-30"
                        >
                            <ChevronRight className="size-3.5" />
                        </button>
                    </div>
                ) : null}
            </div>

            <AssetPreview media={d.media} fallbackUrl={d.fileUrl} />

            {notes.length > 0 ? (
                <div className="rounded-md bg-muted/40 p-2">
                    <p className="text-[11px] font-medium text-muted-foreground">
                        Your note on this draft
                    </p>
                    {notes.map((n) => (
                        <p key={n.id} className="whitespace-pre-wrap text-xs">
                            {n.body}
                        </p>
                    ))}
                </div>
            ) : null}

            <p className="text-[11px] text-muted-foreground">
                {revisionsUsed} of {revisionLimit} revisions used
            </p>
        </div>
    );
}
