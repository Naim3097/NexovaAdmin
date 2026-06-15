import { redirect } from "next/navigation";
import Link from "next/link";
import { Bell } from "lucide-react";
import { getCurrentUser, getCurrentTeamMember, getCurrentClient } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { ClientNameDatalist } from "@/components/client-name-datalist";
import { ServiceNameDatalist } from "@/components/service-name-datalist";
import { SignOutButton } from "@/components/sign-out-button";
import { unreadCount } from "@/lib/data/notifications";
import { SidebarNav, MobileNav } from "./admin-nav";

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    // Invited users must choose a password before entering the app.
    if (user.user_metadata?.needs_password) redirect("/auth/set-password");
    // Client logins are NOT agency staff — keep them out of the admin and send
    // them to their portal. (Permissions are otherwise open, so this redirect
    // is what stops a client account from reaching agency data.)
    const client = await getCurrentClient();
    if (client) redirect("/portal");
    const [member, unread] = await Promise.all([
        getCurrentTeamMember(),
        unreadCount().catch(() => 0),
    ]);
    const displayName = member?.name ?? user.email ?? "Account";
    const initial = (member?.name ?? user.email ?? "?").charAt(0).toUpperCase();

    return (
        <div className="flex min-h-dvh flex-col md:flex-row">
            {/* Skip link for keyboard users */}
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
            >
                Skip to content
            </a>

            {/* Desktop sidebar */}
            <aside className="sticky top-0 hidden h-dvh md:flex md:w-64 md:flex-col md:border-r md:bg-sidebar">
                <div className="flex h-16 items-center border-b px-5">
                    <Link href="/dashboard" aria-label="Nexova — dashboard">
                        <Logo className="h-6" />
                    </Link>
                </div>
                <SidebarNav unread={unread} />
                <div className="border-t p-3">
                    <div className="flex items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-xs font-semibold text-white">
                            {initial}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                                {displayName}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                                {member?.role ?? user.email}
                            </p>
                        </div>
                        <SignOutButton />
                    </div>
                </div>
            </aside>

            {/* Top bar (mobile) */}
            <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:hidden">
                <Link href="/dashboard" aria-label="Nexova — dashboard">
                    <Logo className="h-5" />
                </Link>
                <div className="flex items-center gap-3">
                    <Link
                        href="/notifications"
                        className="relative inline-flex items-center text-muted-foreground"
                        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
                    >
                        <Bell className="size-5" />
                        {unread > 0 ? (
                            <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                                {unread > 9 ? "9+" : unread}
                            </span>
                        ) : null}
                    </Link>
                    <Link
                        href="/settings"
                        className="flex size-8 items-center justify-center rounded-full bg-brand-gradient text-xs font-semibold text-white"
                        aria-label={`Open settings (signed in as ${displayName})`}
                    >
                        {initial}
                    </Link>
                </div>
            </header>

            <main
                id="main-content"
                className="flex-1 overflow-y-auto bg-muted/40 p-4 pb-24 md:p-8 md:pb-10"
            >
                <div className="mx-auto w-full max-w-6xl">
                    {children}
                </div>
                {/* Shared datalists used by autocomplete inputs across forms */}
                <ClientNameDatalist />
                <ServiceNameDatalist />
            </main>

            <MobileNav unread={unread} />
        </div>
    );
}
