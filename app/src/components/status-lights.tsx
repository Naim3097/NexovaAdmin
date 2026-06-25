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
    const headlineDone = (post.visualHeadline ?? "").trim().length > 0;
    const rs = post.reviewStatus;
    const posted = post.status === "posted" || !!post.postedAt;

    const l1: LightColor = headlineDone ? "green" : "off";
    const l2: LightColor =
        rs === "approved" || rs === "awaiting_client"
            ? "green"
            : rs === "changes_requested"
              ? "yellow"
              : "off";
    const l3: LightColor = rs === "approved" ? "green" : "off";
    const l4: LightColor = posted ? "green" : "off";

    const lights = [
        { color: l1, label: "Headline" },
        { color: l2, label: "Draft" },
        { color: l3, label: "Approved" },
        { color: l4, label: "Posted" },
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
