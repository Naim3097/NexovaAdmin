/**
 * The Dashboard tab row: one small text link per tab, the open one bold.
 * Tabs are the filter; the row starts at Delivery, which is also where a
 * plain /dashboard opens. Server component — the active tab comes from the URL.
 */
import Link from "next/link";
import { DASHBOARD_TAB_LABEL, type DashboardTab } from "@/lib/roles";
import { cn } from "@/lib/utils";

export function DashboardTabs({
    tabs,
    active,
    hrefFor,
}: {
    tabs: DashboardTab[];
    active: DashboardTab;
    hrefFor: (tab: DashboardTab) => string;
}) {
    if (tabs.length <= 1) return null;
    return (
        <nav aria-label="Dashboard tabs" className="-mx-1 overflow-x-auto">
            <ul className="flex min-w-max items-center gap-x-4 px-1 text-sm">
                {tabs.map((t) => {
                    const isActive = t === active;
                    return (
                        <li key={t}>
                            <Link
                                href={hrefFor(t)}
                                aria-current={isActive ? "page" : undefined}
                                className={cn(
                                    "inline-block py-1 underline-offset-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    isActive ? "font-medium text-foreground underline" : "text-muted-foreground hover:text-foreground hover:underline",
                                )}
                            >
                                {DASHBOARD_TAB_LABEL[t]}
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
