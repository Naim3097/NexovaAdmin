"use client";

/**
 * Last-resort boundary for errors thrown in the root layout itself.
 * Must render its own <html>/<body> because it replaces the root layout.
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <html lang="en">
            <body className="flex min-h-dvh items-center justify-center p-6">
                <div className="w-full max-w-md space-y-4 text-center">
                    <h1 className="text-base font-semibold">
                        Something went wrong
                    </h1>
                    <p className="text-sm text-gray-500">
                        The app hit an unexpected error. Please try again.
                    </p>
                    <button
                        onClick={reset}
                        className="inline-flex h-9 items-center rounded-lg bg-gray-900 px-4 text-sm font-medium text-white"
                    >
                        Try again
                    </button>
                    {error.digest ? (
                        <p className="text-[11px] text-gray-400">
                            Reference: {error.digest}
                        </p>
                    ) : null}
                </div>
            </body>
        </html>
    );
}
