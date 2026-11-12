/**
 * Plain bar charts for the dashboard, drawn with divs: no chart library, no
 * client JavaScript. Three shapes cover every tab:
 *  - <BarList>   horizontal bars with a label and a value (people, projects, sources, age buckets)
 *  - <MonthBars> vertical bars per month, one or more series side by side, optional target line
 *  - <Legend>    the series key for MonthBars
 * Server components; links are plain <Link>s so every bar can open the page that fixes it.
 * Lines over time (Money's contracted vs billed, Team's outlook) are <LineChart> in
 * @/components/line-chart, which reuses these tones and this Legend.
 */
import Link from "next/link";
import { cn } from "@/lib/utils";

export type Tone = "green" | "amber" | "red" | "muted" | "primary";

const TONE_BG: Record<Tone, string> = {
    green: "bg-emerald-500/70",
    amber: "bg-amber-500/80",
    red: "bg-red-500/80",
    muted: "bg-muted-foreground/30",
    primary: "bg-primary/70",
};

export type BarRow = {
    key: string;
    label: string;
    value: number;
    /** Text shown at the end of the bar; defaults to the value. */
    valueLabel?: string;
    /** One line under the label. */
    sub?: string;
    tone?: Tone;
    href?: string;
};

/** Horizontal bars. Widths are relative to `max` (default: the largest value). */
export function BarList({ rows, max, className, empty = "Nothing here." }: { rows: BarRow[]; max?: number; className?: string; empty?: string }) {
    const top = max ?? Math.max(0, ...rows.map((r) => r.value));
    if (rows.length === 0) return <p className={cn("text-sm text-muted-foreground", className)}>{empty}</p>;
    return (
        <ul className={cn("space-y-2", className)}>
            {rows.map((r) => {
                const pct = top > 0 ? Math.min(100, Math.round((r.value / top) * 100)) : 0;
                const body = (
                    <>
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="truncate">
                                {r.label}
                                {r.sub ? <span className="ml-1.5 text-xs text-muted-foreground">{r.sub}</span> : null}
                            </span>
                            <span className="shrink-0 text-xs tabular-nums">{r.valueLabel ?? r.value}</span>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded bg-muted">
                            <div className={cn("h-full rounded", TONE_BG[r.tone ?? "primary"])} style={{ width: `${pct}%` }} />
                        </div>
                    </>
                );
                return (
                    <li key={r.key}>
                        {r.href ? (
                            <Link href={r.href} className="block rounded-md px-1 py-0.5 hover:bg-accent">
                                {body}
                            </Link>
                        ) : (
                            <div className="px-1 py-0.5">{body}</div>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}

export type Series = { key: string; label: string; tone: Tone };
export type MonthPoint = {
    /** YYYY-MM. */
    month: string;
    /** Short label under the bar, e.g. "Nov". */
    label: string;
    /** One value per series key; missing = 0. */
    values: Record<string, number>;
    /** Marks months that are in the future (drawn hollow). */
    future?: boolean;
    href?: string;
};

/** "12k" style numbers on the axis and bar tops. */
export function shortNum(n: number): string {
    const a = Math.abs(n);
    if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
    if (a >= 1000) return `${(n / 1000).toFixed(a >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`;
    return String(Math.round(n));
}

/**
 * Vertical bars per month, series side by side. `target` draws a dashed line
 * at that value. Heights are relative to the largest value (or the target).
 */
export function MonthBars({
    points,
    series,
    target,
    format = shortNum,
    height = 160,
    className,
}: {
    points: MonthPoint[];
    series: Series[];
    target?: number;
    format?: (n: number) => string;
    height?: number;
    className?: string;
}) {
    const top = Math.max(1, target ?? 0, ...points.flatMap((p) => series.map((s) => p.values[s.key] ?? 0)));
    const targetPct = target ? Math.min(100, (target / top) * 100) : null;
    return (
        <div className={cn("w-full", className)}>
            <div className="relative" style={{ height }}>
                {targetPct !== null ? (
                    <div className="absolute inset-x-0 border-t border-dashed border-foreground/50" style={{ bottom: `${targetPct}%` }} title={`Target ${format(target!)}`}>
                        <span className="absolute right-0 -top-4 text-[10px] text-muted-foreground">target {format(target!)}</span>
                    </div>
                ) : null}
                <div className="flex h-full items-end gap-2">
                    {points.map((p) => {
                        const bars = series.map((s) => {
                            const v = p.values[s.key] ?? 0;
                            const pct = top > 0 ? (v / top) * 100 : 0;
                            return (
                                <div key={s.key} className="flex h-full flex-1 flex-col justify-end" title={`${s.label} · ${p.label}: ${format(v)}`}>
                                    {v > 0 ? <span className="mb-0.5 text-center text-[10px] tabular-nums text-muted-foreground">{format(v)}</span> : null}
                                    <div
                                        className={cn("w-full rounded-t", p.future ? "border border-dashed bg-transparent" : TONE_BG[s.tone], p.future && "border-foreground/40")}
                                        style={{ height: `${Math.max(v > 0 ? 2 : 0, pct)}%` }}
                                    />
                                </div>
                            );
                        });
                        const inner = <div className="flex h-full items-end gap-0.5">{bars}</div>;
                        return (
                            <div key={p.month} className="flex h-full flex-1 flex-col justify-end">
                                {p.href ? (
                                    <Link href={p.href} className="block h-full rounded-md hover:bg-accent/50">
                                        {inner}
                                    </Link>
                                ) : (
                                    inner
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
            <div className="mt-1 flex gap-2">
                {points.map((p) => (
                    <div key={p.month} className={cn("flex-1 text-center text-[11px]", p.future ? "text-muted-foreground/70" : "text-muted-foreground")}>
                        {p.label}
                    </div>
                ))}
            </div>
        </div>
    );
}

export function Legend({ series, className }: { series: Series[]; className?: string }) {
    return (
        <div className={cn("flex flex-wrap items-center gap-3 text-xs text-muted-foreground", className)}>
            {series.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5">
                    <span className={cn("inline-block size-2.5 rounded-sm", TONE_BG[s.tone])} />
                    {s.label}
                </span>
            ))}
        </div>
    );
}

/** A coloured dot for health in tables. */
export function HealthDot({ tone, title }: { tone: Tone; title?: string }) {
    return <span className={cn("inline-block size-2.5 rounded-full", TONE_BG[tone])} title={title} aria-label={title} />;
}
