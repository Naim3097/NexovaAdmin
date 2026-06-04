import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
    ACTIVITY_ENTITIES,
    listActivityFiltered,
    type ActivityEntity,
    type ActivityEvent,
} from "@/lib/activity";

export const dynamic = "force-dynamic";

const RANGES: Array<{ key: string; label: string; days: number }> = [
    { key: "1d", label: "24h", days: 1 },
    { key: "7d", label: "7 days", days: 7 },
    { key: "30d", label: "30 days", days: 30 },
    { key: "90d", label: "90 days", days: 90 },
    { key: "all", label: "All time", days: 0 },
];

const ENTITY_LABEL: Record<ActivityEntity, string> = {
    lead: "Leads",
    project: "Projects",
    invoice: "Invoices",
    content: "Content",
    campaign: "Campaigns",
    onboarding: "Onboarding",
};

const KIND_TONE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
    "lead.created": "secondary",
    "lead.status": "default",
    "project.created": "secondary",
    "project.status": "default",
    "project.phase": "default",
    "project.task": "outline",
    "project.deliverable": "outline",
    "project.deliverable_approved": "default",
    "project.signoff": "default",
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

function fmtRelative(iso: string): string {
    const diff = Date.now() - Date.parse(iso);
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

function dayLabel(iso: string): string {
    const today = new Date().toISOString().slice(0, 10);
    const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (iso === today) return "Today";
    if (iso === yest) return "Yesterday";
    return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export default async function ActivityPage({
    searchParams,
}: {
    searchParams: Promise<{ entity?: string; range?: string }>;
}) {
    const sp = await searchParams;
    const entityParam = (sp.entity ?? "all") as "all" | ActivityEntity;
    const rangeKey = sp.range ?? "30d";
    const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[2];

    const events = await listActivityFiltered({
        entity: entityParam,
        sinceDays: range.days || undefined,
        limit: 500,
    });

    const grouped = groupByDay(events);
    const dayKeys = [...grouped.keys()].sort((a, b) => b.localeCompare(a));

    const filterHref = (
        next: Partial<{ entity: string; range: string }>,
    ) => {
        const params = new URLSearchParams();
        const e = next.entity ?? entityParam;
        const r = next.range ?? rangeKey;
        if (e !== "all") params.set("entity", e);
        if (r !== "30d") params.set("range", r);
        const qs = params.toString();
        return qs ? `/activity?${qs}` : "/activity";
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold md:text-3xl">Activity</h1>
                <p className="text-sm text-muted-foreground">
                    Unified timeline across leads, projects, invoices, content,
                    and campaigns. Derived from existing records — no separate
                    log to maintain.
                </p>
            </div>

            {/* Filters */}
            <div className="space-y-3 rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium uppercase text-muted-foreground">
                        Entity:
                    </span>
                    <Link
                        href={filterHref({ entity: "all" })}
                        className={`rounded-md border px-2.5 py-1 text-xs ${entityParam === "all"
                                ? "bg-foreground text-background"
                                : "hover:bg-accent"
                            }`}
                    >
                        All
                    </Link>
                    {ACTIVITY_ENTITIES.map((e) => (
                        <Link
                            key={e}
                            href={filterHref({ entity: e })}
                            className={`rounded-md border px-2.5 py-1 text-xs ${entityParam === e
                                    ? "bg-foreground text-background"
                                    : "hover:bg-accent"
                                }`}
                        >
                            {ENTITY_LABEL[e]}
                        </Link>
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium uppercase text-muted-foreground">
                        Range:
                    </span>
                    {RANGES.map((r) => (
                        <Link
                            key={r.key}
                            href={filterHref({ range: r.key })}
                            className={`rounded-md border px-2.5 py-1 text-xs ${rangeKey === r.key
                                    ? "bg-foreground text-background"
                                    : "hover:bg-accent"
                                }`}
                        >
                            {r.label}
                        </Link>
                    ))}
                </div>
            </div>

            {/* Summary */}
            <p className="text-sm text-muted-foreground">
                {events.length} event{events.length === 1 ? "" : "s"}
                {events.length === 500 ? " (capped at 500)" : ""}.
            </p>

            {/* Timeline */}
            {events.length === 0 ? (
                <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
                    No activity in this range.
                </div>
            ) : (
                <div className="space-y-6">
                    {dayKeys.map((day) => {
                        const items = grouped.get(day)!;
                        return (
                            <section key={day} className="space-y-2">
                                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    {dayLabel(day)} · {items.length} event
                                    {items.length === 1 ? "" : "s"}
                                </h2>
                                <ul className="divide-y rounded-lg border bg-card">
                                    {items.map((e) => (
                                        <li
                                            key={e.id}
                                            className="flex flex-col gap-1 p-3 md:flex-row md:items-start md:justify-between md:gap-3 md:p-4"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Badge
                                                        variant={
                                                            KIND_TONE[e.kind] ??
                                                            "outline"
                                                        }
                                                    >
                                                        {e.kind}
                                                    </Badge>
                                                    <Link
                                                        href={e.href}
                                                        className="font-medium hover:underline"
                                                    >
                                                        {e.title}
                                                    </Link>
                                                </div>
                                                {e.detail ? (
                                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                                        {e.detail}
                                                        {e.actor
                                                            ? ` · ${e.actor}`
                                                            : ""}
                                                    </p>
                                                ) : e.actor ? (
                                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                                        {e.actor}
                                                    </p>
                                                ) : null}
                                            </div>
                                            <div className="text-right text-xs text-muted-foreground">
                                                <div>{fmtRelative(e.at)}</div>
                                                <div className="opacity-60">
                                                    {new Date(e.at).toLocaleTimeString(
                                                        undefined,
                                                        {
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                        },
                                                    )}
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
