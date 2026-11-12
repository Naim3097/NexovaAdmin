/**
 * Activity tab: the unified timeline across leads, projects, tasks,
 * invoices, content and campaigns, grouped by day, with the entity and
 * range filters as dropdowns. Derived from existing records — no separate
 * log. Server component — no state.
 */
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SelectNav } from "@/components/select-nav";
import { ACTIVITY_ENTITIES, type ActivityEntity, type ActivityEvent } from "@/lib/activity";
import { DEFAULT_RANGE } from "./href";

export const RANGES: Array<{ key: string; label: string; days: number }> = [
    { key: "1d", label: "24h", days: 1 },
    { key: "7d", label: "7 days", days: 7 },
    { key: DEFAULT_RANGE, label: "30 days", days: 30 },
    { key: "90d", label: "90 days", days: 90 },
    { key: "all", label: "All time", days: 0 },
];

/** The feed never shows more than this many events. */
export const FEED_LIMIT = 500;

export const ENTITY_LABEL: Record<ActivityEntity, string> = {
    lead: "Leads",
    contract: "Projects",
    task: "Tasks",
    invoice: "Invoices",
    content: "Content",
    campaign: "Campaigns",
    onboarding: "Onboarding",
};

const KIND_TONE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
    "lead.created": "secondary",
    "lead.status": "default",
    "contract.created": "secondary",
    "contract.signed": "default",
    "task.submitted": "outline",
    "task.completed": "default",
    "invoice.created": "secondary",
    "invoice.sent": "default",
    "invoice.paid": "default",
    "content.scheduled": "outline",
    "content.posted": "default",
    "campaign.created": "secondary",
    "campaign.metric": "outline",
    "onboarding.created": "secondary",
    "onboarding.submitted": "default",
};

export type ActivityParams = { entity: "all" | ActivityEntity; range: (typeof RANGES)[number] };

/** The entity and range from the URL; anything unknown falls back to everything, last 30 days. */
export function parseActivityParams(entity: string, range: string): ActivityParams {
    const e = (ACTIVITY_ENTITIES as readonly string[]).includes(entity) ? (entity as ActivityEntity) : "all";
    const r = RANGES.find((x) => x.key === range) ?? RANGES.find((x) => x.key === DEFAULT_RANGE)!;
    return { entity: e, range: r };
}

function fmtRelative(iso: string, nowMs: number): string {
    const diff = nowMs - Date.parse(iso);
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    const mo = Math.floor(d / 30);
    if (mo < 12) return `${mo}mo ago`;
    return `${Math.floor(mo / 12)}y ago`;
}

function groupByDay(events: ActivityEvent[]): Map<string, ActivityEvent[]> {
    const map = new Map<string, ActivityEvent[]>();
    for (const e of events) {
        const day = e.at.slice(0, 10);
        const arr = map.get(day) ?? [];
        arr.push(e);
        map.set(day, arr);
    }
    return map;
}

function dayLabel(iso: string, today: string): string {
    const yest = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    if (iso === today) return "Today";
    if (iso === yest) return "Yesterday";
    return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export function ActivityFeed({
    events,
    params,
    today,
    hrefFor,
}: {
    events: ActivityEvent[];
    params: ActivityParams;
    /** YYYY-MM-DD, for "Today" / "Yesterday" and the relative times. */
    today: string;
    /** Dashboard link with one filter changed. */
    hrefFor: (next: Partial<{ entity: string; range: string }>) => string;
}) {
    const nowMs = Date.parse(`${today}T23:59:59Z`);
    const grouped = groupByDay(events);
    const dayKeys = [...grouped.keys()].sort((a, b) => b.localeCompare(a));

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <SelectNav
                    label="Show"
                    value={params.entity}
                    options={[
                        { value: "all", label: "Everything", href: hrefFor({ entity: "all" }) },
                        ...ACTIVITY_ENTITIES.map((e) => ({ value: e, label: ENTITY_LABEL[e], href: hrefFor({ entity: e }) })),
                    ]}
                />
                <SelectNav label="Range" value={params.range.key} options={RANGES.map((r) => ({ value: r.key, label: r.label, href: hrefFor({ range: r.key }) }))} />
                <p className="text-xs text-muted-foreground">
                    {events.length} event{events.length === 1 ? "" : "s"}
                    {events.length >= FEED_LIMIT ? ` (first ${FEED_LIMIT})` : ""}
                </p>
            </div>

            {events.length === 0 ? (
                <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">No activity in this range.</div>
            ) : (
                <div className="space-y-6">
                    {dayKeys.map((day) => {
                        const items = grouped.get(day)!;
                        return (
                            <section key={day} className="space-y-2">
                                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    {dayLabel(day, today)} · {items.length} event{items.length === 1 ? "" : "s"}
                                </h2>
                                <ul className="divide-y rounded-lg border bg-card">
                                    {items.map((e) => (
                                        <li key={e.id} className="flex flex-col gap-1 p-3 md:flex-row md:items-start md:justify-between md:gap-3 md:p-4">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Badge variant={KIND_TONE[e.kind] ?? "outline"}>{e.kind}</Badge>
                                                    <Link href={e.href} className="font-medium hover:underline">
                                                        {e.title}
                                                    </Link>
                                                </div>
                                                {e.detail ? (
                                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                                        {e.detail}
                                                        {e.actor ? ` · ${e.actor}` : ""}
                                                    </p>
                                                ) : e.actor ? (
                                                    <p className="mt-0.5 text-xs text-muted-foreground">{e.actor}</p>
                                                ) : null}
                                            </div>
                                            <div className="text-right text-xs text-muted-foreground">
                                                <div>{fmtRelative(e.at, nowMs)}</div>
                                                <div className="opacity-60">
                                                    {new Date(e.at).toLocaleTimeString(undefined, {
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    })}
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
