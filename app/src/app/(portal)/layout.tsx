/**
 * Public read-only client portal layout. NO admin auth — access is gated
 * by the unguessable token in the URL. Each project's portal page does
 * its own token lookup via getProjectByPortalToken.
 *
 * Sibling to (admin) and (print) route groups so it bypasses the admin
 * chrome (sidebar, etc.) entirely.
 */
export default function PortalLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-dvh bg-background">
            <header className="border-b">
                <div className="mx-auto flex h-14 max-w-3xl items-center px-4 text-sm font-semibold">
                    Nexov · Client portal
                </div>
            </header>
            <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
            <footer className="mx-auto max-w-3xl px-4 py-6 text-xs text-muted-foreground">
                Read-only. Do not share this link publicly — it grants access
                to your project status.
            </footer>
        </div>
    );
}
