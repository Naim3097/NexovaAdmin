"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
    type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon };

const SECTIONS: { label: string; items: Item[] }[] = [
    {
        label: "Overview",
        items: [
            { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
            { href: "/my-work", label: "My work", icon: CheckSquare },
        ],
    },
    {
        label: "Sales",
        items: [
            { href: "/leads", label: "Leads", icon: Users },
            { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
        ],
    },
    {
        label: "Delivery",
        items: [
            { href: "/onboarding", label: "Onboarding", icon: ClipboardList },
            { href: "/projects", label: "Projects", icon: Briefcase },
        ],
    },
    {
        label: "Marketing",
        items: [
            { href: "/campaigns", label: "Campaigns", icon: Megaphone },
            { href: "/content", label: "Content", icon: FileText },
            { href: "/seo", label: "SEO", icon: Search },
        ],
    },
    {
        label: "Finance",
        items: [{ href: "/invoices", label: "Invoices", icon: Receipt }],
    },
    {
        label: "Workspace",
        items: [
            { href: "/activity", label: "Activity", icon: Activity },
            { href: "/notifications", label: "Inbox", icon: Bell },
            { href: "/reports", label: "Reports", icon: BarChart3 },
        ],
    },
    {
        label: "Admin",
        items: [
            { href: "/team", label: "Team", icon: UserCog },
            { href: "/settings", label: "Settings", icon: Settings },
        ],
    },
];

const MOBILE: Item[] = [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard },
    { href: "/leads", label: "Leads", icon: Users },
    { href: "/projects", label: "Projects", icon: Briefcase },
    { href: "/invoices", label: "Invoices", icon: Receipt },
    { href: "/notifications", label: "Inbox", icon: Bell },
];

function isActive(pathname: string, href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ unread }: { unread: number }) {
    const pathname = usePathname();
    return (
        <nav aria-label="Primary" className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
            {SECTIONS.map((section) => (
                <div key={section.label}>
                    <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                        {section.label}
                    </p>
                    <ul className="space-y-0.5">
                        {section.items.map(({ href, label, icon: Icon }) => {
                            const active = isActive(pathname, href);
                            return (
                                <li key={href}>
                                    <Link
                                        href={href}
                                        aria-current={active ? "page" : undefined}
                                        className={cn(
                                            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                            active
                                                ? "bg-primary/10 font-medium text-primary"
                                                : "text-muted-foreground hover:bg-accent hover:text-foreground",
                                        )}
                                    >
                                        <Icon
                                            className={cn(
                                                "size-4 shrink-0",
                                                active
                                                    ? "text-primary"
                                                    : "text-muted-foreground/80",
                                            )}
                                            aria-hidden="true"
                                        />
                                        <span className="flex-1">{label}</span>
                                        {href === "/notifications" && unread > 0 ? (
                                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                                                {unread > 99 ? "99+" : unread}
                                            </span>
                                        ) : null}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ))}
        </nav>
    );
}

export function MobileNav({ unread }: { unread: number }) {
    const pathname = usePathname();
    return (
        <nav
            aria-label="Primary"
            className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t bg-background/95 backdrop-blur md:hidden"
        >
            {MOBILE.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                    <Link
                        key={href}
                        href={href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                            "relative flex min-h-14 flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            active ? "text-primary" : "text-muted-foreground",
                        )}
                    >
                        <Icon className="size-5" aria-hidden="true" />
                        {label}
                        {href === "/notifications" && unread > 0 ? (
                            <span className="absolute right-[22%] top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                                {unread > 9 ? "9+" : unread}
                            </span>
                        ) : null}
                    </Link>
                );
            })}
        </nav>
    );
}
