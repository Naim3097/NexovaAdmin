"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { Play } from "lucide-react";

/**
 * Decode-aware video playback for the portal and admin review surfaces.
 *
 * A bare `<video src>` renders an INVISIBLE empty box when the viewer's
 * browser can't decode the file — .mov container in Firefox, HEVC/H.265
 * exports on machines without hardware support, etc. That is exactly what a
 * client reports as "the video is just blank". This wraps the element with:
 *   - poster support (the cover auto-captured at upload time)
 *   - playsInline + preload="metadata" so mobile Safari behaves
 *   - a visible decode-failure fallback pointing at the Download link, which
 *     always works regardless of codec support.
 */
export function VideoPlayer({
    src,
    poster,
    className = "",
}: {
    src: string;
    poster?: string;
    className?: string;
}) {
    const [failed, setFailed] = useState(false);

    if (failed) {
        // Message sits IN FLOW (not absolute) so the box always has height
        // even with no poster — otherwise it collapses to an invisible sliver,
        // which is the very "blank space" bug this component exists to kill.
        return (
            <div className="relative w-full overflow-hidden rounded-md border bg-neutral-950">
                {poster ? (
                    <img
                        src={poster}
                        alt="Video preview"
                        className="max-h-80 w-full object-contain opacity-40"
                    />
                ) : null}
                <div
                    className={`flex min-h-[220px] w-full flex-col items-center justify-center gap-1.5 p-4 text-center ${
                        poster ? "absolute inset-0" : ""
                    }`}
                >
                    <Play className="size-7 text-white/80" aria-hidden="true" />
                    <p className="text-sm font-medium text-white">
                        This device can&apos;t play the video preview
                    </p>
                    <p className="text-xs text-white/75">
                        Use the download link below to watch it.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <video
            controls
            playsInline
            preload="metadata"
            src={src}
            poster={poster}
            className={className}
            onError={() => setFailed(true)}
            onLoadedMetadata={(e) => {
                // Metadata can parse while the video track itself is
                // undecodable (typical HEVC-without-hardware case) — the
                // element then reports 0×0 dimensions. Audio-only files are
                // never uploaded here, so 0×0 means "can't decode".
                const v = e.currentTarget;
                if (v.videoWidth === 0 && v.videoHeight === 0) setFailed(true);
            }}
        />
    );
}
