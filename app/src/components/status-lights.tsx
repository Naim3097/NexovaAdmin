import type { ContentPost } from "@/lib/data/content";

/**
 * 4-light horizontal "traffic light" for a content item's review lifecycle.
 *   1 Headline   — green when the visual headline/concept is filled
 *   2 Draft      — green when a draft is submitted (or approved);
 *                  YELLOW when the client has requested changes (feedback, not yet approved)
 *   3 Approved   — green when the client has approved
 *   4 Posted     — green when published
 * Derives everything from the post fields — no extra state. Compact + responsive.
 */
type LightColor = "off" | "green" | "yellow";

const COLOR: Record<LightColor, string> = {
    off: "bg-neutral-200 dark:bg-neutral-700",
    green: "bg-emerald-500",
    yellow: "bg-amber-400",
};

export function statusLights(post: ContentPost): {
    lights: { color: LightColor; label: string }[];
    summary: string;
} {
    const directionDone = (post.direction ?? "").trim().length > 0;
    const headlineDone = (post.visualHeadline ?? "").trim().length > 0;
    const rs = post.reviewStatus;
    // A draft counts as submitted once ANY review state exists or drafts do —
    // and shows yellow while the client has changes outstanding.
    const hasDraft = post.drafts.length > 0;

    const l1: LightColor = directionDone ? "green" : "off";
    const l2: LightColor = headlineDone ? "green" : "off";
    const l3: LightColor =
        rs === "changes_requested"
            ? "yellow"
            : hasDraft || rs === "awaiting_client" || rs === "approved"
              ? "green"
              : "off";
    const l4: LightColor = rs === "approved" ? "green" : "off";

    const lights = [
        { color: l1, label: "Direction" },
        { color: l2, label: "Headline" },
        { color: l3, label: "Draft" },
        { color: l4, label: "Approved" },
    ];
    const summary = lights
        .map((x) => `${x.label}: ${x.color === "off" ? "pending" : x.color}`)
        .join(" · ");
    return { lights, summary };
}

export function StatusLights({
    post,
    showCaption = false,
}: {
    post: ContentPost;
    showCaption?: boolean;
}) {
    const { lights, summary } = statusLights(post);
    return (
        <div className="flex flex-col items-end gap-1">
            <div
                className="flex items-center gap-1"
                role="img"
                aria-label={summary}
                title={summary}
            >
                {lights.map((x, i) => (
                    <span
                        key={i}
                        className={`h-2 w-4 rounded-full sm:w-5 ${COLOR[x.color]}`}
                    />
                ))}
            </div>
            {showCaption ? (
                <span className="text-[10px] text-muted-foreground">
                    {lights
                        .filter((x) => x.color !== "off")
                        .slice(-1)
                        .map((x) => x.label)[0] ?? "Planning"}
                </span>
            ) : null}
        </div>
    );
}
