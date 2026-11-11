/**
 * Client portal layout: the signed-in client sees their contracts, content
 * and billing. Access is gated by the client login in proxy.ts.
 *
 * Sibling to (admin) and (print) route groups so it bypasses the admin
 * chrome (sidebar, etc.) entirely.
 */
import { Logo } from "@/components/logo";

export default function PortalLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-dvh bg-muted/40">
            <header className="border-b bg-background">
                <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
                    <Logo className="h-5" />
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Client portal
                    </span>
                </div>
            </header>
            <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
            <footer className="mx-auto max-w-3xl px-4 py-6 text-xs text-muted-foreground">
                Private — do not share your login. It grants access to your
                contract progress, content and billing.
            </footer>
        </div>
    );
}
