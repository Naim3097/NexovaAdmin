"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/**
 * Submit button for server-action edit forms that actually tells you what
 * happened: "Saving…" while pending, then a "Saved ✓" flash when the action
 * completes. Fixes the silent-save problem (a successful save previously
 * looked identical to a dead click).
 */
export function SaveButton({ label = "Save changes" }: { label?: string }) {
    const { pending } = useFormStatus();
    const wasPending = useRef(false);
    const [savedAt, setSavedAt] = useState<number | null>(null);

    useEffect(() => {
        if (wasPending.current && !pending) {
            // eslint-disable-next-line react-hooks/purity -- event timestamp, set in effect
            setSavedAt(Date.now());
        }
        wasPending.current = pending;
    }, [pending]);

    useEffect(() => {
        if (savedAt === null) return;
        const t = setTimeout(() => setSavedAt(null), 2500);
        return () => clearTimeout(t);
    }, [savedAt]);

    return (
        <span className="inline-flex items-center gap-3">
            {savedAt !== null && !pending ? (
                <span
                    role="status"
                    className="text-sm font-medium text-green-600 motion-safe:animate-in motion-safe:fade-in dark:text-green-500"
                >
                    Saved ✓
                </span>
            ) : null}
            <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : label}
            </Button>
        </span>
    );
}
