/**
 * The manager's Attention list: the ranked decisions from the management
 * overview, one line each — dot · what · who · open. The top MAX_DECISIONS
 * show; the rest sit behind a "Show all N" that opens in place (a plain
 * <details>, so it needs no client JavaScript), because the old Management
 * detail pages are retired and the Dashboard is where the full list lives.
 * Server component — no state.
 */
import Link from "next/link";
import type { TeamMember } from "@/lib/data/team";
import type { Decision } from "@/lib/management/overview";
import { Empty, HealthDot } from "@/app/(admin)/management/ui";

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Where a decision should open. The overview still points a few kinds at the
 * retired /management pages; send those to the page that fixes them now: an
 * overloaded person to their team page, anything else on people to /team,
 * open seats to the unassigned task list.
 */
function targetOf(d: Decision, team: TeamMember[]): string {
    if (!d.href.startsWith("/management")) return d.href;
    if (d.kind === "member_overloaded") {
        const m = team.find((x) => norm(x.name) === norm(d.title));
        return m ? `/team/${m.id}` : "/team";
    }
    if (d.kind === "share_unassigned" || d.href.startsWith("/management/work")) return "/works?unassigned=1";
    return "/team";
}

function Row({ d, team }: { d: Decision; team: TeamMember[] }) {
    const href = targetOf(d, team);
    return (
        <li className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-sm">
            <HealthDot health={d.severity} />
            <Link href={href} className="min-w-0 flex-1 basis-64 font-medium hover:underline" title={d.reason}>
                {d.short}
            </Link>
            <span className="text-xs text-muted-foreground">{d.owner || "You"}</span>
            <Link href={href} className="text-xs underline">
                open
            </Link>
        </li>
    );
}

export function AttentionList({ items, all, team }: { items: Decision[]; all: Decision[]; team: TeamMember[] }) {
    if (items.length === 0) return <Empty>Nothing needs your call.</Empty>;
    // `all` is ranked the same way and starts with `items`, so the rest picks up where the top list stops.
    const rest = all.slice(items.length);
    const key = (d: Decision, i: number) => `${d.kind}-${d.href}-${i}`;
    return (
        <>
            <ol className="divide-y">
                {items.map((d, i) => (
                    <Row key={key(d, i)} d={d} team={team} />
                ))}
            </ol>
            {rest.length > 0 ? (
                <details className="group border-t">
                    <summary className="cursor-pointer list-none py-2 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                        <span className="underline group-open:hidden">Show all {all.length}</span>
                        <span className="hidden underline group-open:inline">Show the top {items.length} only</span>
                    </summary>
                    <ol className="divide-y border-t">
                        {rest.map((d, i) => (
                            <Row key={key(d, items.length + i)} d={d} team={team} />
                        ))}
                    </ol>
                </details>
            ) : null}
        </>
    );
}
