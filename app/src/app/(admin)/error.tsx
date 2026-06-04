"use client";

import { ErrorState } from "@/components/error-state";

export default function AdminError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return <ErrorState error={error} reset={reset} />;
}
