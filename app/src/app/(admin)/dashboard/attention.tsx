/**
 * The manager's Attention list: the ranked decisions from the management
 * overview, one line each — dot · what · who · open. At most MAX_DECISIONS.
 * Server component — no state.
 */
import Link from "next/link";
import type { Decision } from "@/lib/management/overview";
import { Empty, HealthDot } from "@/app/(admin)/management/ui";

export function AttentionList({ items, more }: { items: Decision[]; more: number }) {
    if (items.length === 0) return <Empty>Nothing needs your call.</Empty>;
    return (
        <>
            <ol className="divide-y">
                {items.map((d, i) => (
                    <li key={`${d.kind}-${d.href}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-sm">
                        <HealthDot health={d.severity} />
                        <Link href={d.href} className="min-w-0 flex-1 basis-64 font-medium hover:underline">
                            {d.short}
                        </Link>
                        <span className="text-xs text-muted-foreground">{d.owner || "You"}</span>
                        <Link href={d.href} className="text-xs underline">
                            open
                        </Link>
                    </li>
                ))}
            </ol>
            {more > 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                    +{more} more in{" "}
                    <Link href="/management/team" className="underline">
                        Management detail
                    </Link>
                    .
                </p>
            ) : null}
        </>
    );
}
