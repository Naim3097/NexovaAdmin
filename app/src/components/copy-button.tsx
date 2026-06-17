"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

/** Small "copy to clipboard" button — used for the caption so clients can paste
 *  it straight into the platform, formatting preserved. */
export function CopyButton({
    text,
    label = "Copy",
}: {
    text: string;
    label?: string;
}) {
    const [done, setDone] = useState(false);
    return (
        <button
            type="button"
            onClick={async () => {
                try {
                    await navigator.clipboard.writeText(text);
                    setDone(true);
                    setTimeout(() => setDone(false), 1500);
                } catch {
                    // clipboard blocked — user can select manually
                }
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
            {done ? (
                <Check className="size-3.5" />
            ) : (
                <Copy className="size-3.5" />
            )}
            {done ? "Copied" : label}
        </button>
    );
}
