/**
 * Renders a mixed list of reference URLs: image URLs (uploaded references or
 * direct image links) as tappable thumbnails, everything else as plain links.
 */
const IMAGE_RE = /\.(png|jpe?g|webp|gif|avif)(\?|$)/i;

function isImageUrl(url: string) {
    return IMAGE_RE.test(url) || url.includes("/content-assets/refs/");
}

export function ReferenceGallery({ urls }: { urls: string[] }) {
    if (urls.length === 0) return null;
    const images = urls.filter(isImageUrl);
    const links = urls.filter((u) => !isImageUrl(u));
    return (
        <div className="space-y-1.5">
            {images.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                    {images.map((url, i) => (
                        <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={url}
                                alt={`Reference ${i + 1}`}
                                loading="lazy"
                                className="h-16 w-16 rounded-md border object-cover transition hover:opacity-80"
                            />
                        </a>
                    ))}
                </div>
            ) : null}
            {links.length > 0 ? (
                <ul className="space-y-1">
                    {links.map((url, i) => (
                        <li key={i}>
                            <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="break-all text-xs text-primary hover:underline"
                            >
                                {url}
                            </a>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}
