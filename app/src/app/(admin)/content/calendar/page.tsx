import Link from "next/link";
import { listContentPosts, type ContentPost } from "@/lib/data/content";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function parseMonth(input: string | undefined): { year: number; month: number } {
    const now = new Date();
    if (input && /^\d{4}-\d{2}$/.test(input)) {
        const [y, m] = input.split("-").map((s) => Number.parseInt(s, 10));
        return { year: y, month: m - 1 };
    }
    return { year: now.getFullYear(), month: now.getMonth() };
}

function fmtMonthLabel(year: number, month: number) {
    return new Date(year, month, 1).toLocaleString(undefined, {
        month: "long",
        year: "numeric",
    });
}

function shiftMonth(year: number, month: number, delta: number): string {
    const d = new Date(year, month + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function buildGrid(year: number, month: number): Date[] {
    const first = new Date(year, month, 1);
    // Convert to Mon=0..Sun=6
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - offset);
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        days.push(d);
    }
    return days;
}

function isoDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const STATUS_DOT: Record<ContentPost["status"], string> = {
    idea: "bg-muted-foreground/40",
    draft: "bg-blue-500",
    review: "bg-amber-500",
    scheduled: "bg-violet-500",
    posted: "bg-emerald-500",
    archived: "bg-muted-foreground/30",
};

export default async function ContentCalendarPage({
    searchParams,
}: {
    searchParams: Promise<{ m?: string }>;
}) {
    const sp = await searchParams;
    const { year, month } = parseMonth(sp.m);
    const posts = await listContentPosts();
    const days = buildGrid(year, month);
    const todayIso = isoDate(new Date());

    const byDate = new Map<string, ContentPost[]>();
    for (const p of posts) {
        const arr = byDate.get(p.scheduledFor) ?? [];
        arr.push(p);
        byDate.set(p.scheduledFor, arr);
    }

    const prev = shiftMonth(year, month, -1);
    const next = shiftMonth(year, month, +1);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">
                        Content calendar
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {fmtMonthLabel(year, month)}
                    </p>
                </div>
                <div className="flex items-center gap-2 text-sm">
                    <Link
                        href={`/content/calendar?m=${prev}`}
                        className="rounded-md border bg-card px-3 py-1.5 hover:bg-muted"
                    >
                        Prev
                    </Link>
                    <Link
                        href="/content/calendar"
                        className="rounded-md border bg-card px-3 py-1.5 hover:bg-muted"
                    >
                        Today
                    </Link>
                    <Link
                        href={`/content/calendar?m=${next}`}
                        className="rounded-md border bg-card px-3 py-1.5 hover:bg-muted"
                    >
                        Next
                    </Link>
                    <Link
                        href="/content"
                        className="ml-3 text-sm font-medium underline"
                    >
                        List view
                    </Link>
                </div>
            </div>

            <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
                <div className="min-w-[900px] rounded-lg border bg-card md:min-w-0">
                    <div className="grid grid-cols-7 border-b text-xs font-medium text-muted-foreground">
                        {WEEKDAYS.map((d) => (
                            <div key={d} className="px-2 py-2">
                                {d}
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7">
                        {days.map((d) => {
                            const iso = isoDate(d);
                            const inMonth = d.getMonth() === month;
                            const isToday = iso === todayIso;
                            const dayPosts = byDate.get(iso) ?? [];
                            return (
                                <div
                                    key={iso}
                                    className={`min-h-28 border-b border-r p-2 last:border-r-0 ${inMonth ? "" : "bg-muted/30"
                                        }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span
                                            className={`text-xs ${isToday
                                                    ? "rounded-full bg-primary px-2 py-0.5 font-medium text-primary-foreground"
                                                    : inMonth
                                                        ? ""
                                                        : "text-muted-foreground"
                                                }`}
                                        >
                                            {d.getDate()}
                                        </span>
                                        {dayPosts.length > 0 ? (
                                            <span className="text-[10px] text-muted-foreground">
                                                {dayPosts.length}
                                            </span>
                                        ) : null}
                                    </div>
                                    <ul className="mt-1 space-y-1">
                                        {dayPosts.slice(0, 3).map((p) => (
                                            <li key={p.id}>
                                                <Link
                                                    href={`/content/${p.id}`}
                                                    className="flex items-center gap-1.5 truncate rounded px-1 py-0.5 text-xs hover:bg-muted"
                                                    title={`${p.title} · ${p.platform} · ${p.status}`}
                                                >
                                                    <span
                                                        className={`inline-block size-1.5 shrink-0 rounded-full ${STATUS_DOT[p.status]}`}
                                                    />
                                                    <span className="truncate">
                                                        {p.scheduledTime
                                                            ? `${p.scheduledTime} `
                                                            : ""}
                                                        {p.title}
                                                    </span>
                                                </Link>
                                            </li>
                                        ))}
                                        {dayPosts.length > 3 ? (
                                            <li className="px-1 text-[10px] text-muted-foreground">
                                                + {dayPosts.length - 3} more
                                            </li>
                                        ) : null}
                                    </ul>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>Legend:</span>
                {(
                    [
                        "idea",
                        "draft",
                        "review",
                        "scheduled",
                        "posted",
                        "archived",
                    ] as ContentPost["status"][]
                ).map((s) => (
                    <span key={s} className="flex items-center gap-1.5">
                        <span
                            className={`inline-block size-2 rounded-full ${STATUS_DOT[s]}`}
                        />
                        {s}
                    </span>
                ))}
            </div>
        </div>
    );
}
