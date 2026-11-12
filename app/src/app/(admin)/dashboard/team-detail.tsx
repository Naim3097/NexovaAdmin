/**
 * Team tab detail: the compact People table — one row per active delivery
 * member with their hours, load, tasks, overdue, days off and non-delivery
 * hours for the chosen month (or summed over the planning horizon under All
 * time), heaviest first. Server component — no state.
 */
import Link from "next/link";
import { fmtHours } from "@/lib/capacity/helpers";
import { pctLabel, type TeamPerson } from "@/lib/dashboard/team";
import { cn } from "@/lib/utils";
import { BAND_TEXT, HEALTH_TEXT } from "@/app/(admin)/management/ui";

const TH = "py-2 pr-3 font-medium";
const NUM = "py-2 pr-3 text-right tabular-nums whitespace-nowrap";

/** A count that steps back when it is zero. */
function Count({ n, tone }: { n: number; tone?: "bad" }) {
    if (n === 0) return <span className="text-muted-foreground/60">—</span>;
    return <span className={cn("font-medium", tone === "bad" && HEALTH_TEXT.red)}>{n}</span>;
}

export function TeamPeopleTable({ people, month, allTime = false }: { people: TeamPerson[]; month: string; allTime?: boolean }) {
    // /works with no month filter shows every month, which is what All time means.
    const monthQ = allTime ? "" : `&month=${month}`;
    const when = allTime ? "over the span" : "in the month";
    return (
        <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[46rem] text-sm">
                <thead>
                    <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        <th scope="col" className={TH}>
                            Person
                        </th>
                        <th scope="col" className={TH}>
                            Job
                        </th>
                        <th scope="col" className={cn(TH, "text-right")} title={`Hours available ${when}, days off taken out`}>
                            Available
                        </th>
                        <th scope="col" className={cn(TH, "text-right")} title={`Hours on the shares they hold on tasks ${when}`}>
                            Planned
                        </th>
                        <th scope="col" className={cn(TH, "text-right")} title="Planned ÷ available">
                            Load
                        </th>
                        <th scope="col" className={cn(TH, "text-right")} title={`Tasks ${when} they hold a share of`}>
                            Tasks
                        </th>
                        <th scope="col" className={cn(TH, "text-right")} title="Open tasks past their due date, any month">
                            Overdue
                        </th>
                        <th scope="col" className={cn(TH, "text-right")} title={`Days off ${when}`}>
                            Off days
                        </th>
                        <th scope="col" className={cn("py-2 text-right font-medium")} title="Non-delivery hours a week: work that leaves no task behind">
                            Non-delivery
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {people.map((p) => (
                        <tr key={p.id}>
                            <td className="py-2 pr-3 align-middle">
                                <Link href={p.href} className="font-medium hover:underline">
                                    {p.name}
                                </Link>
                            </td>
                            <td className="py-2 pr-3 align-middle text-muted-foreground">{p.role}</td>
                            <td className={cn(NUM, "text-muted-foreground")}>{fmtHours(p.available)}</td>
                            <td className={cn(NUM, "font-medium", p.over && HEALTH_TEXT.red)}>{fmtHours(p.planned)}</td>
                            <td className={cn(NUM, "font-medium", BAND_TEXT[p.band])}>{pctLabel(p.pct)}</td>
                            <td className={NUM}>
                                <Link href={`/works?member=${encodeURIComponent(p.name)}${monthQ}`} className="hover:underline">
                                    <Count n={p.tasks} />
                                </Link>
                            </td>
                            <td className={NUM}>
                                {p.overdue > 0 ? (
                                    <Link href={`/works?member=${encodeURIComponent(p.name)}&overdue=1`} className="hover:underline">
                                        <Count n={p.overdue} tone="bad" />
                                    </Link>
                                ) : (
                                    <Count n={0} />
                                )}
                            </td>
                            <td className={NUM}>
                                <Count n={p.daysOff} />
                            </td>
                            <td className={cn("py-2 text-right tabular-nums whitespace-nowrap", p.nonDeliveryWeekly > 0 ? "" : "text-muted-foreground/60")}>
                                {p.nonDeliveryWeekly > 0 ? `${fmtHours(p.nonDeliveryWeekly)}/wk` : "—"}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
