/* eslint-disable @next/next/no-img-element */
import { Download } from "lucide-react";
import type { ContentMedia } from "@/lib/data/content";

/**
 * Renders a draft's asset: single image, carousel (multiple images), or video —
 * each with a Download link. Presentational + server-safe; used in the agency
 * review panel and the client portal. Falls back to a legacy single fileUrl
 * when media[] is empty.
 *
 * Download: we append `?download=<name>` so Supabase Storage serves the file
 * with Content-Disposition: attachment (the plain `download` attribute is
 * ignored for cross-origin URLs). Harmless for same-origin /api/dev-files URLs,
 * where the `download` attribute forces it anyway.
 */
function downloadHref(m: ContentMedia) {
    const sep = m.url.includes("?") ? "&" : "?";
    const name = m.name || "asset";
    return `${m.url}${sep}download=${encodeURIComponent(name)}`;
}

function DownloadLink({
    m,
    label,
}: {
    m: ContentMedia;
    label: string;
}) {
    return (
        <a
            href={downloadHref(m)}
            download={m.name || true}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
            <Download className="size-3.5" />
            {label}
        </a>
    );
}

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
            <div className={`space-y-2 ${className}`}>
                <video
                    controls
                    src={video.url}
                    className="max-h-80 w-full rounded-md border bg-black"
                />
                <DownloadLink m={video} label="Download video" />
            </div>
        );
    }

    if (items.length === 1) {
        return (
            <div className={`space-y-2 ${className}`}>
                <img
                    src={items[0].url}
                    alt={items[0].name || "asset"}
                    className="max-h-80 w-full rounded-md border object-contain"
                />
                <DownloadLink m={items[0]} label="Download" />
            </div>
        );
    }

    // Carousel — horizontal scroll strip + a download per image.
    return (
        <div className={`space-y-2 ${className}`}>
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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[11px] text-muted-foreground">
                    Carousel · {items.length} images ·
                </span>
                {items.map((m, i) => (
                    <DownloadLink key={i} m={m} label={`${i + 1}`} />
                ))}
            </div>
        </div>
    );
}
