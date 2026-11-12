/**
 * A plain line chart for the dashboard, drawn as SVG on the server: no chart
 * library, no client JavaScript. One line per series with a dot per point,
 * light grid lines with three or four y ticks, an optional dashed target
 * line, and point labels underneath (thinned out when there are many).
 * Segments that run into a future point are dashed, and future dots hollow.
 * Every dot carries a <title> ("Nov · Billed RM 25.4k"); a point with an
 * href turns its whole column into a link.
 *
 * Responsive without measuring: the SVG is stretched over its box (viewBox
 * 0–100 both ways, preserveAspectRatio none) and every stroke keeps its screen
 * width through `vector-effect: non-scaling-stroke`. A dot is a zero-length
 * round-capped path, so it stays round however the box is stretched. Text is
 * HTML beside the SVG so it never scales. Colours are the tones of
 * @/components/bars, so a series reads the same as it would as a bar.
 */
import { shortNum, type Series, type Tone } from "@/components/bars";
import { cn } from "@/lib/utils";

export type LinePoint = {
    key: string;
    /** Short label under the column, e.g. "Nov"; also starts each dot's title. */
    label: string;
    /** One value per series key. A missing key draws no dot and breaks that line. */
    values: Partial<Record<string, number>>;
    /** After today: the segment into this point is dashed and its dots hollow. */
    future?: boolean;
    /** Makes the whole column a link (e.g. switch the dashboard to that month). */
    href?: string;
};

export type LineTarget = { value: number; label?: string };

/** Same hues as TONE_BG in @/components/bars, as strokes. */
const TONE_STROKE: Record<Tone, string> = {
    green: "stroke-emerald-500",
    amber: "stroke-amber-500",
    red: "stroke-red-500",
    muted: "stroke-muted-foreground/60",
    primary: "stroke-primary",
};

/** More labels than this under the chart and every other one (or more) is left out. */
const MAX_X_LABELS = 12;
/** Width of the y-tick gutter; the label row is indented by the same. */
const GUTTER = "3rem";

/** 1, 2, 2.5 or 5 times a power of ten, at or above `raw`. */
function niceStep(raw: number): number {
    if (!(raw > 0)) return 1;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const r = raw / mag;
    return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * mag;
}

/** Zero plus two or three round ticks, the top one at or above `max`. */
export function yTicks(max: number): number[] {
    const step = niceStep(max / 3);
    const count = Math.max(1, Math.ceil(max / step - 1e-9));
    return Array.from({ length: count + 1 }, (_, i) => Math.round(i * step * 1000) / 1000);
}

/** Two decimals are plenty in a 0–100 box. */
const f = (n: number) => Math.round(n * 100) / 100;

export function LineChart({
    points,
    series,
    target,
    format = shortNum,
    height = 180,
    label,
    className,
}: {
    points: LinePoint[];
    series: Series[];
    target?: LineTarget;
    /** For the y ticks, the dot titles and the target label. */
    format?: (n: number) => string;
    /** Plot height in px (labels sit outside it). */
    height?: number;
    /** What the chart shows, for screen readers. */
    label?: string;
    className?: string;
}) {
    const n = points.length;
    if (n === 0) return null;

    const valueOf = (p: LinePoint, key: string) => {
        const v = p.values[key];
        return typeof v === "number" && Number.isFinite(v) ? v : null;
    };
    const all = points.flatMap((p) => series.map((s) => valueOf(p, s.key) ?? 0));
    const ticks = yTicks(Math.max(0, target?.value ?? 0, ...all));
    const top = ticks[ticks.length - 1] || 1;
    // Each point sits in the middle of an equal column, so the labels below line up with a plain flex row.
    const x = (i: number) => f(((i + 0.5) / n) * 100);
    const y = (v: number) => f(100 - (Math.max(0, v) / top) * 100);

    // Thin the labels from the newest point back, so the latest month always shows; phones keep every other one.
    const step = Math.ceil(n / MAX_X_LABELS);
    const labelClass = (i: number) => {
        const fromEnd = n - 1 - i;
        if (fromEnd % step !== 0) return "invisible";
        return n > 6 && (fromEnd / step) % 2 === 1 ? "max-sm:invisible" : "";
    };

    const lines = series.map((s) => {
        let solid = "";
        let dashed = "";
        for (let i = 1; i < n; i += 1) {
            const a = valueOf(points[i - 1], s.key);
            const b = valueOf(points[i], s.key);
            if (a === null || b === null) continue;
            const seg = `M${x(i - 1)} ${y(a)}L${x(i)} ${y(b)}`;
            if (points[i].future) dashed += seg;
            else solid += seg;
        }
        return { s, solid, dashed };
    });

    return (
        <div role="figure" aria-label={label} className={cn("w-full pt-2", className)}>
            <div className="relative" style={{ height }}>
                {ticks.map((t) => (
                    <span
                        key={t}
                        className="absolute left-0 -translate-y-1/2 pr-1.5 text-right text-[10px] tabular-nums text-muted-foreground"
                        style={{ top: `${y(t)}%`, width: GUTTER }}
                    >
                        {format(t)}
                    </span>
                ))}
                <div className="absolute inset-y-0 right-0" style={{ left: GUTTER }}>
                    <svg className="block h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                        {ticks.map((t) => (
                            <line key={t} x1={0} x2={100} y1={y(t)} y2={y(t)} className={t === 0 ? "stroke-border" : "stroke-border/60"} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                        ))}
                        {target && target.value > 0 ? (
                            <line x1={0} x2={100} y1={y(target.value)} y2={y(target.value)} className="stroke-foreground/50" strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke">
                                <title>{`${target.label ?? "Target"} ${format(target.value)}`}</title>
                            </line>
                        ) : null}
                        {lines.map(({ s, solid, dashed }) => (
                            <g key={s.key} className={TONE_STROKE[s.tone]} fill="none" strokeLinecap="round" pointerEvents="none">
                                {solid ? <path d={solid} strokeWidth={2} vectorEffect="non-scaling-stroke" /> : null}
                                {dashed ? <path d={dashed} strokeWidth={2} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" /> : null}
                            </g>
                        ))}
                        {points.map((p, i) => {
                            const shown = series.flatMap((s) => {
                                const v = valueOf(p, s.key);
                                return v === null ? [] : [{ s, v }];
                            });
                            const summary = [p.label, ...shown.map(({ s, v }) => `${s.label} ${format(v)}`)].join(" · ");
                            const body = (
                                <>
                                    <rect x={f((i / n) * 100)} y={0} width={f(100 / n)} height={100} className={cn("fill-transparent", p.href && "hover:fill-foreground/5")}>
                                        <title>{summary}</title>
                                    </rect>
                                    {shown.map(({ s, v }) => {
                                        const d = `M${x(i)} ${y(v)}h0`;
                                        return (
                                            <g key={s.key} className={TONE_STROKE[s.tone]} fill="none" strokeLinecap="round">
                                                <title>{`${p.label} · ${s.label} ${format(v)}`}</title>
                                                <path d={d} strokeWidth={7} vectorEffect="non-scaling-stroke" />
                                                {p.future ? <path d={d} strokeWidth={3.5} className="stroke-background" vectorEffect="non-scaling-stroke" /> : null}
                                            </g>
                                        );
                                    })}
                                </>
                            );
                            return p.href ? (
                                <a key={p.key} href={p.href} aria-label={summary}>
                                    {body}
                                </a>
                            ) : (
                                <g key={p.key}>{body}</g>
                            );
                        })}
                    </svg>
                    {target && target.value > 0 ? (
                        <span className="pointer-events-none absolute right-0 -translate-y-full pb-0.5 text-[10px] text-muted-foreground" style={{ top: `${y(target.value)}%` }}>
                            {(target.label ?? "target").toLowerCase()} {format(target.value)}
                        </span>
                    ) : null}
                </div>
            </div>
            <div className="mt-1 flex" style={{ marginLeft: GUTTER }}>
                {points.map((p, i) => (
                    // The label may be wider than its column ("Jan '27" over two dozen months): centre it and let it overflow.
                    <div key={p.key} className={cn("relative h-4 min-w-0 flex-1 text-[11px]", p.future ? "text-muted-foreground/70" : "text-muted-foreground", labelClass(i))}>
                        <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">{p.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
