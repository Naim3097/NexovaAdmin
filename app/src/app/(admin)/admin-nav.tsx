"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LayoutGrid, UserRound, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * What the layout hands over. Visibility is decided on the server (the
 * (admin) layout runs `canSee` per item and drops empty sections) because
 * `@/lib/roles` reaches the data layer and cannot be bundled for the client.
 * Icons arrive pre-rendered; sizing and colour are applied here per surface.
 */
export type NavItem = { href: string; label: string; icon: ReactNode };
export type NavSection = { label: string; items: NavItem[] };

/** Neon count pill for unattended auto-intake leads on the Leads nav item. */
function FreshLeadsPill({
    count,
    small = false,
}: {
    count: number;
    small?: boolean;
}) {
    if (count <= 0) return null;
    return (
        <span
            className={cn(
                "inline-flex items-center justify-center rounded-full bg-[#39FF14] font-semibold text-black shadow-[0_0_8px_rgba(57,255,20,0.6)]",
                small
                    ? "h-4 min-w-4 px-1 text-[9px]"
                    : "h-5 min-w-5 px-1.5 text-[10px]",
            )}
        >
            {count > 99 ? "99+" : count}
        </span>
    );
}

/** Wraps a server-rendered icon so each surface can size and colour it. */
function NavIcon({ icon, className }: { icon: ReactNode; className?: string }) {
    return (
        <span
            aria-hidden="true"
            className={cn("inline-flex shrink-0 items-center justify-center", className)}
        >
            {icon}
        </span>
    );
}

function isActive(pathname: string, href: string) {
    // Clients lives at /settings/clients but is its own nav entry — don't
    // light up Settings for it.
    if (href === "/settings" && pathname.startsWith("/settings/clients")) {
        return false;
    }
    return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({
    sections,
    unread,
    freshLeads = 0,
}: {
    sections: NavSection[];
    unread: number;
    /** Unattended auto-intake leads — neon pill on the Leads item while > 0. */
    freshLeads?: number;
}) {
    const pathname = usePathname();
    return (
        <nav aria-label="Primary" className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
            {sections.map((section) => (
                <div key={section.label}>
                    <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                        {section.label}
                    </p>
                    <ul className="space-y-0.5">
                        {section.items.map(({ href, label, icon }) => {
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
                                        <NavIcon
                                            icon={icon}
                                            className={cn(
                                                "[&>svg]:size-4",
                                                active
                                                    ? "text-primary"
                                                    : "text-muted-foreground/80",
                                            )}
                                        />
                                        <span className="flex-1">{label}</span>
                                        {href === "/leads" ? (
                                            <FreshLeadsPill count={freshLeads} />
                                        ) : null}
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
    sections,
    tabs,
    unread,
    freshLeads = 0,
}: {
    sections: NavSection[];
    /** Fixed bottom tabs for this role; "More" (everything else) is appended here. */
    tabs: NavItem[];
    unread: number;
    /** Unattended auto-intake leads — neon pill on the Leads item while > 0. */
    freshLeads?: number;
}) {
    const pathname = usePathname();
    const [moreOpen, setMoreOpen] = useState(false);
    const tabHrefs = new Set(tabs.map((i) => i.href));
    // "More" is active when the current page isn't one of the fixed tabs.
    const moreActive =
        !moreOpen && !tabs.some((i) => isActive(pathname, i.href));

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
                        {sections.map((section) => (
                            <div key={section.label}>
                                <p className="pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                                    {section.label}
                                </p>
                                <div className="grid grid-cols-3 gap-2">
                                    {section.items.map(
                                        ({ href, label, icon }) => {
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
                                                    <NavIcon icon={icon} className="[&>svg]:size-5" />
                                                    {label}
                                                    {href === "/leads" &&
                                                    freshLeads > 0 ? (
                                                        <span className="absolute right-2 top-2">
                                                            <FreshLeadsPill
                                                                count={
                                                                    freshLeads
                                                                }
                                                                small
                                                            />
                                                        </span>
                                                    ) : null}
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
                        {/* Everyone has a profile; it is not part of any role's section. */}
                        <div>
                            <p className="pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                                You
                            </p>
                            <div className="grid grid-cols-3 gap-2">
                                <Link
                                    href="/profile"
                                    onClick={() => setMoreOpen(false)}
                                    aria-current={isActive(pathname, "/profile") ? "page" : undefined}
                                    className={cn(
                                        "relative flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        isActive(pathname, "/profile")
                                            ? "border-primary/40 bg-primary/10 text-primary"
                                            : "border-border/60 bg-card text-muted-foreground shadow-xs hover:bg-accent hover:text-foreground",
                                    )}
                                >
                                    <UserRound className="size-5" aria-hidden="true" />
                                    Profile
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            <nav
                aria-label="Primary"
                className="fixed inset-x-0 bottom-0 z-50 grid border-t border-border/60 bg-background/70 backdrop-blur-xl md:hidden"
                style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}
            >
                {tabs.map(({ href, label, icon }) => {
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
                            <NavIcon icon={icon} className="[&>svg]:size-5" />
                            {label}
                            {href === "/leads" && freshLeads > 0 ? (
                                <span className="absolute right-[22%] top-1.5">
                                    <FreshLeadsPill count={freshLeads} small />
                                </span>
                            ) : null}
                            {href === "/notifications" && unread > 0 ? (
                                <span className="absolute right-[22%] top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                                    {unread > 9 ? "9+" : unread}
                                </span>
                            ) : null}
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
