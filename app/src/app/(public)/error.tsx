"use client";

import { ErrorState } from "@/components/error-state";

export default function PublicError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <ErrorState
            error={error}
            reset={reset}
            title="This page hit a snag"
        />
    );
}
