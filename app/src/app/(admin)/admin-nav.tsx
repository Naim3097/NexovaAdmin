"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
    LayoutDashboard,
    Users,
    Briefcase,
    KanbanSquare,
    Megaphone,
    FileText,
    ScrollText,
    Receipt,
    Settings,
    ClipboardList,
    UserCog,
    CheckSquare,
    ListTodo,
    Activity,
    BarChart3,
    Bell,
    Search,
    Building2,
    LayoutGrid,
    FileBarChart,
    X,
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
            { href: "/tasks", label: "Tasks", icon: ListTodo },
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
            { href: "/settings/clients", label: "Clients", icon: Building2 },
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
        items: [
            { href: "/quotes", label: "Quotations", icon: ScrollText },
            { href: "/invoices", label: "Invoices", icon: Receipt },
        ],
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

/** Four fixed tabs + "More" (everything else). Role-aware. */
const MOBILE_ADMIN: Item[] = [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard },
    { href: "/leads", label: "Leads", icon: Users },
    { href: "/projects", label: "Projects", icon: Briefcase },
    { href: "/invoices", label: "Invoices", icon: Receipt },
];
const MOBILE_STANDARD: Item[] = [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard },
    { href: "/tasks", label: "Tasks", icon: ListTodo },
    { href: "/content", label: "Content", icon: FileText },
    { href: "/projects", label: "Projects", icon: Briefcase },
];

function isActive(pathname: string, href: string) {
    // Clients lives at /settings/clients but is its own nav entry — don't
    // light up Settings for it.
    if (href === "/settings" && pathname.startsWith("/settings/clients")) {
        return false;
    }
    return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Access-filtered sections: standard (non-admin) users lose Finance and Team,
 * and the admin-only financial Reports hub is replaced by the two surfaces
 * they can use — Weekly updates and Client reports. The pages themselves are
 * guarded server-side (requireAdminAccess / requireTeamAccess) — this only
 * keeps the nav honest.
 */
function sectionsFor(isAdmin: boolean) {
    if (isAdmin) return SECTIONS;
    return SECTIONS.map((sec) => {
        if (sec.label === "Finance") return null;
        if (sec.label === "Admin") {
            return {
                ...sec,
                items: sec.items.filter((i) => i.href !== "/team"),
            };
        }
        if (sec.label === "Workspace") {
            // The financial Reports hub is admin-only, but client monthly
            // reports are the whole team's deliverable — surface them
            // directly so standard members don't need the hub (or a URL).
            return {
                ...sec,
                items: sec.items.flatMap((i) =>
                    i.href === "/reports"
                        ? [
                              {
                                  ...i,
                                  href: "/reports/weekly",
                                  label: "Weekly updates",
                              },
                              {
                                  href: "/reports/client",
                                  label: "Client reports",
                                  icon: FileBarChart,
                              },
                          ]
                        : [i],
                ),
            };
        }
        return sec;
    }).filter((s): s is (typeof SECTIONS)[number] => s !== null);
}

export function SidebarNav({
    unread,
    isAdmin = true,
}: {
    unread: number;
    isAdmin?: boolean;
}) {
    const pathname = usePathname();
    return (
        <nav aria-label="Primary" className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
            {sectionsFor(isAdmin).map((section) => (
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
                                            "relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                            active
                                                ? "bg-gradient-to-r from-primary/12 to-primary/[0.04] font-medium text-primary"
                                                : "text-muted-foreground hover:bg-accent hover:text-foreground",
                                        )}
                                    >
                                        {active ? (
                                            <span
                                                aria-hidden="true"
                                                className="absolute left-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-brand-gradient"
                                            />
                                        ) : null}
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

export function MobileNav({
    unread,
    isAdmin = true,
}: {
    unread: number;
    isAdmin?: boolean;
}) {
    const pathname = usePathname();
    const [moreOpen, setMoreOpen] = useState(false);
    const items = isAdmin ? MOBILE_ADMIN : MOBILE_STANDARD;
    const tabHrefs = new Set(items.map((i) => i.href));
    // "More" is active when the current page isn't one of the fixed tabs.
    const moreActive =
        !moreOpen && !items.some((i) => isActive(pathname, i.href));

    return (
        <>
            {moreOpen ? (
                <div
                    className="canvas-glow fixed inset-0 z-40 bg-background md:hidden"
                    role="dialog"
                    aria-label="All pages"
                >
                    <div className="flex h-14 items-center justify-between border-b px-4">
                        <span className="font-semibold">Menu</span>
                        <button
                            type="button"
                            onClick={() => setMoreOpen(false)}
                            aria-label="Close menu"
                            className="rounded-md p-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <X className="size-5" />
                        </button>
                    </div>
                    <div className="space-y-5 overflow-y-auto p-4 pb-24" style={{ maxHeight: "calc(100dvh - 3.5rem)" }}>
                        {sectionsFor(isAdmin).map((section) => (
                            <div key={section.label}>
                                <p className="pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                                    {section.label}
                                </p>
                                <div className="grid grid-cols-3 gap-2">
                                    {section.items.map(
                                        ({ href, label, icon: Icon }) => {
                                            const active = isActive(
                                                pathname,
                                                href,
                                            );
                                            return (
                                                <Link
                                                    key={href}
                                                    href={href}
                                                    onClick={() =>
                                                        setMoreOpen(false)
                                                    }
                                                    aria-current={
                                                        active
                                                            ? "page"
                                                            : undefined
                                                    }
                                                    className={cn(
                                                        "relative flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                                        active
                                                            ? "border-primary/40 bg-primary/10 text-primary"
                                                            : "border-border/60 bg-card text-muted-foreground shadow-xs hover:bg-accent hover:text-foreground",
                                                    )}
                                                >
                                                    <Icon className="size-5" />
                                                    {label}
                                                    {href ===
                                                        "/notifications" &&
                                                    unread > 0 ? (
                                                        <span className="absolute right-2 top-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                                                            {unread > 9
                                                                ? "9+"
                                                                : unread}
                                                        </span>
                                                    ) : null}
                                                </Link>
                                            );
                                        },
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            <nav
                aria-label="Primary"
                className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-border/60 bg-background/70 backdrop-blur-xl md:hidden"
            >
                {items.map(({ href, label, icon: Icon }) => {
                    const active = !moreOpen && isActive(pathname, href);
                    return (
                        <Link
                            key={href}
                            href={href}
                            onClick={() => setMoreOpen(false)}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                                "relative flex min-h-14 flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                active ? "text-primary" : "text-muted-foreground",
                            )}
                        >
                            {active ? (
                                <span
                                    aria-hidden="true"
                                    className="absolute top-0 h-0.5 w-8 rounded-full bg-brand-gradient"
                                />
                            ) : null}
                            <Icon className="size-5" aria-hidden="true" />
                            {label}
                        </Link>
                    );
                })}
                <button
                    type="button"
                    onClick={() => setMoreOpen((v) => !v)}
                    aria-expanded={moreOpen}
                    className={cn(
                        "relative flex min-h-14 flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        moreOpen || moreActive
                            ? "text-primary"
                            : "text-muted-foreground",
                    )}
                >
                    <LayoutGrid className="size-5" aria-hidden="true" />
                    More
                    {unread > 0 && !tabHrefs.has("/notifications") ? (
                        <span className="absolute right-[22%] top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                            {unread > 9 ? "9+" : unread}
                        </span>
                    ) : null}
                </button>
            </nav>
        </>
    );
}
