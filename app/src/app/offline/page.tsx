export default function OfflinePage() {
    return (
        <main className="flex min-h-dvh items-center justify-center p-6 text-center">
            <div className="space-y-2">
                <h1 className="text-2xl font-semibold">You&apos;re offline</h1>
                <p className="text-sm text-muted-foreground">
                    Reconnect to continue. Your changes will sync when you&apos;re back.
                </p>
            </div>
        </main>
    );
}
