"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
    ClipboardCheck,
    ClipboardList,
    FileText,
    Home,
    Images,
    Receipt,
} from "lucide-react";

const NAV = [
    { href: "/portal", label: "Home", icon: Home },
    { href: "/portal/approvals", label: "Approvals", icon: ClipboardCheck },
    { href: "/portal/content", label: "Content", icon: Images },
    { href: "/portal/reports", label: "Reports", icon: FileText },
    { href: "/portal/billing", label: "Billing", icon: Receipt },
    { href: "/portal/onboarding", label: "Forms", icon: ClipboardList },
];

/**
 * Items waiting on the client, for the Approvals badge. A real login gets one
 * number; the dev preview (no client login) gets a count per client name
 * (lower-cased) and picks by the `?client=` in the URL.
 */
export type PortalWaiting = number | Record<string, number>;

export function PortalNav({
    waiting,
    preview,
}: {
    waiting: PortalWaiting;
    preview: boolean;
}) {
    const params = useSearchParams();
    const pathname = usePathname();
    const client = preview ? (params.get("client") ?? "").trim() : "";
    const count =
        typeof waiting === "number"
            ? waiting
            : (waiting[client.toLowerCase()] ?? 0);
    const href = (path: string) =>
        client ? `${path}?client=${encodeURIComponent(client)}` : path;

    return (
        <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-border/60 bg-background/70 backdrop-blur-xl">
            {client ? (
                <p className="border-b border-amber-400/40 bg-amber-50 px-3 py-1 text-center text-[10px] text-amber-800">
                    Dev preview · acting as {client}
                </p>
            ) : null}
            <div className="grid grid-cols-6">
                {NAV.map(({ href: path, label, icon: Icon }) => {
                    const active =
                        pathname === path ||
                        (path !== "/portal" && pathname.startsWith(`${path}/`));
                    const badge = path === "/portal/approvals" ? count : 0;
                    return (
                        <Link
                            key={path}
                            href={href(path)}
                            aria-current={active ? "page" : undefined}
                            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors hover:text-foreground ${
                                active ? "text-foreground" : "text-muted-foreground"
                            }`}
                        >
                            <span className="relative">
                                <Icon className="size-5" />
                                {badge > 0 ? (
                                    <span
                                        aria-label={`${badge} waiting`}
                                        className="absolute -right-2 -top-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[9px] font-semibold leading-4 text-primary-foreground"
                                    >
                                        {badge > 99 ? "99+" : badge}
                                    </span>
                                ) : null}
                            </span>
                            {label}
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
