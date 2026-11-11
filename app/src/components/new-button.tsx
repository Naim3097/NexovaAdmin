/**
 * The "+ New <thing>" pill every list page puts top-right in its header, as on
 * /contracts: a link dressed as the primary button. Most pages point it at
 * their own folded creation form (`newFormHref` → `?new=1#new`, which opens the
 * NewSection below and scrolls to it); /contracts points it at /contracts/new.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function NewButton({ href, children }: { href: string; children: ReactNode }) {
    return (
        <Button nativeButton={false} render={<Link href={href} />}>
            {children}
        </Button>
    );
}

/**
 * `path?<current params>&new=1#new`: the same page, its filters and `?as=`
 * kept, with the creation form open. Empty and undefined values are dropped.
 */
export function newFormHref(path: string, params: Record<string, string | string[] | undefined>): string {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        const s = Array.isArray(v) ? v[0] : v;
        if (s) q.set(k, s);
    }
    q.set("new", "1");
    return `${path}?${q}#new`;
}

/**
 * The creation form folded under a list page's header. Closed unless the URL
 * carries `?new=1`; the summary is the small "New <thing>" heading and opens
 * it by hand too.
 */
export function NewSection({ open, title, children }: { open: boolean; title: string; children: ReactNode }) {
    return (
        <details id="new" open={open} className="rounded-lg border bg-card">
            <summary className="cursor-pointer p-4 text-sm font-medium md:px-6">{title}</summary>
            <div className="border-t p-4 md:p-6">{children}</div>
        </details>
    );
}
