/**
 * List · Board · Calendar switch at the top of a Static posts or Video posts
 * page. The three views of one kind link to each other the same way, and
 * `?as=` (who you are acting as) rides along so switching views keeps it.
 */
import Link from "next/link";
import { CONTENT_VIEWS, kindHref, type ContentKind, type ContentView } from "@/lib/content/kind";
import { cn } from "@/lib/utils";

const VIEW_LABEL: Record<ContentView, string> = {
    list: "List",
    board: "Review board",
    calendar: "Calendar",
};

export function ContentViewLinks({
    kind,
    current,
    as,
}: {
    kind: ContentKind;
    current: ContentView;
    as?: string;
}) {
    return (
        <nav aria-label="Views" className="flex items-center gap-1 rounded-lg border bg-card p-1 text-sm">
            {CONTENT_VIEWS.map((v) => (
                <Link
                    key={v}
                    href={kindHref(kind, v, { as })}
                    aria-current={v === current ? "page" : undefined}
                    className={cn(
                        "rounded-md px-3 py-1",
                        v === current
                            ? "bg-primary font-medium text-primary-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                >
                    {VIEW_LABEL[v]}
                </Link>
            ))}
        </nav>
    );
}
