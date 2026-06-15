/* eslint-disable @next/next/no-img-element */
import type { ContentMedia } from "@/lib/data/content";

/**
 * Renders a draft's asset: single image, carousel (multiple images), or video.
 * Presentational + server-safe — used in the agency review panel and the client
 * portal. Falls back to a legacy single fileUrl when media[] is empty.
 */
export function AssetPreview({
    media,
    fallbackUrl = "",
    className = "",
}: {
    media: ContentMedia[];
    fallbackUrl?: string;
    className?: string;
}) {
    const items: ContentMedia[] =
        media && media.length > 0
            ? media
            : fallbackUrl
                ? [{ url: fallbackUrl, type: "image", name: "asset" }]
                : [];

    if (items.length === 0) {
        return (
            <p className={`text-xs text-muted-foreground ${className}`}>
                No asset attached yet.
            </p>
        );
    }

    const video = items.find((m) => m.type === "video");
    if (video) {
        return (
            <video
                controls
                src={video.url}
                className={`max-h-80 w-full rounded-md border bg-black ${className}`}
            />
        );
    }

    if (items.length === 1) {
        return (
            <img
                src={items[0].url}
                alt={items[0].name || "asset"}
                className={`max-h-80 w-full rounded-md border object-contain ${className}`}
            />
        );
    }

    // Carousel — horizontal scroll strip.
    return (
        <div className={`space-y-1 ${className}`}>
            <div className="flex snap-x gap-2 overflow-x-auto pb-1">
                {items.map((m, i) => (
                    <img
                        key={i}
                        src={m.url}
                        alt={m.name || `slide ${i + 1}`}
                        className="h-40 w-40 shrink-0 snap-start rounded-md border object-cover"
                    />
                ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
                Carousel · {items.length} images
            </p>
        </div>
    );
}
