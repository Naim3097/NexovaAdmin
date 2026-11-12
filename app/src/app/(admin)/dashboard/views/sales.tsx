/**
 * Sales tab: the sales lead's view. Numbers first, then the funnel, the won
 * trend against target, deal age, the per-owner table, lead sources and lost
 * reasons. All maths in @/lib/dashboard/sales; this file only draws. Under
 * All time the trend runs from the first signing and the windows cover every
 * decided deal.
 */
import { BarList, Legend, MonthBars, type BarRow, type MonthPoint, type Series } from "@/components/bars";
import { type DashboardData } from "@/lib/dashboard/data";
import { FIRST_TOUCH_DAYS, STUCK_DAYS, TREND_MONTHS, WINDOW_DAYS, salesSnapshot } from "@/lib/dashboard/sales";
import { fmtMyrShort } from "@/lib/format";
import { Empty, Section, plural } from "@/app/(admin)/management/ui";
import { OwnerTable } from "./sales-owners";
import { TileGrid } from "./tile-grid";

const TREND_SERIES: Series[] = [
    { key: "signed", label: "Signed (MYR)", tone: "green" },
    { key: "lost", label: "Lost (est. MYR)", tone: "muted" },
];

/** "3 · RM 45k" at the end of a bar. */
const countMyr = (count: number, myr: number) => (myr > 0 ? `${count} · ${fmtMyrShort(myr)}` : String(count));

export function SalesView({ data }: { data: DashboardData }) {
    const s = salesSnapshot({
        leads: data.leads,
        quotes: data.quotes,
        contracts: data.external,
        targetMyr: data.agency.salesTargetMyr,
        month: data.month,
        today: data.today,
    });

    const funnel: BarRow[] = s.funnel.map((f) => ({
        key: f.status,
        label: f.label,
        sub: f.fromPrevPct !== null ? `${f.fromPrevPct}% from ${f.prevLabel}` : undefined,
        value: f.count,
        valueLabel: countMyr(f.count, f.myr),
        tone: f.status === "won" ? "green" : "primary",
        href: "/pipeline",
    }));

    const trend: MonthPoint[] = s.trend.map((p) => ({
        month: p.month,
        label: p.label,
        values: { signed: p.signedMyr, lost: p.lostMyr },
        future: p.future,
        href: data.href({ tab: "sales", month: p.month }),
    }));
    const anyTrend = s.trend.some((p) => p.signedMyr > 0 || p.lostMyr > 0);
    // The windowed sections read every deal under All time.
    const windowLabel = s.allTime ? "all time" : `last ${WINDOW_DAYS} days`;
    const inWindow = s.allTime ? "so far" : `in the last ${WINDOW_DAYS} days`;

    const age: BarRow[] = s.age.map((b) => ({
        key: b.key,
        label: b.label,
        value: b.count,
        valueLabel: countMyr(b.count, b.myr),
        tone: b.tone,
        href: "/pipeline",
    }));

    const sources: BarRow[] = s.sources.map((r) => ({
        key: r.source,
        label: r.label,
        value: r.count,
        valueLabel: r.won ? `${r.count} · ${r.won} won` : String(r.count),
        tone: r.won ? "green" : "primary",
        href: "/leads",
    }));

    const lost: BarRow[] = s.lost.map((r) => ({
        key: r.reason || "not-recorded",
        label: r.label,
        value: r.count,
        valueLabel: countMyr(r.count, r.myr),
        tone: r.reason ? "red" : "muted",
        href: "/leads",
    }));

    return (
        <>
            <TileGrid tiles={s.tiles} />

            <div className="grid gap-4 xl:grid-cols-2">
                <Section id="funnel" title="Funnel" description="Deals by stage today; the small figure is how many of the deals that reached the stage before went on to this one. Quoted deals are worth their sent quote.">
                    {s.funnel.every((f) => f.count === 0) ? <Empty>No deals yet — add a lead to start the funnel.</Empty> : <BarList rows={funnel} />}
                </Section>

                <Section
                    id="won-trend"
                    title={s.allTime ? "Won · all time" : `Won · last ${TREND_MONTHS} months`}
                    description={
                        s.targetMyr > 0
                            ? `MYR signed per month (external projects by signing date) against the ${fmtMyrShort(s.targetMyr)} monthly target; the grey bar is the estimated value lost.`
                            : "MYR signed per month (external projects by signing date); the grey bar is the estimated value lost. Set a monthly target in Settings → Agency profile to draw the line."
                    }
                >
                    {anyTrend || s.targetMyr > 0 ? (
                        <>
                            <MonthBars points={trend} series={TREND_SERIES} target={s.targetMyr > 0 ? s.targetMyr : undefined} className="pt-5" />
                            <Legend series={TREND_SERIES} className="mt-3" />
                        </>
                    ) : (
                        <Empty>Nothing signed or lost in these months.</Empty>
                    )}
                </Section>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                <Section id="deal-age" title="Deal age" description="Open deals by days since they arrived; anything past a month needs a decision.">
                    {s.openCount === 0 ? <Empty>No open deals.</Empty> : <BarList rows={age} />}
                </Section>

                <div className="xl:col-span-2">
                    <Section
                        id="owners"
                        title="Deal owners"
                        description={`Open deals and value per owner, what they won in the last ${WINDOW_DAYS} days, and how many of their deals are stuck (no touch in ${STUCK_DAYS} days). Sorted by open value.`}
                    >
                        {s.owners.length === 0 ? <Empty>No deals to own yet.</Empty> : <OwnerTable rows={s.owners} />}
                    </Section>
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <Section id="sources" title={`Lead sources · ${windowLabel}`} description="Where new leads came from, and how many of them have already won.">
                    {s.sources.length === 0 ? <Empty>No leads arrived {inWindow}.</Empty> : <BarList rows={sources} />}
                </Section>

                <Section id="lost-reasons" title={`Lost reasons · ${windowLabel}`} description="Why deals were lost, with the estimated value that went with them. Pick the reason when you mark a deal lost.">
                    {s.lost.length === 0 ? <Empty>No deals lost {inWindow}.</Empty> : <BarList rows={lost} />}
                </Section>
            </div>

            <p className="text-xs text-muted-foreground">
                Win rate and cycle count deals decided {inWindow} by their last touch. First touch flags new leads older than {plural(FIRST_TOUCH_DAYS, "day")}.
            </p>
        </>
    );
}
