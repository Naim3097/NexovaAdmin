import { redirect } from "next/navigation";
import Link from "next/link";
import {
    LayoutDashboard,
    Users,
    Briefcase,
    KanbanSquare,
    Megaphone,
    FileText,
    Receipt,
    Settings,
    ClipboardList,
    UserCog,
    CheckSquare,
    Activity,
    BarChart3,
    Bell,
    Search,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { ClientNameDatalist } from "@/components/client-name-datalist";
import { ServiceNameDatalist } from "@/components/service-name-datalist";
import { SignOutButton } from "@/components/sign-out-button";
import { unreadCount } from "@/lib/data/notifications";

const NAV = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/my-work", label: "My work", icon: CheckSquare },
    { href: "/leads", label: "Leads", icon: Users },
    { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
    { href: "/onboarding", label: "Onboarding", icon: ClipboardList },
    { href: "/projects", label: "Projects", icon: Briefcase },
    { href: "/campaigns", label: "Campaigns", icon: Megaphone },
    { href: "/content", label: "Content", icon: FileText },
    { href: "/seo", label: "SEO", icon: Search },
    { href: "/invoices", label: "Invoices", icon: Receipt },
    { href: "/activity", label: "Activity", icon: Activity },
    { href: "/notifications", label: "Inbox", icon: Bell },
    { href: "/reports", label: "Reports", icon: BarChart3 },
    { href: "/team", label: "Team", icon: UserCog },
    { href: "/settings", label: "Settings", icon: Settings },
];

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    const unread = await unreadCount().catch(() => 0);

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
            <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:bg-card">
                <div className="flex h-14 items-center border-b px-4 font-semibold">
                    Nexova
                </div>
                <nav aria-label="Primary" className="flex-1 space-y-1 p-2">
                    {NAV.map(({ href, label, icon: Icon }) => (
                        <Link
                            key={href}
                            href={href}
                            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <Icon className="size-4" aria-hidden="true" />
                            <span className="flex-1">{label}</span>
                            {href === "/notifications" && unread > 0 ? (
                                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                                    {unread > 99 ? "99+" : unread}
                                </span>
                            ) : null}
                        </Link>
                    ))}
                </nav>
                <div className="border-t p-3 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{user.email}</span>
                        <SignOutButton />
                    </div>
                </div>
            </aside>

            {/* Top bar (mobile) */}
            <header className="flex h-14 items-center justify-between border-b bg-card px-4 md:hidden">
                <span className="font-semibold">Nexova</span>
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
                    <Link href="/settings" className="text-sm text-muted-foreground" aria-label={`Open settings (signed in as ${user.email})`}>
                        {user.email?.split("@")[0]}
                    </Link>
                </div>
            </header>

            <main id="main-content" className="flex-1 overflow-y-auto p-4 pb-24 md:p-8 md:pb-8">
                {children}
                {/* Shared datalists used by autocomplete inputs across forms */}
                <ClientNameDatalist />
                <ServiceNameDatalist />
            </main>

            {/* Bottom nav (mobile) */}
            <nav
                aria-label="Primary"
                className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t bg-background md:hidden"
            >
                {NAV.slice(0, 5).map(({ href, label, icon: Icon }) => (
                    <Link
                        key={href}
                        href={href}
                        className="flex min-h-12 flex-col items-center justify-center gap-0.5 py-2 text-[10px] text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <Icon className="size-5" aria-hidden="true" />
                        {label}
                    </Link>
                ))}
            </nav>
        </div>
    );
}
