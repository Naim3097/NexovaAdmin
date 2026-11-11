"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
    { href: "/management/team", label: "Team" },
    { href: "/management/pipeline", label: "Pipeline" },
    { href: "/management/work", label: "Work" },
    { href: "/management/contracts", label: "Contracts" },
    { href: "/management/clients", label: "Clients" },
] as const;

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * The section links as one row of small text links. A chosen month
 * (`?month=YYYY-MM`) rides along so switching section keeps the month.
 */
export function ManagementTabs() {
    return (
        <Suspense fallback={<TabsRow month="" />}>
            <TabsWithMonth />
        </Suspense>
    );
}

function TabsWithMonth() {
    const month = useSearchParams().get("month") ?? "";
    return <TabsRow month={MONTH_RE.test(month) ? month : ""} />;
}

function TabsRow({ month }: { month: string }) {
    const pathname = usePathname();
    return (
        <nav aria-label="Management sections" className="-mx-1 overflow-x-auto">
            <ul className="flex min-w-max items-center gap-x-4 px-1 text-sm">
                {TABS.map((t) => {
                    const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
                    return (
                        <li key={t.href}>
                            <Link
                                href={month ? `${t.href}?month=${month}` : t.href}
                                aria-current={active ? "page" : undefined}
                                className={cn(
                                    "inline-block py-1 underline-offset-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    active ? "font-medium text-foreground underline" : "text-muted-foreground hover:text-foreground hover:underline",
                                )}
                            >
                                {t.label}
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
