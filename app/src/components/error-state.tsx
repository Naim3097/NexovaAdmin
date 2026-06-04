"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shared fallback UI for route-group `error.tsx` boundaries.
 *
 * Next.js renders the nearest `error.tsx` when a Server Component or Server
 * Action throws during render. Before these boundaries existed an uncaught
 * Supabase/network error rendered a blank page; this gives the user a clear
 * message + a "Try again" that re-runs the failed render via `reset()`.
 */
export function ErrorState({
    error,
    reset,
    title = "Something went wrong",
}: {
    error: Error & { digest?: string };
    reset: () => void;
    title?: string;
}) {
    useEffect(() => {
        // Surface to the console so it shows up in server logs / Sentry later.
        console.error(error);
    }, [error]);

    return (
        <div className="flex min-h-[60dvh] items-center justify-center p-6">
            <div className="w-full max-w-md space-y-4 rounded-lg border bg-card p-6 text-center">
                <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                    <AlertTriangle className="size-5" aria-hidden="true" />
                </div>
                <div className="space-y-1">
                    <h2 className="text-base font-semibold">{title}</h2>
                    <p className="text-sm text-muted-foreground">
                        This usually clears up on its own. Try again — if it
                        keeps happening, let the team know.
                    </p>
                </div>
                <div className="flex justify-center gap-2">
                    <Button onClick={reset}>Try again</Button>
                </div>
                {error.digest ? (
                    <p className="text-[11px] text-muted-foreground">
                        Reference: {error.digest}
                    </p>
                ) : null}
            </div>
        </div>
    );
}
