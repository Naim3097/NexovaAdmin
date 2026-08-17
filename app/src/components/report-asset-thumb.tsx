"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import type { ContentMedia } from "@/lib/data/content";

/**
 * Print-safe asset thumbnail for client-facing reports.
 *
 * The admin UI can lean on `<video>` painting its first frame on screen, but a
 * printed PDF renders `<video>` as an empty box. This component always ends up
 * with a real `<img>`:
 *   - image drafts        → the image
 *   - carousel drafts     → the first image + a count badge
 *   - video with a cover  → the uploaded cover/clickbait image + play badge
 *   - video only          → first frame captured client-side into a data-URL
 *                           image (falls back to a labelled placeholder if the
 *                           video can't be read, e.g. cross-origin without CORS)
 */

function useVideoFrame(url: string | null): string | null {
    const [frame, setFrame] = useState<string | null>(null);

    useEffect(() => {
        if (!url) return;
        let cancelled = false;
        let video: HTMLVideoElement | null = null;

        const attempt = (withCors: boolean) => {
            if (cancelled) return;
            const v = document.createElement("video");
            video = v;
            if (withCors) v.crossOrigin = "anonymous";
            v.muted = true;
            v.preload = "auto";
            v.playsInline = true;

            const capture = () => {
                if (cancelled) return;
                try {
                    const canvas = document.createElement("canvas");
                    canvas.width = v.videoWidth || 640;
                    canvas.height = v.videoHeight || 360;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) return;
                    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
                    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
                    if (!cancelled) setFrame(dataUrl);
                } catch {
                    // Tainted canvas (no CORS) — placeholder stays.
                }
            };

            v.addEventListener("loadedmetadata", () => {
                // Nudge past t=0 — some encoders put a black frame there.
                try {
                    v.currentTime = Math.min(0.1, v.duration || 0.1);
                } catch {
                    capture();
                }
            });
            v.addEventListener("seeked", capture);
            v.addEventListener("loadeddata", () => {
                // Fallback for browsers that don't fire seeked reliably.
                if (v.currentTime > 0) capture();
            });
            v.addEventListener("error", () => {
                // A CORS-mode load can fail outright on hosts without CORS
                // headers — retry plain once (same-origin still captures;
                // cross-origin taints and falls back to the placeholder).
                if (withCors) attempt(false);
            });
            v.src = url;
        };
        attempt(true);

        return () => {
            cancelled = true;
            if (video) {
                video.removeAttribute("src");
                video.load();
            }
        };
    }, [url]);

    return frame;
}

export function ReportAssetThumb({
    media,
    fallbackUrl = "",
    alt,
}: {
    media: ContentMedia[];
    fallbackUrl?: string;
    alt: string;
}) {
    const items: ContentMedia[] =
        media && media.length > 0
            ? media
            : fallbackUrl
              ? [{ url: fallbackUrl, type: "image", name: "asset" }]
              : [];

    const images = items.filter((m) => m.type === "image");
    const video = items.find((m) => m.type === "video");
    // Only capture a frame when there's no uploaded cover to use instead.
    const capturedFrame = useVideoFrame(
        video && images.length === 0 ? video.url : null,
    );

    const cover = images[0]?.url ?? capturedFrame;

    if (items.length === 0) {
        return (
            <div className="flex aspect-[4/3] w-full items-center justify-center rounded-md border bg-muted/40">
                <span className="text-xs text-muted-foreground">No asset</span>
            </div>
        );
    }

    return (
        <div className="relative w-full overflow-hidden rounded-md border bg-muted/30">
            {cover ? (
                <img
                    src={cover}
                    alt={alt}
                    className="aspect-[4/3] w-full object-cover"
                />
            ) : (
                <div className="flex aspect-[4/3] w-full items-center justify-center bg-neutral-900">
                    <Play
                        className="size-8 text-white/80"
                        aria-hidden="true"
                    />
                </div>
            )}
            {video ? (
                <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
                    <Play className="size-2.5" aria-hidden="true" /> Video
                </span>
            ) : images.length > 1 ? (
                <span className="absolute bottom-1.5 left-1.5 inline-flex items-center rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
                    Carousel · {images.length}
                </span>
            ) : null}
        </div>
    );
}
