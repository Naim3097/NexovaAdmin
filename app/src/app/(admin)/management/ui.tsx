/**
 * Small presentational helpers shared by the Management tabs.
 * Server components — no state, no effects.
 */
import Link from "next/link";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { SelectNav, type SelectNavOption } from "@/components/select-nav";
import { addMonths, type Health, type LoadBand } from "@/lib/management/metrics";
import { fmtHours } from "@/lib/capacity/helpers";
import { cn } from "@/lib/utils";

/** "Dec 2026" for a YYYY-MM. */
export function shortMonthLabel(ym: string): string {
    if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-MY", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** Team-tab URL for a month; the current month is the default and needs no param. */
export function monthHref(basePath: string, month: string, current: string): string {
    return month === current ? basePath : `${basePath}?month=${month}`;
}

export const HEALTH_DOT: Record<Health, string> = {
    green: "bg-emerald-500",
    amber: "bg-amber-400",
    red: "bg-red-500",
};
export const HEALTH_TEXT: Record<Health, string> = {
    green: "text-emerald-700 dark:text-emerald-400",
    amber: "text-amber-700 dark:text-amber-400",
    red: "text-red-600 dark:text-red-400",
};
export const HEALTH_LABEL: Record<Health, string> = {
    green: "On track",
    amber: "Watch",
    red: "At risk",
};
export const BAND_BAR: Record<LoadBand, string> = {
    idle: "bg-muted-foreground/30",
    light: "bg-emerald-300 dark:bg-emerald-700",
    balanced: "bg-emerald-500",
    heavy: "bg-amber-400",
    overloaded: "bg-red-500",
};
export const BAND_TEXT: Record<LoadBand, string> = {
    idle: "text-muted-foreground",
    light: "text-emerald-700 dark:text-emerald-400",
    balanced: "text-emerald-700 dark:text-emerald-400",
    heavy: "text-amber-700 dark:text-amber-400",
    overloaded: "text-red-600 dark:text-red-400",
};
export const TONE_TEXT = {
    neutral: "",
    good: "text-emerald-700 dark:text-emerald-400",
    warn: "text-amber-700 dark:text-amber-400",
    bad: "text-red-600 dark:text-red-400",
} as const;
export type Tone = keyof typeof TONE_TEXT;

export function fmtMyr(n: number): string {
    return `RM ${Math.round(n).toLocaleString("en-MY")}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
    return `${n} ${n === 1 ? one : many}`;
}

/**
 * Options for the Month dropdown: previous month · this month ("now") · the
 * next three. A selected month outside that range is added so the dropdown
 * never shows a month the page does not. This month is first, so the
 * dropdown reads as unfiltered when it is picked.
 *
 * `opts.allTime` (opt-in, the Dashboard) adds an "All time" option last, with
 * the value ALL_TIME_OPTION (`?month=all`); other callers see no change.
 */
export function monthOptions(
    selected: string,
    today: string,
    basePath: string,
    hrefFor?: (month: string) => string,
    opts?: { allTime?: boolean },
): SelectNavOption[] {
    const current = today.slice(0, 7);
    const link = (m: string) => (hrefFor ? hrefFor(m) : monthHref(basePath, m, current));
    const months = [0, -1, 1, 2, 3].map((d) => addMonths(current, d));
    const isAll = Boolean(opts?.allTime) && selected === ALL_TIME_OPTION;
    if (!isAll && !months.includes(selected)) months.push(selected);
    const options = months.map((m) => ({
        value: m,
        label: m === current ? `${shortMonthLabel(m)} (now)` : shortMonthLabel(m),
        href: link(m),
    }));
    if (opts?.allTime) options.push({ value: ALL_TIME_OPTION, label: "All time", href: link(ALL_TIME_OPTION) });
    return options;
}

/** The Month dropdown's "every month" value, `?month=all` (same string as the Dashboard's ALL_TIME). */
export const ALL_TIME_OPTION = "all";

/** The Month dropdown for the capacity views; picking a month reloads the page on it. */
export function MonthSelect({
    selected,
    today,
    basePath = "",
    hrefFor,
    allTime = false,
    className,
}: {
    /** YYYY-MM being shown, or ALL_TIME_OPTION when `allTime` is on. */
    selected: string;
    /** YYYY-MM-DD; its month is marked "now". */
    today: string;
    /** Path the options link to, e.g. "/management/team". Ignored when `hrefFor` is given. */
    basePath?: string;
    /** Builds the link for a month when the page keeps other params in the URL (the Dashboard). */
    hrefFor?: (month: string) => string;
    /** Offer "All time" as the last option (opt-in). */
    allTime?: boolean;
    className?: string;
}) {
    return <SelectNav label="Month" value={selected} options={monthOptions(selected, today, basePath, hrefFor, { allTime })} className={className} />;
}

/**
 * Load dot for a month cell: green under 85%, amber up to 100%, red over,
 * grey when nothing is planned yet.
 */
export function LoadDot({ pct, tasks, className }: { pct: number; tasks: number; className?: string }) {
    const tone =
        tasks === 0
            ? ["bg-muted-foreground/30", "Nothing planned yet"]
            : pct > 100
              ? ["bg-red-500", `Over · ${pct}%`]
              : pct > 85
                ? ["bg-amber-400", `Full · ${pct}%`]
                : ["bg-emerald-500", `${pct}%`];
    return (
        <span
            aria-label={tone[1]}
            title={tone[1]}
            className={cn("inline-block size-2.5 shrink-0 rounded-full", tone[0], className)}
        />
    );
}

/** A labelled hours figure for the per-member capacity row; the label shows on small screens only (the header row carries it otherwise). */
export function Figure({
    label,
    value,
    tone = "neutral",
    title,
}: {
    label: string;
    value: string;
    tone?: Tone;
    title?: string;
}) {
    return (
        <div className="text-sm tabular-nums" title={title}>
            <span className="text-xs text-muted-foreground md:hidden">{label} </span>
            <span className={cn("font-medium", TONE_TEXT[tone] || "text-foreground")}>{value}</span>
        </div>
    );
}

export function HealthDot({ health, className }: { health: Health; className?: string }) {
    return (
        <span
            aria-label={HEALTH_LABEL[health]}
            title={HEALTH_LABEL[health]}
            className={cn("inline-block size-2.5 shrink-0 rounded-full", HEALTH_DOT[health], className)}
        />
    );
}

export function LoadBar({ pct, band }: { pct: number; band: LoadBand }) {
    const width = Math.max(0, Math.min(100, pct));
    return (
        <div className="flex items-center gap-2">
            <div
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(pct, 100)}
                aria-label={`Load ${pct}%`}
            >
                <div className={cn("h-full rounded-full", BAND_BAR[band])} style={{ width: `${width}%` }} />
            </div>
            <span className={cn("w-10 shrink-0 text-right text-xs font-medium tabular-nums", BAND_TEXT[band])}>
                {pct}%
            </span>
        </div>
    );
}

/** Planned vs available hours for a month: a bar (capped at 100%) with the figures beside it. */
export function HoursBar({
    planned,
    available,
    pct,
    band,
}: {
    planned: number;
    available: number;
    pct: number;
    band: LoadBand;
}) {
    const width = Math.max(0, Math.min(100, pct));
    return (
        <div className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
                <span>
                    <span className="font-medium text-foreground">{fmtHours(planned)}</span>
                    <span className="text-muted-foreground"> / {fmtHours(available)}</span>
                </span>
                <span className={cn("font-medium", BAND_TEXT[band])}>{pct > 999 ? "∞" : `${pct}%`}</span>
            </div>
            <div
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={available}
                aria-valuenow={Math.min(planned, available)}
                aria-label={`${fmtHours(planned)} planned of ${fmtHours(available)} available`}
            >
                <div className={cn("h-full rounded-full", BAND_BAR[band])} style={{ width: `${width}%` }} />
            </div>
        </div>
    );
}

export function ProgressBar({ pct, health = "green" }: { pct: number; health?: Health }) {
    return (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
                className={cn("h-full rounded-full", HEALTH_DOT[health])}
                style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
            />
        </div>
    );
}

export function Chip({
    children,
    tone = "neutral",
    title,
}: {
    children: React.ReactNode;
    tone?: Tone;
    title?: string;
}) {
    const cls = {
        neutral: "bg-muted text-muted-foreground",
        good: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        warn: "bg-amber-400/15 text-amber-700 dark:text-amber-400",
        bad: "bg-red-500/10 text-red-600 dark:text-red-400",
    }[tone];
    return (
        <span
            title={title}
            className={cn("inline-flex h-5 items-center rounded-md px-1.5 text-[11px] font-medium whitespace-nowrap", cls)}
        >
            {children}
        </span>
    );
}

/**
 * One number, a short hint, a status dot and a link. The dot carries the
 * judgement so the number itself stays plain; red is reserved for "act now".
 */
export function StatTile({
    label,
    value,
    hint,
    health,
    href,
    quiet = false,
}: {
    label: string;
    value: string;
    /** About three words. */
    hint?: string;
    health: Health;
    href: string;
    /** Nothing to do here (a green zero): the number steps back so the live tiles stand out. */
    quiet?: boolean;
}) {
    return (
        <Link href={href} className="block" title={HEALTH_LABEL[health]}>
            <Card size="sm" className={cn("h-full gap-1 transition-all hover:shadow-md hover:ring-primary/20", quiet && "bg-card/60 shadow-none")}>
                <CardHeader className="pb-0">
                    <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
                        <HealthDot health={health} />
                    </div>
                </CardHeader>
                <CardContent>
                    <div
                        className={cn(
                            "whitespace-nowrap font-semibold tabular-nums tracking-tight",
                            quiet ? "text-lg text-muted-foreground" : value.length > 9 ? "text-xl" : "text-2xl",
                            health === "red" ? HEALTH_TEXT.red : "",
                        )}
                    >
                        {value}
                    </div>
                    {hint ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p> : null}
                </CardContent>
            </Card>
        </Link>
    );
}

export function KpiTile({
    label,
    value,
    hint,
    hint2,
    hint2Tone = "neutral",
    href,
    tone = "neutral",
}: {
    label: string;
    value: string;
    hint?: string;
    /** Optional second line under the hint, e.g. the next month's figure. */
    hint2?: string;
    hint2Tone?: Tone;
    href: string;
    tone?: Tone;
}) {
    return (
        <Link href={href} className="block">
            <Card className="h-full transition-all hover:shadow-md hover:ring-primary/20">
                <CardHeader className="pb-1">
                    <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className={cn("text-2xl font-semibold tabular-nums tracking-tight", TONE_TEXT[tone])}>
                        {value}
                    </div>
                    {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
                    {hint2 ? (
                        <p className={cn("mt-0.5 text-[11px] tabular-nums", TONE_TEXT[hint2Tone] || "text-muted-foreground")}>{hint2}</p>
                    ) : null}
                </CardContent>
            </Card>
        </Link>
    );
}

export function Section({
    id,
    title,
    description,
    children,
    action,
}: {
    id?: string;
    title: string;
    description?: React.ReactNode;
    children: React.ReactNode;
    action?: React.ReactNode;
}) {
    return (
        <Card id={id}>
            <CardHeader className="border-b">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <CardTitle>{title}</CardTitle>
                        {description ? <CardDescription>{description}</CardDescription> : null}
                    </div>
                    {action}
                </div>
            </CardHeader>
            <CardContent>{children}</CardContent>
        </Card>
    );
}

export function Empty({ children }: { children: React.ReactNode }) {
    return <p className="py-2 text-sm text-muted-foreground">{children}</p>;
}

export function AsOf({ today, children }: { today: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
            <p className="text-sm text-muted-foreground">{children}</p>
            <p className="text-xs text-muted-foreground">As of {today}</p>
        </div>
    );
}
